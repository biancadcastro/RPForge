// Time sampling and semantic comparison of decoded animations.
// Time convention (reference GetFramePosition): t in [0, duration] maps linearly to
// frame position u = t / duration * (frames - 1); vectors lerp, quaternions nlerp with
// hemisphere alignment. Times outside [0, duration] are clamped (no looping here).
import {ErrorCode, ensure} from './errors.js';
import {nlerp, angleBetween} from './quat.js';

export function framePosition(animation, t) {
  const {frames, duration} = animation;
  ensure(Number.isFinite(t), ErrorCode.INVALID_INPUT, 'Sample time must be finite');
  if (frames < 2 || !(duration > 0)) return {f0: 0, f1: 0, alpha: 0};
  const u = Math.min(Math.max(t, 0), duration) / duration * (frames - 1);
  const f0 = Math.min(Math.floor(u), frames - 1);
  return {f0, f1: Math.min(f0 + 1, frames - 1), alpha: u - f0};
}

/** Value of one track at time t: [x,y,z] or [x,y,z,w] (normalized) or [v]. */
export function sampleTrack(animation, track, t) {
  const {f0, f1, alpha} = framePosition(animation, t), n = track.components, s = track.samples, out = new Array(n);
  if (track.kind === 'quaternion') { nlerp(s, f0 * 4, s, f1 * 4, alpha, out, 0); return out; }
  for (let c = 0; c < n; c++) out[c] = s[f0 * n + c] + (s[f1 * n + c] - s[f0 * n + c]) * alpha;
  return out;
}

/**
 * Compare two decoded animations track by track at every frame and at the
 * midpoints between frames (interpolation). Tracks are matched by (boneTag, track),
 * never by file index. Returns per-kind maxima and the list of structural differences.
 */
export function compareAnimations(a, b, {midpoints = true} = {}) {
  const diffs = [];
  if (a.frames !== b.frames) diffs.push({field: 'frames', a: a.frames, b: b.frames});
  if (Math.abs(a.duration - b.duration) > 1e-6) diffs.push({field: 'duration', a: a.duration, b: b.duration});
  const key = t => `${t.boneTag}:${t.track}`;
  const mb = new Map(b.tracks.map(t => [key(t), t]));
  const result = {tracks: 0, maxPositionError: 0, maxAngleError: 0, maxScalarError: 0, worst: null};
  for (const ta of a.tracks) {
    const tb = mb.get(key(ta));
    if (!tb) { diffs.push({field: 'track', missingIn: 'b', boneTag: ta.boneTag, track: ta.track}); continue; }
    mb.delete(key(ta));
    if (ta.kind !== tb.kind || ta.components !== tb.components) { diffs.push({field: 'kind', boneTag: ta.boneTag, track: ta.track, a: ta.kind, b: tb.kind}); continue; }
    result.tracks++;
    const times = [];
    if (a.frames === b.frames && a.duration > 0) for (let f = 0; f < a.frames; f++) { times.push(f / (a.frames - 1) * a.duration); if (midpoints && f + 1 < a.frames) times.push((f + 0.5) / (a.frames - 1) * a.duration); }
    else times.push(0);
    for (const t of times) {
      const va = sampleTrack(a, ta, t), vb = sampleTrack(b, tb, t);
      let err, slot;
      if (ta.kind === 'quaternion') { err = angleBetween(va, 0, vb, 0); slot = 'maxAngleError'; }
      else { err = 0; for (let c = 0; c < va.length; c++) err = Math.max(err, Math.abs(va[c] - vb[c])); slot = ta.components === 3 ? 'maxPositionError' : 'maxScalarError'; }
      if (err > result[slot]) { result[slot] = err; if (!result.worst || slot === result.worst.slot) result.worst = {slot, boneTag: ta.boneTag, track: ta.track, time: t, error: err}; }
    }
  }
  for (const tb of mb.values()) diffs.push({field: 'track', missingIn: 'a', boneTag: tb.boneTag, track: tb.track});
  return {...result, diffs};
}
