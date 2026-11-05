import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { vehicleArchive } from './fixture.js';

test('desktop bridge previews without writing and converts only a reviewed unchanged source', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-bridge-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'dlc.rpf'), vehicleArchive());
  const request = path.join(root, 'request.json');
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  async function run(data) {
    await writeFile(request, JSON.stringify(data));
    const process = spawnSync(globalThis.process.execPath, [cli, '--bridge', request], { encoding: 'utf8' });
    assert.equal(process.status, 0, process.stderr);
    return process.stdout.trim().split('\n').map(line => JSON.parse(line));
  }
  const events = await run({ action: 'preview', folder: root });
  assert.ok(events.some(event => event.type === 'progress'));
  const preview = events.find(event => event.type === 'result').data[0];
  assert.equal(preview.audit.ok, true);
  assert.deepEqual((await readdir(root)).sort(), ['dlc.rpf', 'request.json']);
  const output = await run({ action: 'convert', folder: root, archives: { 'dlc.rpf': { expectedSource: preview.sourceHash, spawns: { car: 'DESKTOP' } } } });
  assert.equal(output.find(event => event.type === 'result').data[0].ok, true);
  assert.match(await readFile(path.join(root, 'DESKTOP/data/vehicles.meta'), 'utf8'), /<modelName>DESKTOP<\/modelName>/);
});

test('removed import commands are rejected before touching source or destination', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-removed-tool-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const source = path.join(root, 'original.zip');
  await writeFile(source, 'preserve original');
  const request = path.join(root, 'request.json');
  await writeFile(request, JSON.stringify({ action: 'assetto', folder: root, archives: { file: source, destination: path.join(root, 'output') } }));
  const bridge = spawnSync(process.execPath, [cli, '--bridge', request], { encoding: 'utf8' });
  assert.equal(bridge.status, 1);
  assert.deepEqual(JSON.parse(bridge.stdout.trim()), { type: 'error', message: 'Operação inválida.' });
  for (const flag of ['--assetto-file', '--assetto-convert']) {
    const result = spawnSync(process.execPath, [cli, flag, source, path.join(root, 'output')], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /Assetto|KN5/i);
  }
  assert.equal(await readFile(source, 'utf8'), 'preserve original');
  assert.deepEqual((await readdir(root)).sort(), ['original.zip', 'request.json']);
});
