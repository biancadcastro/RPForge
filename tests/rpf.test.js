import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { deflateRawSync } from 'node:zlib';
import { readRpf, WORKER_LIMITS, LIMITS } from '../src/rpf.js';
import { makeRpf, vehicleArchive } from './fixture.js';

test('extracts compressed binary and rebuilds RSC7 header without changing payload', () => {
  const files = [...readRpf(vehicleArchive())];
  assert.equal(files.length, 4);
  const resource = files.find(f => f.path === 'car.yft').data;
  assert.equal(resource.toString('ascii', 0, 4), 'RSC7');
  assert.equal(resource.readUInt32LE(4), 0x12);
  assert.equal(inflateRawSync(resource.subarray(16)).toString(), 'synthetic geometry');
  assert.match(files.find(f => f.path === 'vehicles.meta').data.toString(), /<modelName>car/);
});

test('compressed entries inflate only up to their declared size', () => {
  const archive = makeRpf([{ name: 'big.meta', data: Buffer.alloc(64 * 1024, 65), compressed: true }]);
  archive.writeUInt32LE(1024, 32 + 8); // entry 0 now declares 1 KiB unpacked but expands to 64 KiB
  assert.throws(() => [...readRpf(archive)]);
});

test('worker profile applies tighter limits without changing the desktop profile', () => {
  const large = makeRpf([{ name: 'large.meta', data: Buffer.alloc(17 * 1024 * 1024, 66) }]);
  assert.equal([...readRpf(large)][0].data.length, 17 * 1024 * 1024);
  assert.throws(() => [...readRpf(large, '', { bytes: 0, entries: 0, limits: WORKER_LIMITS })], /limite/i);
  assert.equal(LIMITS.fileBytes, 256 * 1024 * 1024); // desktop support preserved during migration
  assert.ok(Object.isFrozen(WORKER_LIMITS) && WORKER_LIMITS.fileBytes <= 128 * 1024 * 1024);
});

test('extracts nested RPF archives recursively', () => {
  const archive = makeRpf([{ name: 'vehicles.rpf', data: vehicleArchive() }]);
  assert.equal([...readRpf(archive)][0].path, 'vehicles.rpf/car.yft');
});

test('preserves real resource page flags and Legacy drawable version when rebuilding RSC7', () => {
  const header = Buffer.alloc(16); header.write('RSC7'); header.writeUInt32LE(165, 4);
  header.writeUInt32LE(0xa0000000, 8); header.writeUInt32LE(0x50000000, 12);
  const source = Buffer.concat([header, Buffer.from('own fixture payload')]);
  const archive = makeRpf([{ name: 'own.ydr', data: source, resource: true, systemFlags: 0xa0000000, graphicsFlags: 0x50000000 }]);
  const [file] = [...readRpf(archive)];
  assert.deepEqual(file.data, source);
});

test('rejects encrypted, truncated, cyclical and unsafe archives', () => {
  const encrypted = vehicleArchive();
  encrypted.writeUInt32LE(0x0ffffff9, 12);
  assert.throws(() => [...readRpf(encrypted)], /criptografado/);
  assert.throws(() => [...readRpf(vehicleArchive().subarray(0, 50))], /truncada/);
  const cyclic = vehicleArchive();
  cyclic.writeUInt32LE(0, 24);
  assert.throws(() => [...readRpf(cyclic)], /cíclica/);
  for (const name of ['../escape.yft', 'CON.ytd', 'bad:name.meta', 'trailing.']) {
    assert.throws(() => [...readRpf(makeRpf([{ name, data: Buffer.from('test') }]))], /inválido/);
  }
});

test('rejects offsets into table and mismatched decompression lengths', () => {
  const offset = vehicleArchive();
  offset.writeUIntLE(0x800000, 37, 3);
  assert.throws(() => [...readRpf(offset)], /offset inválido/);
  const mismatch = makeRpf([{ name: 'file.meta', data: Buffer.from('text'), compressed: true }]);
  mismatch.writeUInt32LE(100, 40);
  assert.throws(() => [...readRpf(mismatch)], /divergente/);
});

test('stored nested RPF uses the archive limit and counts only its leaf files', () => {
  const limits = { archiveBytes: 64 * 1024, fileBytes: 2 * 1024, totalBytes: 2 * 1024, entries: 1000, depth: 16 };
  const inner = makeRpf([{ name: 'car.meta', data: Buffer.alloc(1800, 65) }]);
  assert.ok(inner.length > limits.fileBytes);
  const outer = makeRpf([{ name: 'dlc.rpf', data: inner }]);
  const files = [...readRpf(outer, '', { bytes: 0, entries: 0, limits })];
  assert.deepEqual(files.map(f => f.path), ['dlc.rpf/car.meta']);
  const leaf = makeRpf([{ name: 'big.meta', data: Buffer.alloc(3 * 1024, 66) }]);
  assert.throws(() => [...readRpf(leaf, '', { bytes: 0, entries: 0, limits })], /Tamanho ou offset inválido/);
  const compressedNested = makeRpf([{ name: 'dlc.rpf', data: makeRpf([{ name: 'a.meta', data: Buffer.alloc(4096, 1) }]), compressed: true }]);
  assert.throws(() => [...readRpf(compressedNested, '', { bytes: 0, entries: 0, limits })]);
  assert.equal(LIMITS.archiveBytes, 768 * 1024 * 1024);
});
