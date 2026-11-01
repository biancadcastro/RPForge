import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import path from 'node:path';
import os from 'node:os';
import { readDrawable, buildYtyp, generateFolderYtyp, jenkHash } from '../src/ytyp.js';

export function drawable(min = [-1, -2, -3], max = [1, 2, 3], center = [0, 0, 0], radius = 4) {
  const raw = Buffer.alloc(512);
  for (const [offset, vector] of [[0x20, center], [0x30, min], [0x40, max]]) vector.forEach((v, i) => raw.writeFloatLE(v, offset + i * 4));
  raw.writeFloatLE(radius, 0x2c);
  const header = Buffer.alloc(16); header.write('RSC7'); header.writeUInt32LE(165, 4);
  return Buffer.concat([header, deflateRawSync(raw)]);
}

test('reads actual drawable bounds, rejects corrupt or non-Legacy models before generation', () => {
  assert.deepEqual(readDrawable(drawable(), 'sample.ydr'), { name: 'sample', min: [-1, -2, -3], max: [1, 2, 3], center: [0, 0, 0], radius: 4 });
  assert.throws(() => readDrawable(Buffer.from('not a drawable'), 'bad.ydr'), /inválido/);
  assert.throws(() => readDrawable(drawable([2, 0, 0], [1, 2, 3]), 'bad.ydr'), /Limites/);
  assert.throws(() => readDrawable(drawable([NaN, 0, 0]), 'bad.ydr'), /Limites/);
  assert.equal(jenkHash('adder'), 3078201489);
});

test('generates all YDRs in one click without touching models or existing YTYP, no reports or shortcuts', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-ytyp-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = drawable();
  await writeFile(path.join(root, 'first.ydr'), source);
  await writeFile(path.join(root, 'second.YDR'), drawable([-2, -2, -2], [2, 2, 2]));
  await writeFile(path.join(root, 'rpforge_props.ytyp'), 'existing content');
  const [result] = await generateFolderYtyp(root);
  assert.deepEqual(result.models, ['first', 'second']);
  assert.equal(result.generated.length, 1);
  assert.equal(path.basename(result.generated[0]), 'rpforge_props_1.ytyp');
  const output = await readFile(result.generated[0]);
  assert.equal(output.toString('ascii', 0, 4), 'RSC7');
  assert.equal(output.readUInt32LE(4), 2);
  const data = inflateRawSync(output.subarray(16));
  // Independent lookup of model identity in the emitted resource, not a sidecar XML.
  const hashBytes = Buffer.alloc(4); hashBytes.writeUInt32LE(jenkHash('first'));
  assert.ok(data.includes(hashBytes));
  assert.deepEqual(await readFile(path.join(root, 'first.ydr')), source);
  assert.equal(await readFile(path.join(root, 'rpforge_props.ytyp'), 'utf8'), 'existing content');
  assert.deepEqual((await readdir(root)).sort(), ['first.ydr', 'rpforge_props.ytyp', 'rpforge_props_1.ytyp', 'second.YDR']);
});

test('invalid models prevent partial files and duplicate identities are refused', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-ytyp-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'valid.ydr'), drawable());
  await writeFile(path.join(root, 'invalid.ydr'), 'bad');
  await assert.rejects(generateFolderYtyp(root), /inválido/);
  assert.deepEqual((await readdir(root)).sort(), ['invalid.ydr', 'valid.ydr']);
  const model = readDrawable(drawable(), 'a.ydr');
  assert.throws(() => buildYtyp([model, model], 'props'), /repetido/);
});

test('257 models split into two YTYPs without dropping the boundary model', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-ytyp-batch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = drawable();
  for (let i = 0; i < 257; i++) await writeFile(path.join(root, 'own_' + String(i).padStart(3, '0') + '.ydr'), bytes);
  const [result] = await generateFolderYtyp(root);
  assert.equal(result.models.length, 257); assert.equal(result.generated.length, 2);
  const hash = Buffer.alloc(4); hash.writeUInt32LE(jenkHash('own_256'));
  assert.ok(inflateRawSync((await readFile(result.generated[1])).subarray(16)).includes(hash));
  assert.equal((await readdir(root)).filter(n => n.endsWith('.ydr')).length, 257);
});

test('failed multi-file generation rolls back its own outputs and preserves existing files', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'forge-ytyp-rollback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (let i = 0; i < 257; i++) await writeFile(path.join(root, `model_${i}.ydr`), drawable());
  await writeFile(path.join(root, 'rpforge_props.ytyp'), 'user file');
  await assert.rejects(generateFolderYtyp(root, { onProgress(event) {
    if (event.phase === 'write' && event.current === 2) throw new Error('simulated publication failure');
  } }), /simulated publication failure/);
  assert.deepEqual((await readdir(root)).filter(name => !name.endsWith('.ydr')), ['rpforge_props.ytyp']);
  assert.equal(await readFile(path.join(root, 'rpforge_props.ytyp'), 'utf8'), 'user file');
});
