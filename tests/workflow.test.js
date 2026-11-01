import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeRpf, vehicleArchive } from './fixture.js';
import { convertFolder, prepareArchive } from '../src/convert.js';
import { inspectFolder, convertSelected } from '../src/preview.js';
import { auditAddon } from '../src/audit.js';
import { readdirSync, writeFileSync } from 'node:fs';

async function setup(t, archive = vehicleArchive()) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-workflow-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'dlc.rpf'), archive);
  return root;
}
function vehicle(model, id) {
  const definitions = [
    [`${model}.yft`, `geometry-${model}`], [`${model}.ytd`, `textures-${model}`],
    ['vehicles.meta', `<CVehicleModelInfo__InitDataList><residentTxd>vehshare</residentTxd><InitDatas><Item><modelName>${model}</modelName><txdName>${model}</txdName><handlingId>${model}</handlingId></Item></InitDatas></CVehicleModelInfo__InitDataList>`],
    ['handling.meta', `<CHandlingDataMgr><HandlingData><Item><handlingName>${model}</handlingName><fMass value="1500"/></Item></HandlingData></CHandlingDataMgr>`],
    ['carcols.meta', `<CVehicleModelInfoVarGlobal><Kits><Item><kitName>${id}_${model}_modkit</kitName><id value="${id}"/></Item></Kits></CVehicleModelInfoVarGlobal>`],
    ['carvariations.meta', `<CVehicleModelInfoVariation><variationData><Item><modelName>${model}</modelName><kits><Item>${id}_${model}_modkit</Item></kits></Item></variationData></CVehicleModelInfoVariation>`],
  ];
  return makeRpf(definitions.map(([name, data]) => ({ name, data: Buffer.from(data), compressed: name.endsWith('.meta') })));
}

test('preview is read-only, exposes largest files and validation, and detects stale source before conversion', async t => {
  const root = await setup(t);
  const [preview] = await inspectFolder(root);
  assert.equal(preview.ok, true, preview.error);
  assert.equal(preview.audit.ok, true);
  assert.deepEqual(preview.models, ['car']);
  assert.ok(preview.audit.assets.every((file, i, all) => !i || all[i - 1].diskBytes >= file.diskBytes));
  assert.ok(preview.audit.diskBytes > 0);
  assert.deepEqual(await readdir(root), ['dlc.rpf']);
  await writeFile(path.join(root, 'dlc.rpf'), Buffer.concat([vehicleArchive(), Buffer.alloc(1)]));
  const [result] = await convertSelected(root, { archives: { 'dlc.rpf': { expectedSource: preview.sourceHash } } });
  assert.equal(result.ok, false);
  assert.match(result.error, /mudou desde a prévia/);
  assert.deepEqual(await readdir(root), ['dlc.rpf']);
});

test('unifies metadata across nested vehicle packs, preserves definitions and rejects duplicate modkit ids', async t => {
  const root = await setup(t, makeRpf([{ name: 'one.rpf', data: vehicle('one', 101) }, { name: 'two.rpf', data: vehicle('two', 102) }]));
  const [result] = await convertFolder(root);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.audit.errors, 0);
  assert.equal(result.mergedSources, 4);
  assert.deepEqual((await readdir(path.join(result.output, 'data'))).sort(), ['carcols.meta', 'carvariations.meta', 'handling.meta', 'vehicles.meta']);
  const xml = await readFile(path.join(result.output, 'data/vehicles.meta'), 'utf8');
  assert.match(xml, /<modelName>one<\/modelName>/); assert.match(xml, /<modelName>two<\/modelName>/);
  const conflict = await setup(t, makeRpf([{ name: 'one.rpf', data: vehicle('one', 101) }, { name: 'two.rpf', data: vehicle('two', 101) }]));
  const [failed] = await convertFolder(conflict);
  assert.equal(failed.ok, false);
  assert.match(failed.error, /mesmo ID/);
  assert.deepEqual(await readdir(conflict), ['dlc.rpf']);
});

test('refuses contradictory definitions instead of silently merging handling', async t => {
  const extra = makeRpf([{ name: 'handling.meta', data: Buffer.from('<CHandlingDataMgr><HandlingData><Item><handlingName>one</handlingName><fMass value="9000"/></Item></HandlingData></CHandlingDataMgr>') }]);
  const root = await setup(t, makeRpf([{ name: 'one.rpf', data: vehicle('one', 101) }, { name: 'extra.rpf', data: extra }]));
  const [result] = await convertFolder(root);
  assert.equal(result.ok, false);
  assert.match(result.error, /conflitantes/);
  assert.deepEqual(await readdir(root), ['dlc.rpf']);
});

test('supports alternate folder names, cancellation and backup/replacement without losing old data', async t => {
  const root = await setup(t);
  const [first] = await convertFolder(root);
  await writeFile(path.join(first.output, 'personal-note.txt'), 'preserve me');
  const [cancelled] = await convertFolder(root, { existing: 'cancel' });
  assert.equal(cancelled.cancelled, true);
  assert.equal(await readFile(path.join(first.output, 'personal-note.txt'), 'utf8'), 'preserve me');
  const [alternate] = await convertFolder(root, { existing: 'rename' });
  assert.equal(alternate.resource, 'car_2');
  const [replacement] = await convertFolder(root, { existing: 'backup' });
  assert.equal(replacement.ok, true, replacement.error);
  assert.equal(replacement.resource, 'car');
  assert.equal(await readFile(path.join(replacement.backup, 'personal-note.txt'), 'utf8'), 'preserve me');
  assert.deepEqual((await readdir(replacement.output)).sort(), ['data', 'fxmanifest.lua', 'stream']);
});

test('final audit catches missing model and manifest targets and distinguishes external dependencies', async t => {
  const root = await setup(t, vehicle('one', 101));
  const plan = await prepareArchive(path.join(root, 'dlc.rpf'));
  const missing = new Map(plan.files);
  missing.delete('stream/one.yft');
  missing.delete('data/handling.meta');
  const result = auditAddon(missing);
  assert.equal(result.ok, false);
  for (const code of ['MISSING_MODEL', 'MANIFEST_MISSING_FILE']) assert.ok(result.issues.some(i => i.code === code), code);
  assert.ok(result.issues.some(i => i.code === 'EXTERNAL_HANDLING' && i.severity === 'warning'));
  const bad = new Map(plan.files);
  bad.set('data/carvariations.meta', { destination: 'data/carvariations.meta', data: Buffer.from('<CVehicleModelInfoVariation><variationData><Item><modelName>unknown</modelName><kits><Item>missing_kit</Item></kits></Item></variationData></CVehicleModelInfoVariation>') });
  const audit = auditAddon(bad);
  for (const code of ['VARIATION_MODEL_MISSING', 'MISSING_MODKIT']) assert.ok(audit.issues.some(i => i.code === code), code);
});

test('detects corruption after writing and removes only its own incomplete staging output', async t => {
  const root = await setup(t);
  let corrupted = false;
  const [result] = await convertFolder(root, { onProgress(event) {
    if (!corrupted && event.phase === 'write' && event.label.endsWith('.yft')) {
      const stage = readdirSync(root).find(name => name.startsWith('.rpforge-'));
      writeFileSync(path.join(root, stage, event.label), 'corrupt');
      corrupted = true;
    }
  } });
  assert.equal(corrupted, true);
  assert.equal(result.ok, false);
  assert.match(result.error, /verificação do arquivo gravado/);
  assert.deepEqual(await readdir(root), ['dlc.rpf']);
  assert.deepEqual(await readFile(path.join(root, 'dlc.rpf')), vehicleArchive());
});
