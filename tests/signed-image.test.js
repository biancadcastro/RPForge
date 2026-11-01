import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageDigest } from '../scripts/signed-image.mjs';

function fixture() {
  const data = Buffer.alloc(513);
  data.writeUInt16LE(0x5a4d); data.writeUInt32LE(64, 60);
  data.writeUInt32LE(0x4550, 64); data.writeUInt16LE(240, 84);
  data.writeUInt16LE(0x20b, 88); data.writeUInt32LE(16, 196);
  data[512] = 42;
  return data;
}
function signed(data) {
  const offset = Math.ceil(data.length / 8) * 8;
  const result = Buffer.alloc(offset + 16); data.copy(result);
  result.writeUInt32LE(1234, 152);
  result.writeUInt32LE(offset, 232); result.writeUInt32LE(16, 236);
  result.fill(7, offset);
  return result;
}
test('signing changes only the certificate, alignment and mutable PE fields', () => {
  const original = fixture(); const copy = signed(original);
  assert.equal(imageDigest(original), imageDigest(copy));
  copy[512] ^= 1;
  assert.notEqual(imageDigest(original), imageDigest(copy));
  assert.equal(original.readUInt32LE(232), 0, 'does not modify caller buffer');
});
test('rejects malformed certificate ranges and unsupported PE images', () => {
  assert.throws(() => imageDigest(Buffer.alloc(30)));
  const bad = signed(fixture()); bad.writeUInt32LE(1, 232);
  assert.throws(() => imageDigest(bad));
  const trailing = Buffer.concat([signed(fixture()), Buffer.from([1])]);
  assert.throws(() => imageDigest(trailing));
  const missing = fixture(); missing.writeUInt32LE(16, 236);
  assert.throws(() => imageDigest(missing));
});
