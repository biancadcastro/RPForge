import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { convertFolder } from '../src/convert.js';
import { inspectFolder } from '../src/preview.js';
import { readXml } from '../src/xml-text.js';
import { makeRpf } from './fixture.js';

async function folder(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rpforge-xml-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const resource = Buffer.concat([Buffer.alloc(16), deflateRawSync(Buffer.from('synthetic geometry'))]);
const vehicles = Buffer.from('<CVehicleModelInfo__InitDataList><InitDatas><Item><modelName>car</modelName></Item></InitDatas></CVehicleModelInfo__InitDataList>');
const handling = '<?xml version="1.0" encoding="UTF-8"?>\n<CHandlingDataMgr>\n  <HandlingData>\n    <Item type="CHandlingData">\n      <handlingName>CAR</handlingName>\n      <fMass value="2500.000000" />\n      <SubHandlingData>\n        <Item type="NULL" />\n      </SubHandlingData>\n    </Item>\n  </HandlingData>\n</CHandlingDataMgr>\n';
const truncated = handling.slice(0, handling.indexOf('</SubHandlingData>') + '</SubHandlingData>'.length);
function pack({ handlingData = Buffer.from(handling), vehiclesData = vehicles, yft = 'car.yft', vehiclesName = 'vehicles.meta' } = {}) {
  return makeRpf([
    { name: yft, data: resource, resource: true },
    { name: vehiclesName, data: vehiclesData, compressed: true },
    { name: 'handling.meta', data: handlingData, compressed: true },
  ]);
}
async function convert(t, archive) {
  const root = await folder(t), source = path.join(root, 'dlc.rpf');
  await writeFile(source, archive);
  const [preview] = await inspectFolder(root);
  const [result] = await convertFolder(root);
  assert.deepEqual(await readFile(source), archive, 'the source RPF is never changed');
  return { preview, result };
}
const warning = (item, pattern) => item.audit?.issues.some(issue => issue.code === 'XML_REPAIRED' && pattern.test(issue.message));

test('a handling.meta cut right after a closing tag is completed, warned and published repaired', async t => {
  const { preview, result } = await convert(t, pack({ handlingData: Buffer.from(truncated) }));
  assert.equal(preview.ok, true, preview.error);
  assert.ok(warning(preview, /^handling\.meta estava incompleto no final; as tags de fechamento foram completadas\. Confira o veículo no jogo\.$/));
  assert.equal(result.ok, true, result.error);
  assert.ok(warning(result, /handling\.meta estava incompleto/));
  const published = await readFile(path.join(result.output, 'data/handling.meta'), 'utf8');
  assert.ok(published.startsWith(truncated), 'existing text is kept byte for byte');
  assert.match(published.slice(truncated.length), /^\s*<\/Item>\s*<\/HandlingData>\s*<\/CHandlingDataMgr>\s*$/);
});

test('a file cut inside a value, attribute or tag is refused with file, line and what to do', async t => {
  for (const [cut, what] of [[handling.indexOf('2500') + 2, 'um atributo'], [handling.indexOf('CAR<') + 2, 'um valor'], [handling.indexOf('<SubHandlingData') + 6, 'uma tag']]) {
    const { result } = await convert(t, pack({ handlingData: Buffer.from(handling.slice(0, cut)) }));
    assert.equal(result.ok, false);
    assert.match(result.error, new RegExp(String.raw`O arquivo handling\.meta está incompleto: termina no meio de ${what} \(perto da linha \d+\)\. Corrija o arquivo no RPF de origem e tente de novo\.`));
  }
});

test('other XML defects are refused with the approximate line', () => {
  assert.throws(() => readXml(Buffer.from('<A>\n<B></C>\n</A>'), 'carcols.meta'), /O arquivo carcols\.meta tem XML inválido perto da linha 2 \(uma tag de fechamento não corresponde à de abertura\)\. Corrija o arquivo no RPF de origem e tente de novo\./);
  assert.throws(() => readXml(Buffer.from('<A><B>'), 'x.meta'), /termina logo depois de abrir <B>/);
});

test('UTF-8 BOM and blank lines before the declaration are tolerated with a warning', async t => {
  const { result } = await convert(t, pack({ handlingData: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('\r\n  \n' + handling)]) }));
  assert.equal(result.ok, true, result.error);
  assert.ok(warning(result, /antes da declaração XML/));
  assert.match(await readFile(path.join(result.output, 'data/handling.meta'), 'utf8'), /^<\?xml/);
});

test('NUL bytes and junk after the closing root tag are discarded with a warning', async t => {
  const nul = await convert(t, pack({ handlingData: Buffer.concat([Buffer.from(handling), Buffer.alloc(64)]) }));
  assert.equal(nul.result.ok, true, nul.result.error);
  assert.ok(warning(nul.result, /bytes nulos/));
  const junk = await convert(t, pack({ handlingData: Buffer.from(handling + 'xx\u0001garbage') }));
  assert.equal(junk.result.ok, true, junk.result.error);
  assert.ok(warning(junk.result, /bytes sobrando depois da tag final/));
  assert.ok(!(await readFile(path.join(junk.result.output, 'data/handling.meta'), 'utf8')).includes('garbage'));
});

test('UTF-16 metas with BOM are read and published as UTF-8', async t => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(handling.replace('UTF-8', 'UTF-16'), 'utf16le')]);
  const { result } = await convert(t, pack({ handlingData: utf16 }));
  assert.equal(result.ok, true, result.error);
  assert.ok(warning(result, /UTF-16/));
  const published = await readFile(path.join(result.output, 'data/handling.meta'), 'utf8');
  assert.match(published, /encoding="UTF-8"/);
  assert.match(published, /<fMass value="2500\.000000" \/>/);
});

test('entry names that differ only in case from the declared model still match', async t => {
  const upper = Buffer.from(vehicles.toString().replace('<modelName>car</modelName>', '<modelName>Car</modelName>'));
  const { result } = await convert(t, pack({ yft: 'CAR.YFT', vehiclesName: 'VEHICLES.META', vehiclesData: upper }));
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.models, ['car']);
});

test('a clean meta is published untouched and without warnings', async t => {
  const { result } = await convert(t, pack());
  assert.equal(result.ok, true, result.error);
  assert.ok(!result.audit.issues.some(issue => issue.code === 'XML_REPAIRED'));
  assert.equal(await readFile(path.join(result.output, 'data/handling.meta'), 'utf8'), handling);
});
