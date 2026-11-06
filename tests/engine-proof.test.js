import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {writeYdd, readYdd} from '../src/engine-proof/ydd.js';
import {writeYcd, readYcd} from '../src/engine-proof/ycd.js';
import {encodeResource, decodeResource, MAX_PAGE} from '../src/engine-proof/resource.js';

const mesh = {name: 'proof_triangle', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2]};
const motion = {name: 'proof_root', fps: 30, translations: [0, 0, 0, 0.25, 0.5, 1, 1, 0, 0]};
function altered(bytes, version, mutate) {
  const r = decodeResource(bytes, version); mutate(r.system, r.graphics);
  return encodeResource(version, r.system, r.graphics.length ? r.graphics : null);
}
test('proof YDD preserves nonempty geometry and rejects unsupported or invalid meshes', () => {
  const b = writeYdd(mesh); assert.deepEqual(readYdd(b), mesh); assert.deepEqual(writeYdd(readYdd(b)), b);
  assert.throws(() => writeYdd({...mesh, indices: [0, 1, 3]}), /vertex index/);
  assert.throws(() => writeYdd({...mesh, positions: [NaN, 0, 0]}), /vertex count|vertex/);
  assert.throws(() => writeYdd({...mesh, name: '../escape'}), /name/);
  const readOffset = (s, at) => Number(s.readBigUInt64LE(at) - 0x50000000n);
  assert.throws(() => readYdd(altered(b, 165, s => s.writeBigUInt64LE(0xffffffffffffffffn, 48))), /pointer/i);
  assert.throws(() => readYdd(altered(b, 165, s => s.writeUInt16LE(2, 40))), /count/);
  assert.throws(() => readYdd(altered(b, 165, s => { const d = readOffset(s, readOffset(s, 48)); s.writeBigUInt64LE(0x50000040n, d + 24); })), /Unsupported/);
  assert.throws(() => readYdd(altered(b, 165, s => {
    const d = readOffset(s, readOffset(s, 48)), lod = readOffset(s, d + 80), model = readOffset(s, readOffset(s, lod));
    const geom = readOffset(s, readOffset(s, model + 8)), ib = readOffset(s, geom + 56), ix = readOffset(s, ib + 16); s.writeUInt16LE(65000, ix);
  })), /index/);
});
test('proof YCD preserves varying root samples and timing at supported frame boundaries', () => {
  for (const frames of [2, 3, 31, 256]) {
    const m = {name: 'motion_' + frames, fps: 30, translations: Array.from({length: frames * 3}, (_, i) => (i % 9) * 0.25)};
    const bytes = writeYcd(m); assert.deepEqual(readYcd(bytes), m); assert.deepEqual(writeYcd(readYcd(bytes)), bytes);
  }
  assert.deepEqual(readYcd(writeYcd(motion)), motion);
  assert.throws(() => writeYcd({...motion, fps: 0}), /fps/);
  assert.throws(() => writeYcd({...motion, translations: Array(257 * 3).fill(0)}), /frame count/);
  assert.throws(() => writeYcd({...motion, translations: [0, Infinity, 0, 0, 0, 0]}), /translation/);
});
test('proof YCD refuses linked-list cycles, foreign channels and inconsistent references', () => {
  const b = writeYcd(motion), p = (s, at) => Number(s.readBigUInt64LE(at) - 0x50000000n);
  assert.throws(() => readYcd(altered(b, 46, s => { const ce = p(s, p(s, 40)); s.writeBigUInt64LE(BigInt(0x50000000 + ce), ce + 16); })), /Unsupported/);
  assert.throws(() => readYcd(altered(b, 46, s => {
    const ce = p(s, p(s, 40)), clip = p(s, ce + 8), anim = p(s, clip + 80), seq = p(s, p(s, anim + 64)); s.writeUInt16LE(1, seq + 32 + 3 * 12);
  })), /channel/);
  assert.throws(() => readYcd(altered(b, 46, s => {
    const map = p(s, 24), ae = p(s, p(s, map + 24)); s.writeUInt32LE(123, ae);
  })), /reference/);
});
test('resource envelope rejects truncation, trailing bytes, version mismatch and dishonest expansion', () => {
  for (const [version, b, read] of [[165, writeYdd(mesh), readYdd], [46, writeYcd(motion), readYcd]]) {
    for (const cut of [0, 8, 16, b.length - 3]) assert.throws(() => read(b.subarray(0, cut)));
    assert.throws(() => read(Buffer.concat([b, Buffer.from([1, 2, 3])])), /Trailing/);
    const other = Buffer.from(b); other.writeUInt32LE(version ^ 1, 4); assert.throws(() => read(other), /version/);
    const flags = Buffer.from(b); flags.writeUInt32LE(0xafffffff, 8); assert.throws(() => read(flags), /version|layout/);
  }
  const big = encodeResource(46, Buffer.alloc(32768)); const lied = Buffer.from(big); lied.writeUInt32LE(0x28000004, 8); assert.throws(() => decodeResource(lied, 46));
  assert.throws(() => encodeResource(46, Buffer.alloc(MAX_PAGE + 1)), /page/i);
});

