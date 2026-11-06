// Compare the engine reader with the offline oracle's own evaluation.
// Usage: node scripts/animation-engine/compare-oracle.mjs <oracleDir> <report.json> [--expect-all]
//  1. external/own file -> engine reader vs oracle EvaluateVector, every block/track/local frame;
//  2. structure: frames, duration, limit, flags, (boneTag, track, dataType) list, clips;
//  3. oracle re-save (oracle-<n>.ycd, when present) -> engine reader (strict, then inspect)
//     -> semantic comparison with the original (tracks matched by boneTag/track).
// Exit code 1 when any compared file mismatches (or, with --expect-all, is refused).
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {readYcd} from '../../src/animation-engine/ycd-read.js';
import {compareAnimations} from '../../src/animation-engine/sample.js';
import {angleBetween} from '../../src/animation-engine/quat.js';

const [dir, outPath, flag] = process.argv.slice(2);
if (!dir || !outPath) { console.error('usage: compare-oracle.mjs <oracleDir> <report.json> [--expect-all]'); process.exit(2); }
const COMPONENT_TOLERANCE = 1e-6;   // same float32 formulas on both sides: expect ~0
const oracle = JSON.parse(readFileSync(join(dir, 'oracle.json'), 'utf8'));
const rows = [];
let mismatches = 0, refused = 0, compared = 0;
for (const entry of oracle.files) {
  const row = {index: entry.index, file: entry.path.split(/[\\/]/).pop(), oracle: entry.ok ? 'read' : 'failed'};
  rows.push(row);
  let mine;
  try { mine = readYcd(readFileSync(entry.path)); row.engine = 'read'; row.engineNotes = [...new Set(mine.notes.map(n => n.path.replace(/\[\d+\]/g, '[]')))]; }
  catch (e) { row.engine = 'refused'; row.engineError = {code: e.code, message: e.message}; refused++; }
  if (!entry.ok) { row.oracleError = entry.error; continue; }
  if (!mine) continue;
  compared++;
  const problems = [];
  const res = entry.result, bin = readFileSync(join(dir, `${entry.index}.bin`));
  const fv = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
  let cursor = 0, maxComp = 0, maxAngle = 0, values = 0;
  const byHash = new Map(mine.animations.map(a => [a.hash, a]));
  for (const oa of res.animations) {
    const a = byHash.get(oa.hash);
    if (!a) { problems.push(`animation ${oa.hash} missing`); cursor += oa.blocks.reduce((s, b) => s + b.frames, 0) * oa.tracks.length * 4; continue; }
    if (a.frames !== oa.frames) problems.push(`frames ${a.frames}/${oa.frames}`);
    if (Math.fround(a.duration) !== Math.fround(oa.duration)) problems.push(`duration ${a.duration}/${oa.duration}`);
    if (a.sequenceFrameLimit !== oa.limit || a.flags !== oa.flags) problems.push('limit/flags');
    oa.tracks.forEach(([bone, track, unk0], i) => { const t = a.tracks[i]; if (!t || t.boneTag !== bone || t.track !== track || t.dataType !== unk0) problems.push(`track ${i} identity`); });
    const chunk = oa.blocks.length === 1 ? a.frames : a.sequenceFrameLimit + 1;
    oa.blocks.forEach((ob, b) => {
      for (let i = 0; i < oa.tracks.length; i++) {
        const t = a.tracks[i];
        for (let l = 0; l < ob.frames; l++, cursor += 4) {
          const g = b * chunk + l;
          if (g >= a.frames || l >= chunk) continue;           // frames beyond the animation (oversized single block)
          const n = t.components, o = [fv[cursor], fv[cursor + 1], fv[cursor + 2], fv[cursor + 3]];
          for (let c = 0; c < n; c++) {
            const d = Math.abs(o[c] - t.samples[g * n + c]);
            if (!(d <= COMPONENT_TOLERANCE)) { if (problems.length < 8) problems.push(`value track ${i} frame ${g} comp ${c}: ${t.samples[g * n + c]} vs ${o[c]}`); }
            maxComp = Math.max(maxComp, Number.isFinite(d) ? d : Infinity); values++;
          }
          if (t.kind === 'quaternion') maxAngle = Math.max(maxAngle, angleBetween(o, 0, t.samples, g * 4));
        }
      }
    });
  }
  const clipNames = new Map(mine.clips.map(c => [c.hash, c]));
  for (const oc of res.clips) {
    const c = clipNames.get(oc.hash);
    if (!c || c.name !== oc.name) problems.push(`clip ${oc.hash} name`);
    else if (oc.type === 1 && c.animation && (Math.fround(c.start) !== Math.fround(oc.start) || Math.fround(c.end) !== Math.fround(oc.end) || Math.fround(c.rate) !== Math.fround(oc.rate) || c.animation.hash !== oc.animation)) problems.push(`clip ${oc.name} timing/reference`);
  }
  Object.assign(row, {valuesCompared: values, maxComponentDiff: maxComp, maxQuaternionAngleDiff: maxAngle, valueMatch: problems.length === 0, problems});
  if (problems.length) mismatches++;
  if (res.saved) {
    const savedPath = join(dir, res.saved);
    const saved = readFileSync(savedPath);
    row.oracleSavedBytes = saved.length;
    let again, mode = 'strict';
    try { again = readYcd(saved, {strict: true}); }
    catch (e) { row.resaveStrictRefusal = {code: e.code, message: e.message}; mode = 'inspect'; try { again = readYcd(saved); } catch (e2) { row.resave = {verdict: 'refused', code: e2.code, message: e2.message}; mismatches++; } }
    if (again) {
      const cmp = mine.animations.map(a => { const b = again.animations.find(x => x.hash === a.hash); return b ? compareAnimations(a, b) : {diffs: [{field: 'animation missing'}]}; });
      const diffs = cmp.flatMap(c => c.diffs);
      row.resave = {verdict: diffs.length ? 'mismatch' : 'match', readMode: mode, maxPositionError: Math.max(...cmp.map(c => c.maxPositionError ?? 0)), maxAngleError: Math.max(...cmp.map(c => c.maxAngleError ?? 0)), diffs: diffs.slice(0, 5)};
      if (diffs.length || row.resave.maxPositionError > 1e-6 || row.resave.maxAngleError > 1e-5) { row.resave.verdict = 'mismatch'; mismatches++; }
    }
  }
}
const summary = {files: oracle.files.length, oracleRead: oracle.files.filter(f => f.ok).length, engineRefused: refused, compared, mismatches,
  resaved: rows.filter(r => r.resave).length, resaveMatch: rows.filter(r => r.resave?.verdict === 'match').length, resaveStrict: rows.filter(r => r.resave?.readMode === 'strict').length,
  componentTolerance: COMPONENT_TOLERANCE, maxComponentDiff: Math.max(0, ...rows.map(r => r.maxComponentDiff ?? 0)), maxQuaternionAngleDiff: Math.max(0, ...rows.map(r => r.maxQuaternionAngleDiff ?? 0)),
  valuesCompared: rows.reduce((s, r) => s + (r.valuesCompared ?? 0), 0)};
writeFileSync(outPath, JSON.stringify({oracle: oracle.oracle, generatedAt: new Date().toISOString(), summary, files: rows}, null, 1));
console.log(JSON.stringify(summary, null, 1));
process.exit(mismatches || (flag === '--expect-all' && refused) ? 1 : 0);
