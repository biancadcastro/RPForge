import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { convertFolder } from '../src/convert.js';
import { makeRpf } from './fixture.js';

function archive({ second = false, shared = false, collision = false } = {}) {
  const items = `<Item><modelName>car</modelName><txdName>${shared ? 'shared' : 'car_textures'}</txdName><handlingId>CAR_HANDLING</handlingId><gameName>car</gameName><audioNameHash>car</audioNameHash><layout>LAYOUT_STANDARD</layout></Item>` +
    (second ? `<Item><modelName>taxi</modelName><txdName>${shared ? 'shared' : 'taxi'}</txdName><handlingId>${shared ? 'CAR_HANDLING' : 'TAXI'}</handlingId></Item>` : '');
  const files = [
    ['car.yft', 'model'], ['car_hi.yft', 'hi'], ['car_bumper.yft', 'tuning'], ['car+hi.ytd', 'high textures'],
    [shared ? 'shared.ytd' : 'car_textures.ytd', 'livery untouched'], ['car_anims.ycd', 'animation'],
    ['vehicles.meta', `<CVehicleModelInfo__InitDataList><InitDatas>${items}</InitDatas><txdRelationships><Item><parent>vehshare</parent><child>${shared ? 'shared' : 'car_textures'}</child></Item></txdRelationships></CVehicleModelInfo__InitDataList>`],
    ['handling.meta', '<CHandlingDataMgr><HandlingData><Item><handlingName>CAR_HANDLING</handlingName><fMass value="1500"/></Item></HandlingData></CHandlingDataMgr>'],
    ['carcols.meta', '<CVehicleModelInfoVarGlobal><Kits><Item><kitName>123_car_modkit</kitName><id value="123"/><visibleMods><Item><modelName>car_bumper</modelName><linkedModels><Item>car_bumper</Item></linkedModels></Item></visibleMods></Item></Kits></CVehicleModelInfoVarGlobal>'],
    ['carvariations.meta', '<CVehicleModelInfoVariation><variationData><Item><modelName>car</modelName><kits><Item>123_car_modkit</Item></kits><liveries><Item value="true"/></liveries></Item></variationData></CVehicleModelInfoVariation>'],
  ];
  if (second) files.push(['taxi.yft', 'second vehicle']);
  if (collision) files.push(['newcar.yft', 'unrelated model']);
  return makeRpf(files.map(([name, value]) => ({ name, data: Buffer.from(value), compressed: name.endsWith('.meta') })));
}
async function setup(t, data) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-spawn-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'dlc.rpf'), data);
  return root;
}
async function meta(output, filename) {
  return readFile(path.join(output, 'data', filename), 'utf8');
}

test('renames spawn, dedicated dictionary, handling and tuning references, preserving liveries and audio', async t => {
  const original = archive();
  const root = await setup(t, original);
  const [result] = await convertFolder(root, { spawns: { car: 'newcar' } });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.resource, 'newcar');
  const streamed = await readdir(path.join(result.output, 'stream'));
  for (const name of ['newcar.yft', 'newcar_hi.yft', 'newcar.ytd', 'newcar+hi.ytd', 'car_anims.ycd']) assert.ok(streamed.includes(name), name);
  assert.deepEqual(await readdir(path.join(result.output, 'stream/mods')), ['newcar_bumper.yft']);
  assert.equal(await readFile(path.join(result.output, 'stream/newcar.ytd'), 'utf8'), 'livery untouched');
  const vehicles = await meta(result.output, 'vehicles.meta');
  for (const value of ['<modelName>newcar</modelName>', '<txdName>newcar</txdName>', '<handlingId>newcar</handlingId>', '<child>newcar</child>', '<audioNameHash>car</audioNameHash>', '<layout>LAYOUT_STANDARD</layout>']) assert.ok(vehicles.includes(value), value);
  assert.match(await meta(result.output, 'handling.meta'), /<handlingName>newcar<\/handlingName>/);
  const carcols = await meta(result.output, 'carcols.meta');
  assert.match(carcols, /123_newcar_modkit/);
  assert.match(carcols, /<modelName>newcar_bumper<\/modelName>/);
  assert.match(carcols, /<Item>newcar_bumper<\/Item>/);
  assert.match(carcols, /id value="123"/);
  assert.match(await meta(result.output, 'carvariations.meta'), /123_newcar_modkit/);
  assert.deepEqual(await readFile(path.join(root, 'dlc.rpf')), original);
  assert.deepEqual((await readdir(result.output)).sort(), ['data', 'fxmanifest.lua', 'stream']);
});

