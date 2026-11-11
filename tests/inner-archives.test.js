import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { convertFolder } from '../src/convert.js';
import { inspectFolder } from '../src/preview.js';
import { makeRpf, vehicleArchive } from './fixture.js';

async function folder(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpforge-inner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const zeroedLanguagePack = Buffer.alloc(2048); // real americandlc.rpf: header is all zeros

test('a zeroed inner language RPF is ignored with a review warning, not fatal', async t => {
  const root = await folder(t);
  const original = makeRpf([{ name: 'vehicles.rpf', data: vehicleArchive() }, { name: 'americandlc.rpf', data: zeroedLanguagePack }]);
  await writeFile(path.join(root, 'dlc.rpf'), original);
  const [preview] = await inspectFolder(root);
  assert.equal(preview.ok, true, preview.error);
  const warning = preview.audit.issues.find(issue => issue.code === 'IGNORED_INNER_ARCHIVE');
  assert.equal(warning.message, 'O pacote interno americandlc.rpf está vazio ou ilegível e foi ignorado.');
  const [result] = await convertFolder(root);
  assert.equal(result.ok, true, result.error);
  assert.ok(result.audit.issues.some(issue => issue.code === 'IGNORED_INNER_ARCHIVE'));
  assert.deepEqual(await readFile(path.join(root, 'dlc.rpf')), original);
});

test('an empty inner RPF is ignored too', async t => {
  const root = await folder(t);
  await writeFile(path.join(root, 'dlc.rpf'), makeRpf([{ name: 'vehicles.rpf', data: vehicleArchive() }, { name: 'empty.rpf', data: Buffer.alloc(0) }]));
  const [result] = await convertFolder(root);
  assert.equal(result.ok, true, result.error);
});

test('the outer RPF must still be valid', async t => {
  const root = await folder(t);
  await writeFile(path.join(root, 'dlc.rpf'), zeroedLanguagePack);
  const [result] = await convertFolder(root);
  assert.equal(result.ok, false);
});

test('when the ignored inner RPF was the only candidate, the error says so', async t => {
  const root = await folder(t);
  await writeFile(path.join(root, 'dlc.rpf'), makeRpf([{ name: 'vehicles.meta', data: Buffer.from('<CVehicleModelInfo__InitDataList><InitDatas/></CVehicleModelInfo__InitDataList>') }, { name: 'dlc_car.rpf', data: zeroedLanguagePack }]));
  const [result] = await convertFolder(root);
  assert.equal(result.ok, false);
  assert.match(result.error, /dlc_car\.rpf estava vazio ou ilegível e foi ignorado; se o conteúdo estava nele, o RPF de origem está danificado\./);
});

test('an encrypted inner RPF is not masked as ignorable', async t => {
  const root = await folder(t);
  const encrypted = Buffer.from(vehicleArchive());
  encrypted.writeUInt32LE(0x0ffffff9, 12); // AES/NG flag
  await writeFile(path.join(root, 'dlc.rpf'), makeRpf([{ name: 'vehicles.rpf', data: encrypted }]));
  const [result] = await convertFolder(root);
  assert.equal(result.ok, false);
  assert.match(result.error, /criptografado/);
});

test('a byte-identical duplicate inner RPF is read once with a warning', async t => {
  const root = await folder(t);
  await writeFile(path.join(root, 'dlc.rpf'), makeRpf([{ name: 'a.rpf', data: vehicleArchive() }, { name: 'b.rpf', data: vehicleArchive() }]));
  const [result] = await convertFolder(root);
  assert.equal(result.ok, true, result.error);
  assert.ok(result.audit.issues.some(issue => issue.code === 'DUPLICATE_INNER_ARCHIVE' && /b\.rpf é uma cópia idêntica de a\.rpf/.test(issue.message)));
});
