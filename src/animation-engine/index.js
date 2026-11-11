// Public surface of the animation engine (proposal: docs/animation-engine/INTEGRATION.md).
// Every operation takes bytes/plain data and returns plain data; failures are values
// ({ok:false, error:{code, message, details}}), never partial output.
import {EngineError, ErrorCode, toFailure} from './errors.js';
import {resolveLimits, DEFAULT_LIMITS} from './limits.js';
import {readYcd} from './ycd-read.js';
import {writeSkeletalYcd, PROFILE_ID, PROFILE_LIMITS, DEFAULT_ENCODING} from './ycd-write.js';
import {reencodeYcd, DISCARD_CATEGORIES} from './convert.js';
import {parseSkel, matchAnimation} from './skeleton.js';
import {sampleTrack, compareAnimations} from './sample.js';
import {parseFbx, FBX_LIMITS} from './fbx-parse.js';
import {buildScene, prepareTake} from './fbx-scene.js';
import {mapBones, aliasTable} from './fbx-bone-map.js';
import {convertScene, resolveSkeleton, timing, FBX_PROFILE_ID, DEFAULT_FPS} from './fbx-convert.js';
import {warning, describeError, WARNING_CODES} from './fbx-messages.js';

export const ENGINE = Object.freeze({name: 'rpforge-animation-engine', version: '0.1.0', profiles: [PROFILE_ID]});
export {ErrorCode, DEFAULT_LIMITS, PROFILE_LIMITS, DEFAULT_ENCODING, DISCARD_CATEGORIES};
export {FBX_LIMITS, FBX_PROFILE_ID, WARNING_CODES as FBX_WARNING_CODES, aliasTable as fbxBoneAliases, describeError};

function checkSignal(signal) {
  if (signal?.aborted) throw new EngineError(ErrorCode.CANCELLED, 'Operation cancelled');
}
function run(options, body) {
  const started = performance.now();
  try {
    checkSignal(options?.signal);
    const result = body();
    checkSignal(options?.signal);
    return {ok: true, engine: ENGINE, ...result, metrics: {wallMs: performance.now() - started}};
  } catch (error) {
    return {...toFailure(error), engine: ENGINE, metrics: {wallMs: performance.now() - started}};
  }
}
const trackSummary = t => ({boneTag: t.boneTag, track: t.track, trackName: t.trackName, dataType: t.dataType, kind: t.kind, encoding: t.encoding});
function summarize(model) {
  return {
    envelope: model.envelope, notes: model.notes,
    clips: model.clips.map(c => ({name: c.name, shortName: c.shortName, hash: c.hash, type: c.type, hasTags: c.hasTags, hasProperties: c.hasProperties, start: c.start, end: c.end, rate: c.rate, animationHash: c.animation?.hash})),
    animations: model.animations.map(a => ({hash: a.hash, frames: a.frames, duration: a.duration, blockCount: a.blockCount, flags: a.flags, hasMoverTracks: a.hasMoverTracks, tracks: a.tracks.map(trackSummary)})),
  };
}

/** ycd.inspect: structure, support verdict and notes. No samples. */
export function inspectYcd(bytes, options = {}) {
  return run(options, () => {
    const model = readYcd(bytes, {limits: options.limits});
    return {...summarize(model), strictProfile: model.notes.length === 0 ? PROFILE_ID : null};
  });
}

/** ycd.decode: decoded samples (Float32Array per track), optionally sampled at given times. */
export function decodeYcd(bytes, options = {}) {
  return run(options, () => {
    const model = readYcd(bytes, {limits: options.limits, strict: options.strict === true});
    const out = summarize(model);
    out.animations.forEach((a, i) => {
      const src = model.animations[i];
      a.tracks.forEach((t, j) => { t.samples = src.tracks[j].samples; if (options.times) t.sampled = options.times.map(time => sampleTrack(src, src.tracks[j], time)); });
    });
    return out;
  });
}

