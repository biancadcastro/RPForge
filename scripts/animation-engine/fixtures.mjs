// Generate the synthetic YCD corpus of the skeletal profile and its manifest.
// Usage: node scripts/animation-engine/fixtures.mjs <outDir>
// Output is deterministic (same bytes/hashes on every run); .ycd files are not committed
// (repository .gitignore) — the manifest in docs/animation-engine records their hashes.
import {writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {writeSkeletalYcd} from '../../src/animation-engine/ycd-write.js';
import {syntheticAnimation} from '../../tests/animation-engine/synthetic.js';

export const CASES = [
  {id: 'skel_s3_f2_raw', params: {bones: 3, frames: 2}, encoding: {mode: 'raw'}},
  {id: 'skel_s21_f31_raw', params: {bones: 21, frames: 31, constantBones: 4}, encoding: {mode: 'raw'}},
  {id: 'skel_s21_f31_q', params: {bones: 21, frames: 31, constantBones: 4}, encoding: {mode: 'quantized'}},
  {id: 'skel_s21_f61_mover_q', params: {bones: 21, frames: 61, mover: true}, encoding: {mode: 'quantized'}},
  {id: 'skel_s21_f91_spin_raw', params: {bones: 21, frames: 91, spin: true, nearPi: true}, encoding: {mode: 'raw'}},
  {id: 'skel_s128_f300_q', params: {bones: 128, frames: 300, mover: true}, encoding: {mode: 'quantized'}},
  {id: 'skel_s128_f1800_q', params: {bones: 128, frames: 1800}, encoding: {mode: 'quantized'}},
];

export function buildCorpus() {
  return CASES.map(c => {
    const {animation} = syntheticAnimation({name: c.id, seed: c.id.length, ...c.params});
    const {bytes, report} = writeSkeletalYcd(animation, {encoding: c.encoding});
    return {...c, file: `${c.id}.ycd`, bytes, report, sha256: createHash('sha256').update(bytes).digest('hex')};
  });
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('fixtures.mjs')) {
  const out = process.argv[2];
  if (!out) { console.error('usage: fixtures.mjs <outDir>'); process.exit(2); }
  mkdirSync(out, {recursive: true});
  const corpus = buildCorpus();
  for (const c of corpus) writeFileSync(join(out, c.file), c.bytes);
  const manifest = corpus.map(({bytes, ...c}) => ({
    file: c.file, origin: 'synthetic (tests/animation-engine/synthetic.js)', profile: c.report.profile, sha256: c.sha256, bytes: c.report.outputBytes,
    expectation: 'accepted by strict reader; semantic match within encoding tolerances', params: c.params, encoding: c.encoding,
    frames: c.report.frames, tracks: c.report.tracks.length, rootMotion: c.report.rootMotion,
    maxPositionError: Math.max(0, ...c.report.tracks.map(t => t.maxPositionError ?? 0)), maxAngleError: Math.max(0, ...c.report.tracks.map(t => t.maxAngleError ?? 0)),
    encodings: [...new Set(c.report.tracks.map(t => t.encoding))],
  }));
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(JSON.stringify(manifest.map(m => [m.file, m.bytes, m.sha256.slice(0, 16), m.tracks, m.maxPositionError, m.maxAngleError]), null, 0));
}