// Re-wrap decoded regions with arbitrary page flags (the writer itself only emits one page per region).
function wrap(version, system, graphics, systemFlags, graphicsFlags) {
  const header = Buffer.alloc(16); header.write('RSC7'); header.writeUInt32LE(version, 4);
  header.writeUInt32LE((systemFlags | ((version >>> 4) << 28)) >>> 0, 8); header.writeUInt32LE((graphicsFlags | ((version & 15) << 28)) >>> 0, 12);
  return Buffer.concat([header, deflateRawSync(Buffer.concat([system, graphics]))]);
}
// Invariant: for every single-byte change the reader either refuses, or the writer reproduces
// exactly the accepted bytes. Nothing the reader accepts can be silently lost on re-export.
function mutationInvariant(bytes, version, read, write) {
  const r = decodeResource(bytes, version), flat = Buffer.concat([r.system, r.graphics]);
  let accepted = 0, refused = 0;
  for (let i = 0; i < flat.length; i++) {
    const m = Buffer.from(flat); m[i] ^= (i % 2 ? 0x01 : 0x80);
    const candidate = encodeResource(version, m.subarray(0, r.system.length), r.graphics.length ? m.subarray(r.system.length) : null);
    let model; try { model = read(candidate); } catch { refused++; continue; }
    accepted++; assert.deepEqual(write(model), candidate, `byte ${i} accepted but not reproduced`);
  }
  return {accepted, refused, total: flat.length};
}
test('every single-byte mutation of a YDD is refused or reproduced exactly', () => {
  const stats = mutationInvariant(writeYdd(mesh), 165, readYdd, writeYdd);
  assert.equal(stats.accepted + stats.refused, stats.total);
  assert.ok(stats.accepted > 0 && stats.refused > 0); // Index/value edits survive; layout edits never do.
});
test('every single-byte mutation of a YCD is refused or reproduced exactly', () => {
  const stats = mutationInvariant(writeYcd(motion), 46, readYcd, writeYcd);
  assert.equal(stats.accepted + stats.refused, stats.total);
  assert.ok(stats.accepted > 0 && stats.refused > 0);
});
test('readers refuse hidden payloads, aliasing and misplaced data', () => {
  const p = (s, at) => Number(s.readBigUInt64LE(at) - 0x50000000n), b = writeYdd(mesh), c = writeYcd(motion);
  assert.throws(() => readYdd(altered(b, 165, s => { s[s.length - 1] = 7; })), /Unreferenced/);
  assert.throws(() => readYdd(altered(b, 165, (s, g) => { g[g.length - 1] = 7; })), /Unreferenced/);
  assert.throws(() => readYcd(altered(c, 46, s => { s[4000] = 1; })), /Unreferenced/);
  // Index data aliased onto the drawable structure.
  assert.throws(() => readYdd(altered(b, 165, s => {
    const d = p(s, p(s, 48)), geom = p(s, d + 80) + 128, ib = p(s, geom + 56); s.writeBigUInt64LE(BigInt(0x50000000 + d), ib + 16);
  })), /Overlapping|Unreferenced|index/);
  // Vertex pointers disagreeing between vertex buffer and geometry.
  assert.throws(() => readYdd(altered(b, 165, s => {
    const d = p(s, p(s, 48)), geom = p(s, d + 80) + 128; s.writeBigUInt64LE(0x60000010n, geom + 120);
  })), /Vertex pointer/);
  // Index data moved to the graphics region is outside the profile.
  assert.throws(() => readYdd(altered(b, 165, s => {
    const d = p(s, p(s, 48)), geom = p(s, d + 80) + 128, ib = p(s, geom + 56); s.writeBigUInt64LE(0x60000000n, ib + 16);
  })), /pointer|Overlapping/i);
  // Declared drawable models block size must match the contiguous block.
  assert.throws(() => readYdd(altered(b, 165, s => { const d = p(s, p(s, 48)); s.writeUInt16LE(0, d + 154); })), /block size/);
  // Stored bounds must describe the stored vertices.
  assert.throws(() => readYdd(altered(b, 165, s => { const d = p(s, p(s, 48)); s.writeFloatLE(5, d + 64); })), /Bounds/);
  assert.throws(() => readYdd(altered(b, 165, (s, g) => { g.writeFloatLE(NaN, 0); })), /vertex|Bounds/i);
  assert.throws(() => readYcd(altered(c, 46, s => {
    const clip = p(s, p(s, p(s, 40)) + 8), anim = p(s, clip + 80), seq = p(s, p(s, anim + 64)); s.writeFloatLE(Infinity, seq + 32);
  })), /Nonfinite/);
});
test('readers accept a multi-page split only when page info agrees, and enforce the region budget', () => {
  const r = decodeResource(writeYcd(motion), 46), twoPages = Buffer.concat([r.system, Buffer.alloc(8192)]);
  // 0x40000 = two pages of 8 KiB (size class 4, base 512).
  assert.throws(() => readYcd(wrap(46, twoPages, Buffer.alloc(0), 0x40000, 0)), /Page info/);
  const fixed = Buffer.from(twoPages), pages = Number(fixed.readBigUInt64LE(8) - 0x50000000n); fixed[pages + 8] = 2;
  assert.deepEqual(readYcd(wrap(46, fixed, Buffer.alloc(0), 0x40000, 0)), motion);
  // Header claims beyond the 8 MiB region budget are refused before inflating.
  assert.throws(() => decodeResource(wrap(46, r.system, Buffer.alloc(0), 0x0000000f | (1 << 4), 0), 46), /budget/);
  // A small declared page cannot be used to inflate a large stream (bounded output).
  const bomb = Buffer.concat([Buffer.from('RSC7'), Buffer.alloc(12), deflateRawSync(Buffer.alloc(16 * 1024 * 1024))]);
  bomb.writeUInt32LE(46, 4); bomb.writeUInt32LE((0x08000004 | (2 << 28)) >>> 0, 8); bomb.writeUInt32LE((14 << 28) >>> 0, 12);
  assert.throws(() => decodeResource(bomb, 46));
});
test('YDD writer stores float32 data and derives bounds from what is stored', () => {
  const m = {name: 'proof_fraction', positions: [0.1, 0.2, 0.3, 1.1, -0.7, 0.3, 0.1, 1.9, 2.2], indices: [0, 1, 2]};
  const first = writeYdd(m), back = readYdd(first);
  assert.deepEqual(back.positions, m.positions.map(Math.fround));
  assert.deepEqual(writeYdd(back), first);
});