/** ycd.write: profile input -> YCD bytes, verified by a strict re-read. */
export function writeYcd(animation, options = {}) {
  return run(options, () => {
    const {bytes, report} = writeSkeletalYcd(animation, {encoding: options.encoding, limits: options.limits});
    checkSignal(options.signal);
    readYcd(bytes, {strict: true, limits: options.limits});
    return {bytes, report};
  });
}

/** ycd.reencode: one clip of an existing YCD -> profile YCD, with explicit discards. */
export function reencode(bytes, options = {}) {
  return run(options, () => reencodeYcd(bytes, options));
}

/** skeleton.match: which bone tracks of a YCD exist in a reference skeleton (.skel text). */
export function matchSkeleton(bytes, skelText, options = {}) {
  return run(options, () => {
    const skel = parseSkel(skelText), model = readYcd(bytes, {limits: options.limits});
    return {skeleton: {bones: skel.bones.length}, animations: model.animations.map(a => ({hash: a.hash, ...matchAnimation(skel, a, {require: options.require === true})}))};
  });
}

export {resolveLimits};

// ---------------------------------------------------------------------------------
// FBX import (profile `fbx-skel-v1`, docs/animation-engine/FBX-AND-RETARGET.md).
// Same contract as the operations above; failures also carry `error.userMessage`,
// a plain-language pt-BR sentence for the person (the code stays the stable contract).
function runFbx(options, body) {
  const result = run(options, body);
  if (!result.ok) result.error.userMessage = describeError(result.error);
  return result;
}
const TRACK_IDS = {position: 0, rotation: 1, moverPosition: 5, moverRotation: 6};
const AXIS_NAMES = ['X', 'Y', 'Z'];

/**
 * fbx.inspect: what the file contains and whether it can be converted, without converting.
 * options: {skeleton, boneMap, fps, limits, signal}
 * -> {format, version, settings, takes[], bones[], mapping, hasBindPose, convertible, issues[], warnings[]}
 */
export function inspectFbx(bytes, options = {}) {
  return runFbx(options, () => {
    const scene = buildScene(parseFbx(bytes, {limits: options.limits}));
    checkSignal(options.signal);
    const target = resolveSkeleton(options.skeleton), {settings} = scene;
    const candidates = scene.models.filter(m => m.isBoneCandidate);
    const issues = [], warnings = [];
    const issue = (code, details) => issues.push({code, message: describeError({code, details}), ...(details ? {details} : {})});
    const mapping = mapBones(scene, target.skel, options.boneMap);
    const mappedBy = new Map(mapping.pairs.map(p => [p.source, p]));
    if (!candidates.length) issue(ErrorCode.FBX_NO_SKELETON);
    else if (!mapping.pairs.length) issue(ErrorCode.BONE_MAP_INSUFFICIENT);
    const takes = scene.takes.map(take => {
      checkSignal(options.signal);
      const prepared = prepareTake(scene, take), t = timing(prepared, settings.fps, options.fps);
      let problem = null;
      if (!prepared.hasCurves) problem = {code: ErrorCode.FBX_NO_ANIMATION};
      else if (prepared.stats.extraLayers) problem = {code: ErrorCode.FBX_UNSUPPORTED_FEATURE, details: {feature: 'layers'}};
      else if (t.frames > PROFILE_LIMITS.maxFrames) problem = {code: ErrorCode.ANIMATION_TOO_LONG, details: {frames: t.frames, max: PROFILE_LIMITS.maxFrames, seconds: t.sourceDuration, maxSeconds: (PROFILE_LIMITS.maxFrames - 1) / t.fps}};
      return {index: take.index, name: take.name, duration: t.sourceDuration, sourceFps: settings.fps, fps: t.fps, frames: t.frames,
        animatedBones: [...prepared.channels.keys()].filter(i => scene.models[i].isBoneCandidate).length, curves: prepared.stats.curves, keys: prepared.stats.keys,
        convertible: problem === null, ...(problem ? {issue: {...problem, message: describeError(problem)}} : {})};
    });
    if (!takes.length) issue(ErrorCode.FBX_NO_ANIMATION);
    else if (!takes.some(t => t.convertible)) issues.push(takes[0].issue);
    if (takes.length > 1) warnings.push(warning('FBX_MULTIPLE_TAKES', {count: takes.length, used: takes[0].name}));
    if (mapping.unmapped.length) warnings.push(warning('FBX_UNMAPPED_BONES', {count: mapping.unmapped.length}));
    if (mapping.conflicts.length) warnings.push(warning('FBX_DUPLICATE_BONE_MATCH', {count: mapping.conflicts.length}));
    if (mapping.pairs.length > 0 && mapping.pairs.length < 8) warnings.push(warning('FBX_FEW_BONES_MAPPED', {count: mapping.pairs.length}));
    const hasBindPose = mapping.pairs.length > 0 && mapping.pairs.every(p => scene.bindPose.has(p.source));
    if (mapping.pairs.length > 0 && !hasBindPose) warnings.push(warning('FBX_REST_FROM_DEFAULTS'));
    return {
      profile: FBX_PROFILE_ID, format: scene.format, version: scene.version,
      settings: {upAxis: AXIS_NAMES[settings.upAxis], upAxisSign: settings.upAxisSign, frontAxis: AXIS_NAMES[settings.frontAxis], frontAxisSign: settings.frontAxisSign, unitScaleFactor: settings.unitScaleFactor, fps: settings.fps, fpsDeclared: settings.fpsDeclared},
      takes,
      bones: candidates.map(m => ({name: m.name, parent: m.parent >= 0 ? scene.models[m.parent].name : null, type: m.type, target: mappedBy.get(m.index)?.targetName ?? null, via: mappedBy.get(m.index)?.via ?? null})),
      mapping: {skeleton: target.id, mapped: mapping.pairs.length, unmapped: mapping.unmapped, duplicates: mapping.conflicts.map(c => c.sourceName), excluded: mapping.excluded},
      hasBindPose, defaultFps: DEFAULT_FPS, convertible: issues.length === 0, issues, warnings,
    };
  });
}

