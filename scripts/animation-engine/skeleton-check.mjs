// Relate decoded animations to reference skeletons (.skel text). Local, read-only.
// Usage: node scripts/animation-engine/skeleton-check.mjs <skelA> [<skelB>...] -- <list.txt> <report.json>
// Reports, per skeleton: parse/validation, tag-vs-name hash agreement, and over the listed
// YCDs: bones missing from the skeleton, and how animated values relate to rest values
// (static position tracks vs LocalOffset; frame-0 rotations vs RotationQuaternion).
import {readFileSync, writeFileSync} from 'node:fs';
import {parseSkel, tagNameMismatches, matchAnimation} from '../../src/animation-engine/skeleton.js';
import {readYcd} from '../../src/animation-engine/ycd-read.js';
import {angleBetween} from '../../src/animation-engine/quat.js';

const args = process.argv.slice(2), sep = args.indexOf('--');
const skelPaths = args.slice(0, sep), [listPath, reportPath] = args.slice(sep + 1);
const files = readFileSync(listPath, 'utf8').split(/\r?\n/).filter(Boolean);
const anims = [];
for (const p of files) { try { for (const a of readYcd(readFileSync(p)).animations) anims.push(a); } catch { /* refused files are covered by the survey */ } }
const report = {animations: anims.length, skeletons: []};
for (const sp of skelPaths) {
  const skel = parseSkel(readFileSync(sp, 'latin1'));
  const r = {file: sp.split(/[\\/]/).pop(), bones: skel.bones.length, roots: skel.bones.filter(b => b.parent < 0).map(b => b.name), tagNameMismatches: tagNameMismatches(skel).length};
  let missing = 0, matchedTracks = 0; const missingTags = new Map();
  const posDiff = [], rotAngle = [];
  for (const a of anims) {
    const m = matchAnimation(skel, a);
    matchedTracks += m.matched; missing += m.missing.length;
    for (const x of m.missing) missingTags.set(x.boneTag, (missingTags.get(x.boneTag) ?? 0) + 1);
    for (const t of a.tracks) {
      const i = skel.byTag.get(t.boneTag); if (i === undefined) continue;
      const b = skel.bones[i];
      if (t.track === 0 && t.components === 3) posDiff.push(Math.hypot(t.samples[0] - b.translation[0], t.samples[1] - b.translation[1], t.samples[2] - b.translation[2]));
      if (t.track === 1 && t.kind === 'quaternion') rotAngle.push(angleBetween(t.samples, 0, b.rotation, 0));
    }
  }
  const q = arr => { const s = [...arr].sort((x, y) => x - y); return s.length ? {n: s.length, p10: s[Math.floor(s.length * 0.1)], p50: s[s.length >> 1], p90: s[Math.floor(s.length * 0.9)], within1mm: s.filter(v => v < 1e-3).length} : null; };
  Object.assign(r, {matchedTracks, missingTracks: missing, missingTagsTop: [...missingTags.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10),
    positionFrame0VsRestOffset: q(posDiff), rotationFrame0VsRestAngle: q(rotAngle)});
  report.skeletons.push(r);
}
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
