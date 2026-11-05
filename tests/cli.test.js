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
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), '--interactive', root], { encoding: 'utf8', input: '\n', env: { ...process.env, RPF_FORGE_CONSOLE: '1' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Quer alterar o spawn do carro "car"/);
  assert.match(result.stdout, /ensure car/);
  assert.match(result.stdout, /Pressione Enter/);
  assert.match(await readFile(path.join(root, 'car/fxmanifest.lua'), 'utf8'), /game 'gta5'/);
});

test('interactive prompt accepts a new spawn and retries invalid names without losing buffered input', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-cli-rename-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'dlc.rpf'), vehicleArchive());
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), '--interactive', root], { encoding: 'utf8', input: 'talvez\ns\n../bad\nAITOM8\n\n', env: { ...process.env, RPF_FORGE_CONSOLE: '1' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Responda s ou n/);
  assert.match(result.stdout, /Use um spawn/);
  assert.match(result.stdout, /ensure AITOM8/);
  assert.match(await readFile(path.join(root, 'AITOM8/data/vehicles.meta'), 'utf8'), /<modelName>AITOM8<\/modelName>/);
});
