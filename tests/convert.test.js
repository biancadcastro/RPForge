import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { convertFolder } from '../src/convert.js';
import { makeRpf, vehicleArchive } from './fixture.js';

async function folder(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpf-to-fivem-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('creates stream/data/manifest, preserves original, refuses overwrite', async t => {
  const root = await folder(t);
  const original = makeRpf([{ name: 'vehicles.rpf', data: vehicleArchive() }]);
  const source = path.join(root, 'Police Pack.rpf');
  await writeFile(source, original);
  const [result] = await convertFolder(root);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.resource, 'car');
  assert.deepEqual((await readdir(result.output)).sort(), ['data', 'fxmanifest.lua', 'stream']);
  assert.deepEqual(result.models, ['car']);
  const manifest = await readFile(path.join(result.output, 'fxmanifest.lua'), 'utf8');
  assert.match(manifest, /fx_version 'cerulean'/);
  assert.match(manifest, /^-- Convertido com RPForge\n/);
  assert.match(manifest, /data_file 'VEHICLE_METADATA_FILE' 'data\/vehicles.meta'/);
  assert.deepEqual((await readdir(path.join(result.output, 'data'))).sort(), ['handling.meta', 'vehicles.meta']);
  assert.equal((await readFile(path.join(result.output, 'stream/car.ytd'))).toString('ascii', 0, 4), 'RSC7');
  assert.deepEqual(await readFile(source), original);
  assert.equal((await convertFolder(root))[0].ok, false);
});

test('no partial addon on invalid archive; batch continues', async t => {
  const root = await folder(t);
  await writeFile(path.join(root, 'broken.rpf'), Buffer.from('broken'));
  await writeFile(path.join(root, 'valid.rpf'), vehicleArchive());
  const results = await convertFolder(root);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(results.filter(r => !r.ok).length, 1);
  assert.ok(!(await readdir(root)).some(name => name.startsWith('.rpf-to-fivem-') || name === 'broken_fivem'));
});

test('rejects conflicting stream names instead of replacing a vehicle', async t => {
  const root = await folder(t);
  const other = makeRpf([{ name: 'car.yft', data: Buffer.from('different') }]);
  await writeFile(path.join(root, 'conflict.rpf'), makeRpf([{ name: 'a.rpf', data: vehicleArchive() }, { name: 'b.rpf', data: other }]));
  const [result] = await convertFolder(root);
  assert.equal(result.ok, false);
  assert.match(result.error, /mesmo destino/);
  assert.deepEqual(await readdir(root), ['conflict.rpf']);
});

test('requires vehicle metadata and rejects malformed XML', async t => {
  const root = await folder(t);
  await writeFile(path.join(root, 'missing.rpf'), makeRpf([{ name: 'car.yft', data: Buffer.from('model') }]));
  await writeFile(path.join(root, 'badxml.rpf'), makeRpf([{ name: 'car.yft', data: Buffer.from('model') }, { name: 'vehicles.meta', data: Buffer.from('<CVehicleModelInfo__InitDataList><broken></CVehicleModelInfo__InitDataList>') }]));
  const results = await convertFolder(root);
  assert.ok(results.every(r => !r.ok));
  assert.ok(results.some(r => /XML/.test(r.error)));
  assert.equal((await readdir(root)).length, 2);
});

test('conversion removes absent tuning after renaming while retaining performance mods and original RPF', async t => {
  const root = await folder(t);
  const xml = '<CVehicleModelInfoVarGlobal><Kits><Item><kitName>7_car_modkit</kitName><visibleMods><Item><modelName>car_missing</modelName></Item></visibleMods><statMods><Item><type>VMT_ENGINE</type><modifier value="50"/></Item></statMods></Item></Kits></CVehicleModelInfoVarGlobal>';
  const original = makeRpf([{ name: 'vehicles.rpf', data: vehicleArchive() }, { name: 'carcols.meta', data: Buffer.from(xml), compressed: true }]);
  const source = path.join(root, 'dlc.rpf');
  await writeFile(source, original);
  const [result] = await convertFolder(root, { spawns: { car: 'NEWCAR' } });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.removedTuning, ['car_missing']);
  const converted = await readFile(path.join(result.output, 'data/carcols.meta'), 'utf8');
  assert.ok(!converted.includes('car_missing'));
  assert.match(converted, /7_NEWCAR_modkit/);
  assert.match(converted, /<type>VMT_ENGINE<\/type>/);
  assert.match(converted, /modifier value="50"/);
  assert.deepEqual(await readFile(source), original);
});

test('ignores DLC text and shop data in any case without exporting or registering them', async t => {
  const root = await folder(t);
  await writeFile(path.join(root, 'dlc.rpf'), makeRpf([
    { name: 'vehicles.rpf', data: vehicleArchive() },
    ...['DLCTEXT.meta', 'shopdata.meta', 'shop_vehicle.meta'].map(name => ({ name, data: Buffer.from('ignored without XML parsing') })),
  ]));
  const [result] = await convertFolder(root);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.skipped.sort(), ['DLCTEXT.meta', 'shop_vehicle.meta', 'shopdata.meta'].sort());
  assert.deepEqual((await readdir(path.join(result.output, 'data'))).sort(), ['handling.meta', 'vehicles.meta']);
  const manifest = await readFile(path.join(result.output, 'fxmanifest.lua'), 'utf8');
  assert.doesNotMatch(manifest, /dlctext|shopdata|shop_vehicle|TEXTFILE_METAFILE/i);
  assert.deepEqual((await readdir(result.output)).sort(), ['data', 'fxmanifest.lua', 'stream']);
});

test('ignoring shop data does not silently ignore other unsupported game metadata', async t => {
  const root = await folder(t);
  await writeFile(path.join(root, 'dlc.rpf'), makeRpf([
    { name: 'vehicles.rpf', data: vehicleArchive() },
    { name: 'shopdata.meta', data: Buffer.from('ignored') },
    { name: 'unsupported.meta', data: Buffer.from('unknown game data') },
  ]));
  const [result] = await convertFolder(root);
  assert.equal(result.ok, false);
  assert.match(result.error, /unsupported.meta/);
  assert.doesNotMatch(result.error, /shopdata.meta/);
  assert.deepEqual(await readdir(root), ['dlc.rpf']);
});
