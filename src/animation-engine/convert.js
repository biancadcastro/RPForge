// Decoded animation -> skeletal profile input, and the `ycd.reencode` operation.
// Nothing is dropped silently: every track or metadata item outside the profile
// either refuses the operation or is listed in `discarded` because the caller named
// its category in `options.discard`.
import {ErrorCode, EngineError, ensure} from './errors.js';
import {readYcd} from './ycd-read.js';
import {writeSkeletalYcd, PROFILE_LIMITS} from './ycd-write.js';
import {compareAnimations} from './sample.js';

const TRACK_BY_ID = {0: 'position', 1: 'rotation', 5: 'moverPosition', 6: 'moverRotation'};
export const DISCARD_CATEGORIES = Object.freeze(['clipTags', 'clipProperties', 'unsupportedTracks', 'animationMetadata', 'otherClips']);

/** Profile input from one decoded clip. */
export function profileInputFromClip(clip, {discard = [], name} = {}) {
  ensure(clip?.animation, ErrorCode.UNSUPPORTED_STRUCTURE, 'Clip has no single animation');
  const a = clip.animation, discarded = [];
  const allow = c => discard.includes(c);
  ensure(a.frames >= PROFILE_LIMITS.minFrames && a.frames <= PROFILE_LIMITS.maxFrames, ErrorCode.LIMIT_EXCEEDED, 'Frame count outside profile', {frames: a.frames});
  ensure(clip.start === 0 && Math.fround(clip.end) === Math.fround(a.duration) && clip.rate === 1, ErrorCode.UNSUPPORTED_STRUCTURE, 'Clip start/end/rate outside profile', {start: clip.start, end: clip.end, rate: clip.rate});
  for (const [flag, cat] of [['hasTags', 'clipTags'], ['hasProperties', 'clipProperties']]) {
    if (clip[flag]) { ensure(allow(cat), ErrorCode.UNSUPPORTED_STRUCTURE, `Clip carries ${cat}; pass discard:['${cat}'] to drop them`, {category: cat}); discarded.push({category: cat}); }
  }
  const meta = {flags: a.flags !== (a.hasMoverTracks ? 16 : 0) ? a.flags : undefined, unknown1C: a.unknown1C || undefined, sequenceHashes: a.blocks.some(b => b.unknown00) || undefined};
  if (Object.values(meta).some(v => v !== undefined)) {
    ensure(allow('animationMetadata'), ErrorCode.UNKNOWN_FIELD, "Animation metadata outside profile; pass discard:['animationMetadata'] to drop it", meta);
    discarded.push({category: 'animationMetadata', ...meta});
  }
  const tracks = [];
  for (const t of a.tracks) {
    const type = TRACK_BY_ID[t.track];
    const ok = type && ((type.endsWith('otation') && t.kind === 'quaternion') || (!type.endsWith('otation') && t.components === 3)) && (t.track < 5 || t.boneTag === 0);
    if (!ok) {
      ensure(allow('unsupportedTracks'), ErrorCode.UNSUPPORTED_STRUCTURE, "Track outside profile; pass discard:['unsupportedTracks'] to drop it", {boneTag: t.boneTag, track: t.track, kind: t.kind});
      discarded.push({category: 'unsupportedTracks', boneTag: t.boneTag, track: t.track, kind: t.kind});
      continue;
    }
    tracks.push({bone: t.boneTag, type, values: t.samples});
  }
  ensure(tracks.length > 0, ErrorCode.UNSUPPORTED_STRUCTURE, 'No profile tracks left');
  return {input: {name: name ?? clip.shortName, frames: a.frames, duration: a.duration, tracks}, discarded};
}

/**
 * Re-encode one clip of a YCD into the skeletal profile and verify the result by
 * decoding it again (strict) and comparing semantically with the source clip.
 */
export function reencodeYcd(bytes, options = {}) {
  const discard = options.discard ?? [];
  ensure(Array.isArray(discard) && discard.every(d => DISCARD_CATEGORIES.includes(d)), ErrorCode.INVALID_INPUT, 'Unknown discard category');
  const source = readYcd(bytes, {limits: options.limits});
  const clips = source.clips.filter(c => c.animation);
  let clip;
  if (options.clip !== undefined) clip = source.clips.find(c => c.shortName === options.clip || c.name === options.clip);
  else {
    ensure(clips.length === 1 || discard.includes('otherClips'), ErrorCode.UNSUPPORTED_STRUCTURE, 'Several clips: select one with options.clip', {clips: source.clips.map(c => c.shortName)});
    clip = clips[0];
  }
  ensure(clip?.animation, ErrorCode.INVALID_INPUT, 'Selected clip not found or not a single-animation clip');
  if (source.clips.length > 1) ensure(discard.includes('otherClips') || options.clip !== undefined, ErrorCode.UNSUPPORTED_STRUCTURE, 'Other clips would be dropped');
  const {input, discarded} = profileInputFromClip(clip, {discard, name: options.name});
  if (source.clips.length > 1) discarded.push({category: 'otherClips', count: source.clips.length - 1});
  const written = writeSkeletalYcd(input, {encoding: options.encoding, limits: options.limits});
  const check = readYcd(written.bytes, {strict: true, limits: options.limits});
  const kept = {...clip.animation, tracks: clip.animation.tracks.filter(t => input.tracks.some(x => x.bone === t.boneTag && TRACK_BY_ID[t.track] === x.type))};
  const verification = compareAnimations(kept, check.animations[0]);
  if (verification.diffs.length) throw new EngineError(ErrorCode.INCONSISTENT_REFERENCE, 'Re-encoded animation does not match its source structurally', {diffs: verification.diffs.slice(0, 8)});
  return {bytes: written.bytes, report: written.report, discarded, verification};
}
