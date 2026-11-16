import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { makeRpf } from './fixture.js';
import { inspectFolder, convertSelected } from '../src/preview.js';

const file = (name, text = name) => ({ name, data: Buffer.from(text) });
async function fixture(t, entries, name = 'pack') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-content-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = makeRpf(entries);
  await writeFile(path.join(root, name + '.rpf'), source);
  const [preview] = await inspectFolder(root);
  return { root, source, preview, convert: (config = {}) => convertSelected(root, { archives: { [name + '.rpf']: { expectedSource: preview.sourceHash, ...config } } }) };
}

test('map/MLO resource registers archetypes, preserves binaries, source and review before writing', async t => {
  const f = await fixture(t, [file('interior.ymap'), file('interior.ytyp'), file('_manifest.ymf'), file('room.ydr'), file('room.ybn'), file('room.ytd')]);
  assert.equal(f.preview.kind, 'map');
  assert.deepEqual(await readdir(f.root), ['pack.rpf']);
  const [result] = await f.convert({ spawns: { pack: 'MyMap' } });
  assert.equal(result.ok, true, result.error);
  const manifest = await readFile(path.join(result.output, 'fxmanifest.lua'), 'utf8');
  assert.match(manifest, /this_is_a_map 'yes'/);
  assert.match(manifest, /data_file 'DLC_ITYP_REQUEST' 'stream\/interior.ytyp'/);
  assert.equal(await readFile(path.join(result.output, 'stream/room.ydr'), 'utf8'), 'room.ydr');
  assert.equal(await readFile(path.join(result.output, 'stream/_manifest.ymf'), 'utf8'), '_manifest.ymf');
  assert.deepEqual(await readFile(path.join(f.root, 'pack.rpf')), f.source);
  const [again] = await f.convert({ spawns: { pack: 'MyMap' } });
  assert.equal(again.ok, false); assert.match(again.error, /já existe/);
});

test('nested clothing collection gains FiveM prefix and keeps YMT and shop registration', async t => {
  const collection = 'mp_f_freemode_01_custom';
  const nested = makeRpf([file('jbib_000_u.ydd'), file('jbib_diff_000_a_uni.ytd')]);
  const f = await fixture(t, [file(collection + '.rpf', nested), file(collection + '.ymt'), file('custom_shop.meta', '<ShopPedApparel><pedName>mp_f_freemode_01</pedName></ShopPedApparel>')]);
  assert.equal(f.preview.kind, 'clothing');
  const [result] = await f.convert();
  assert.equal(result.ok, true, result.error);
  assert.equal(await readFile(path.join(result.output, `stream/${collection}^jbib_000_u.ydd`), 'utf8'), 'jbib_000_u.ydd');
  const manifest = await readFile(path.join(result.output, 'fxmanifest.lua'), 'utf8');
  assert.match(manifest, /SHOP_PED_APPAREL_META_FILE/);
  assert.match(manifest, /subdir_file_mapping/);
  assert.doesNotMatch(manifest, /VEHICLE_METADATA|this_is_a_map/);
});

test('clothing replacements keep base collection, animations and textures are streamable', async t => {
  for (const entries of [[file('mp_m_freemode_01^jbib_000_u.ydd')], [file('mp_m_freemode_01_p^p_head_000.ydd')], [file('dance.ycd')], [file('texture.ytd')]]) {
    const f = await fixture(t, entries);
    assert.equal(f.preview.ok, true, f.preview.error);
    assert.equal((await f.convert())[0].ok, true);
  }
});

