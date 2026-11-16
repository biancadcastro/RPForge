// Public surface of the animation engine (proposal: docs/animation-engine/INTEGRATION.md).
// Every operation takes bytes/plain data and returns plain data; failures are values
// ({ok:false, error:{code, message, details}}), never partial output.
import {EngineError, ErrorCode, toFailure} from './errors.js';
import {resolveLimits, DEFAULT_LIMITS} from './limits.js';
import {readYcd} from './ycd-read.js';
import {writeSkeletalYcd, PROFILE_ID, PROFILE_LIMITS, DEFAULT_ENCODING} from './ycd-write.js';
import {reencodeYcd, DISCARD_CATEGORIES} from './convert.js';
import {parseSkel, matchAnimation} from './skeleton.js';
import {sampleTrack} from './sample.js';

export const ENGINE = Object.freeze({name: 'rpforge-animation-engine', version: '0.1.0', profiles: [PROFILE_ID]});
export {ErrorCode, DEFAULT_LIMITS, PROFILE_LIMITS, DEFAULT_ENCODING, DISCARD_CATEGORIES};

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