test('keeps shared handling and dictionary valid when renaming just one vehicle', async t => {
  const root = await setup(t, archive({ second: true, shared: true }));
  const [result] = await convertFolder(root, { spawns: { car: 'newcar' } });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.models, ['newcar', 'taxi']);
  assert.equal(result.resource, 'newcar_pack');
  const vehicles = await meta(result.output, 'vehicles.meta');
  assert.equal((vehicles.match(/<txdName>shared<\/txdName>/g) ?? []).length, 2);
  assert.equal((vehicles.match(/<handlingId>CAR_HANDLING<\/handlingId>/g) ?? []).length, 2);
  assert.equal(await readFile(path.join(result.output, 'stream/shared.ytd'), 'utf8'), 'livery untouched');
});

test('refuses invalid, duplicated and conflicting names before writing output', async t => {
  const root = await setup(t, archive({ second: true, collision: true }));
  for (const spawns of [{ car: '../escape' }, { car: 'con' }, { car: 'CON' }, { car: 'taxi' }, { car: 'TAXI' }, { car: 'Name', taxi: 'NAME' }, { car: 'newcar' }, { unknown: 'newname' }]) {
    const [result] = await convertFolder(root, { spawns });
    assert.equal(result.ok, false, JSON.stringify(spawns));
    assert.deepEqual(await readdir(root), ['dlc.rpf']);
  }
});

test('preserves uppercase and mixed-case spawns in folder, streamed names and meta references', async t => {
  for (const spawn of ['AITOM8', 'AitoM8', 'CAR']) {
    const root = await setup(t, archive());
    const [result] = await convertFolder(root, { spawns: { car: spawn } });
    assert.equal(result.ok, true, result.error);
    assert.equal(result.resource, spawn);
    assert.deepEqual(result.models, [spawn]);
    const stream = await readdir(path.join(result.output, 'stream'));
    for (const name of [`${spawn}.yft`, `${spawn}_hi.yft`, `${spawn}.ytd`]) assert.ok(stream.includes(name), name);
    assert.deepEqual(await readdir(path.join(result.output, 'stream/mods')), [`${spawn}_bumper.yft`]);
    const vehicles = await meta(result.output, 'vehicles.meta');
    assert.ok(vehicles.includes(`<modelName>${spawn}</modelName>`));
    assert.ok(vehicles.includes(`<txdName>${spawn}</txdName>`));
    assert.ok(vehicles.includes(`<handlingId>${spawn}</handlingId>`));
    assert.ok((await meta(result.output, 'handling.meta')).includes(`<handlingName>${spawn}</handlingName>`));
    assert.ok((await meta(result.output, 'carcols.meta')).includes(`123_${spawn}_modkit`));
  }
});

test('declining renaming preserves original meta bytes and uses current spawn folder', async t => {
  const root = await setup(t, archive());
  const [result] = await convertFolder(root, { chooseSpawns: async ({ models }) => { assert.deepEqual(models, ['car']); return {}; } });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.resource, 'car');
  assert.match(await meta(result.output, 'vehicles.meta'), /<handlingId>CAR_HANDLING<\/handlingId>/);
  assert.equal(await readFile(path.join(result.output, 'stream/car_textures.ytd'), 'utf8'), 'livery untouched');
});
