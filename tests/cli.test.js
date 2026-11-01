import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { vehicleArchive } from './fixture.js';

test('interactive menu entry handles spaces and shell characters as literal paths', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpf & percent% sample-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'vehicle.rpf'), vehicleArchive());
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), '--interactive', root], { encoding: 'utf8', input: '\n' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ensure vehicle_fivem/);
  assert.match(result.stdout, /Pressione Enter/);
  assert.match(await readFile(path.join(root, 'vehicle_fivem/fxmanifest.lua'), 'utf8'), /game 'gta5'/);
});
