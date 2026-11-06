// Independent semantic check of a transformation: both sides are evaluated by the
// offline oracle only (the engine reader is not involved).
// Usage: node scripts/animation-engine/compare-oracle-pair.mjs <oracleSourceDir> <oracleOutputDir> <report.json>
// Entries are paired by index. Tracks are matched by (boneTag, track). Source animations
// with several Sequence blocks are mapped with the chunk inference (limit + 1 frames per
// block) and reported separately, because that mapping is the engine's inference.
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const [srcDir, outDir, reportPath] = process.argv.slice(2);
if (!srcDir || !outDir || !reportPath) { console.error('usage: compare-oracle-pair.mjs <src> <out> <report.json>'); process.exit(2); }
// Justification (PROFILE.md §Tolerances): quantization bound 1e-4 m per position component;
// 5e-5 per quaternion component -> angle <= 2*|dq| <= 2e-4 rad, plus float32 slack.
const POSITION_TOLERANCE = 1e-4 + 1e-6, ANGLE_TOLERANCE = 2.5e-4;
const load = dir => JSON.parse(readFileSync(join(dir, 'oracle.json'), 'utf8'));
const S = load(srcDir), O = load(outDir);
function tracksOf(dir, entry) {
  const bin = readFileSync(join(dir, `${entry.index}.bin`)), fv = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
  const a = entry.result.animations[0];
  // Oracle dump layout: block -> track -> local frame -> xyzw. Build global-frame arrays.
  const chunk = a.blocks.length === 1 ? a.frames : a.limit + 1, out = new Map();
  let cursor = 0;
  a.blocks.forEach((b, bi) => a.tracks.forEach(([bone, track, type]) => {
    const key = `${bone}:${track}`;
    if (!out.has(key)) out.set(key, {type, values: new Float32Array(a.frames * 4).fill(NaN)});
    const v = out.get(key).values;
    for (let l = 0; l < b.frames; l++, cursor += 4) { const g = bi * chunk + l; if (l < chunk && g < a.frames) v.set(fv.subarray(cursor, cursor + 4), g * 4); }
  }));
  return {anim: a, tracks: out, multiBlock: a.blocks.length > 1};
}
const angle = (p, i, q, j) => {
  const lp = Math.hypot(p[i], p[i + 1], p[i + 2], p[i + 3]), lq = Math.hypot(q[j], q[j + 1], q[j + 2], q[j + 3]);
  const d = Math.min(1, Math.abs(p[i] * q[j] + p[i + 1] * q[j + 1] + p[i + 2] * q[j + 2] + p[i + 3] * q[j + 3]) / (lp * lq));
  return 2 * Math.acos(d);
};
const rows = [];
const sources = new Map(S.files.map(f => [f.index, f]));
for (const o of O.files) {
  const s = sources.get(o.index), row = {index: o.index, source: s?.path.split(/[\\/]/).pop()};
  rows.push(row);
  if (!s?.ok || !o.ok) { row.verdict = 'oracle-failed'; row.error = s?.error ?? o.error; continue; }
  const A = tracksOf(srcDir, s), B = tracksOf(outDir, o);
  row.multiBlockSource = A.multiBlock;
  const problems = [];
  if (A.anim.frames !== B.anim.frames) problems.push('frames');
  if (Math.abs(A.anim.duration - B.anim.duration) > 1e-6) problems.push('duration');
  let maxPos = 0, maxAng = 0, n = 0;
  for (const [key, tb] of B.tracks) {
    const ta = A.tracks.get(key);
    if (!ta) { problems.push(`track ${key} not in source`); continue; }
    for (let f = 0; f < B.anim.frames; f++) {
      if (tb.type === 1) maxAng = Math.max(maxAng, angle(ta.values, f * 4, tb.values, f * 4));
      else for (let c = 0; c < 3; c++) maxPos = Math.max(maxPos, Math.abs(ta.values[f * 4 + c] - tb.values[f * 4 + c]));
      n++;
    }
  }
  const dropped = [...A.tracks.keys()].filter(k => !B.tracks.has(k));
  Object.assign(row, {tracks: B.tracks.size, droppedTracks: dropped.length, droppedTrackIds: [...new Set(dropped.map(k => k.split(':')[1]))], samples: n, maxPositionError: maxPos, maxAngleError: maxAng});
  if (!(maxPos <= POSITION_TOLERANCE)) problems.push('position above tolerance');
  if (!(maxAng <= ANGLE_TOLERANCE)) problems.push('angle above tolerance');
  row.problems = problems; row.verdict = problems.length ? 'mismatch' : 'match';
}
const group = list => ({files: list.length, match: list.filter(r => r.verdict === 'match').length, maxPositionError: Math.max(0, ...list.map(r => r.maxPositionError ?? 0)), maxAngleError: Math.max(0, ...list.map(r => r.maxAngleError ?? 0)), samples: list.reduce((s, r) => s + (r.samples ?? 0), 0)});
const summary = {tolerances: {position: POSITION_TOLERANCE, angleRadians: ANGLE_TOLERANCE}, singleBlockSources: group(rows.filter(r => r.multiBlockSource === false)), multiBlockSources: group(rows.filter(r => r.multiBlockSource === true)), oracleFailed: rows.filter(r => r.verdict === 'oracle-failed').length};
writeFileSync(reportPath, JSON.stringify({summary, files: rows}, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exit(rows.some(r => r.verdict !== 'match') ? 1 : 0);