test('peds, weapons and audio receive their own metadata registrations', async t => {
  const cases = [
    { entries: [file('peds.meta', '<CPedModelInfo__InitDataList><InitDatas><Item><Name>custom_ped</Name></Item></InitDatas></CPedModelInfo__InitDataList>'), file('custom_ped.ydd'), file('custom_ped.ymt')], type: 'PED_METADATA_FILE' },
    { entries: [file('weapons.meta', '<CWeaponInfoBlob/>'), file('w_custom.ydr')], type: 'WEAPONINFO_FILE_PATCH' },
    { entries: [file('custom_game.dat151.rel'), file('custom_sounds.dat54.rel'), file('dlc_custom.rpf', makeRpf([file('custom.awc')]))], type: 'AUDIO_WAVEPACK' },
  ];
  for (const item of cases) {
    const f = await fixture(t, item.entries);
    assert.equal(f.preview.ok, true, f.preview.error);
    const [result] = await f.convert(); assert.equal(result.ok, true, result.error);
    const manifest = await readFile(path.join(result.output, 'fxmanifest.lua'), 'utf8');
    assert.ok(manifest.includes(item.type));
    if (item.type === 'AUDIO_WAVEPACK') {
      assert.match(manifest, /AUDIO_GAMEDATA' 'audioconfig\/custom_game.dat151'/);
      assert.match(manifest, /AUDIO_WAVEPACK' 'sfx\/dlc_custom'/);
      assert.equal(await readFile(path.join(result.output, 'sfx/dlc_custom/custom.awc'), 'utf8'), 'custom.awc');
    }
  }
});

test('custom props without archetypes receive a binary YTYP registered in their resource', async t => {
  const header = Buffer.alloc(16); header.write('RSC7'); header.writeUInt32LE(165, 4);
  header.writeUInt32LE(0xa8000000, 8); header.writeUInt32LE(0x50000000, 12); // one 512-byte system page, as real headers declare
  const raw = Buffer.alloc(512); raw.writeFloatLE(2, 44);
  for (const at of [48, 52, 56]) raw.writeFloatLE(-1, at);
  for (const at of [64, 68, 72]) raw.writeFloatLE(1, at);
  const f = await fixture(t, [file('own_prop.ydr', Buffer.concat([header, deflateRawSync(raw)]))]);
  assert.equal(f.preview.ok, true, f.preview.error);
  assert.ok(f.preview.audit.issues.some(i => i.code === 'GENERATED_ARCHETYPES'));
  const [result] = await f.convert(); assert.equal(result.ok, true, result.error);
  const generated = await readFile(path.join(result.output, 'stream/rpforge_archetypes_1.ytyp'));
  assert.equal(generated.toString('ascii', 0, 4), 'RSC7');
  assert.match(await readFile(path.join(result.output, 'fxmanifest.lua'), 'utf8'), /DLC_ITYP_REQUEST' 'stream\/rpforge_archetypes_1.ytyp'/);
});

test('missing clothing collection, unknown metadata and conflicting flattened names block conversion', async t => {
  for (const entries of [
    [file('jbib_000_u.ydd')],
    [file('mp_f_freemode_01_custom^jbib_000_u.ydd')],
    [file('unknown.meta', '<Unknown/>'), file('room.ydr')],
    [file('first.rpf', makeRpf([file('room.ydr', 'a')])), file('second.rpf', makeRpf([file('room.ydr', 'b')]))],
    [file('unsafe.lua', 'print(1)')],
  ]) {
    const f = await fixture(t, entries);
    assert.equal(f.preview.ok, false);
    assert.deepEqual(await readdir(f.root), ['pack.rpf']);
  }
});

test('content conversion rejects changed sources and backup keeps existing resource', async t => {
  const f = await fixture(t, [file('dance.ycd')]);
  assert.equal((await f.convert())[0].ok, true);
  const [backup] = await f.convert({ existing: 'backup' });
  assert.equal(backup.ok, true, backup.error); assert.ok(backup.backup);
  assert.equal(await readFile(path.join(backup.backup, 'stream/dance.ycd'), 'utf8'), 'dance.ycd');
  await writeFile(path.join(f.root, 'pack.rpf'), makeRpf([file('changed.ycd')]));
  const [changed] = await f.convert({ existing: 'backup' });
  assert.equal(changed.ok, false); assert.match(changed.error, /mudou/);
});
