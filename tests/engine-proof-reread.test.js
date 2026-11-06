import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {writeYcd} from '../src/engine-proof/ycd.js';

const script = fileURLToPath(new URL('../scripts/engine-proof-reread-oracle.mjs', import.meta.url));
const model = {name: 'proof_motion_2', fps: 30, translations: [0, 0, 0, 1, 2, 3]};
async function run(manifest) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'forge-reread-'));
  await writeFile(path.join(folder, 'oracle-proof_motion_2.ycd'), writeYcd(model));
  await writeFile(path.join(folder, 'manifest.json'), JSON.stringify(manifest));
  const result = spawnSync(process.execPath, [script, folder], {encoding: 'utf8'});
  const report = JSON.parse(await readFile(path.join(folder, 'oracle-reread.json'), 'utf8'));
  await rm(folder, {recursive: true, force: true});
  return {status: result.status, report};
}
test('oracle re-read exits 0 only when every file passes and always keeps the report', async () => {
  const ok = await run([{type: 'ycd', file: 'proof_motion_2.ycd', model}]);
  assert.equal(ok.status, 0); assert.equal(ok.report.failed, 0);
  // Negative control: expected name differs -> mismatch must fail the process, report preserved.
  const bad = await run([{type: 'ycd', file: 'proof_motion_2.ycd', model: {...model, name: 'other_name'}}]);
  assert.equal(bad.status, 1); assert.equal(bad.report.results[0].ownRead, 'mismatch');
});
