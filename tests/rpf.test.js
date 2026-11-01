import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { readRpf } from '../src/rpf.js';
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

test('extracts nested RPF archives recursively', () => {
  const archive = makeRpf([{ name: 'vehicles.rpf', data: vehicleArchive() }]);
  assert.equal([...readRpf(archive)][0].path, 'vehicles.rpf/car.yft');
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