/**
 * fbx.convert: FBX bytes -> YCD bytes (profile `ycd-skel-v1`) plus a report for review.
 * options: {skeleton ('male' default | 'female' | .skel text | {bones}), take (name | index),
 *   clipName, rootMotion (false/'keep' default | true/'mover'), boneMap ({source: target | null}),
 *   fps (30 default | 1..120 | 'source'), alignRestPose (true), encoding, limits, signal}
 * -> {ycd: Uint8Array, report}. The YCD is re-read in strict mode and compared with the
 * converted tracks before it is returned; nothing partial is ever returned.
 */
export function convertFbxToYcd(bytes, options = {}) {
  return runFbx(options, () => {
    const scene = buildScene(parseFbx(bytes, {limits: options.limits}));
    checkSignal(options.signal);
    const {input, report} = convertScene(scene, resolveSkeleton(options.skeleton), options);
    checkSignal(options.signal);
    const written = writeSkeletalYcd(input, {encoding: options.encoding});
    checkSignal(options.signal);
    const decoded = readYcd(written.bytes, {strict: true}).animations[0];
    const reference = {frames: input.frames, duration: (input.frames - 1) / input.fps, tracks: input.tracks.map(t => {
      const rotation = t.type.endsWith('otation');
      return {boneTag: t.bone, track: TRACK_IDS[t.type], kind: rotation ? 'quaternion' : 'vector', components: rotation ? 4 : 3, samples: t.values};
    })};
    const verification = compareAnimations(reference, decoded, {midpoints: false});
    if (verification.diffs.length || verification.maxAngleError > 1e-3 || verification.maxPositionError > 1e-3) {
      throw new EngineError(ErrorCode.INCONSISTENT_REFERENCE, 'Written animation does not match the converted tracks', {diffs: verification.diffs.slice(0, 8), maxAngleError: verification.maxAngleError, maxPositionError: verification.maxPositionError});
    }
    return {ycd: written.bytes, report: {...report, output: {...report.output, bytes: written.bytes.length}, verification: {maxAngleError: verification.maxAngleError, maxPositionError: verification.maxPositionError, tracks: verification.tracks}}};
  });
}
