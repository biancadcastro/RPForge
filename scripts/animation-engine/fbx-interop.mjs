// Offline interoperability check for the FBX import (never part of the product):
//   1. writes the reference skeleton as JSON;
//   2. runs Blender (independent FBX writer) to build realistic FBX files of the freemode
//      skeleton with three simple, unambiguous animations, plus an oracle of the poses
//      Blender itself evaluated;
//   3. converts every take with the RPForge engine and compares the resulting YCD, by
//      forward kinematics, with the oracle;
//   4. optionally writes the converted YCDs for an in-game test.
// Usage:
//   node scripts/animation-engine/fbx-interop.mjs --blender <blender.exe> --out <fixture dir> [--samples <dir>]
// The fixture dir stays outside Git (.fbx is not allowed in the repository).
// tests/animation-fbx-interop.test.js re-checks an existing fixture dir without Blender.
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {convertFbxToYcd, inspectFbx} from '../../src/animation-engine/index.js';
import {skeletonForBlender, compareWithOracle} from './fbx-interop-lib.mjs';

const args = process.argv.slice(2), option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const blender = option('blender'), out = option('out'), samples = option('samples');
if (!out) { console.error('usage: fbx-interop.mjs --blender <blender.exe> --out <fixture dir> [--samples <dir>]'); process.exit(2); }
const dir = resolve(out);
mkdirSync(dir, {recursive: true});
if (blender) {
  writeFileSync(join(dir, 'skeleton.json'), JSON.stringify(skeletonForBlender('male')));
  const script = fileURLToPath(new URL('./make-fbx-fixture.py', import.meta.url));
  const run = spawnSync(blender, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', script, '--', join(dir, 'skeleton.json'), dir], {encoding: 'utf8', timeout: 600000});
  if (run.status !== 0 || !/FIXTURE_OK/.test(run.stdout)) { console.error(run.stdout?.slice(-4000), run.stderr?.slice(-4000)); process.exit(1); }
  console.log('blender:', /FIXTURE_OK (.*)/.exec(run.stdout)[1].trim());
}
if (!existsSync(join(dir, 'oracle.json'))) { console.error('no oracle.json in the fixture dir; pass --blender to generate it'); process.exit(2); }
const oracle = JSON.parse(readFileSync(join(dir, 'oracle.json'), 'utf8'));
const rows = [];
let failed = false;
for (const file of ['freemode-actions.fbx', 'freemode-zup.fbx']) {
  const bytes = readFileSync(join(dir, file)), info = inspectFbx(bytes);
  if (!info.ok) { console.error(file, info.error); process.exit(1); }
  for (const take of info.takes) {
    const expected = oracle.takes.find(t => take.name.endsWith(t.name));
    const converted = convertFbxToYcd(bytes, {take: take.index, clipName: expected?.name});
    if (!converted.ok || !expected) { rows.push({file, take: take.name, error: converted.error?.code ?? 'no oracle take'}); failed = true; continue; }
    const check = compareWithOracle(converted.ycd, oracle, expected);
    const row = {file, take: take.name, format: `${info.format} ${info.version}`, up: info.settings.upAxis, restPose: converted.report.conversion.restPose, scale: +converted.report.conversion.scale.toPrecision(6),
      frames: check.frames, oracleFrames: check.oracleFrames, maxPositionErrorMm: +(check.maxPositionError * 1000).toFixed(4), maxAngleErrorDeg: +check.maxAngleError.toFixed(4), bytes: converted.ycd.length,
      warnings: converted.report.warnings.map(w => w.code)};
    if (check.frames !== check.oracleFrames || check.maxPositionError > 1e-3 || check.maxAngleError > 0.1) failed = true;
    rows.push(row);
    if (samples && file === 'freemode-actions.fbx') { mkdirSync(resolve(samples), {recursive: true}); writeFileSync(join(resolve(samples), `${expected.name}.ycd`), converted.ycd); }
  }
}
console.table(rows.map(({warnings, ...r}) => r));
writeFileSync(join(dir, 'interop-report.json'), JSON.stringify({generated: new Date().toISOString(), rows}, null, 2));
if (failed) { console.error('INTEROP MISMATCH'); process.exit(1); }
console.log('interop ok');
