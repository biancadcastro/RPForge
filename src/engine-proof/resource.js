// Restricted RSC7 research profile. No game assets or external runtime libraries.
import {deflateRawSync, inflateRawSync} from 'node:zlib';
export const MAX_PAGE = 8 * 1024 * 1024;
export function requireThat(value, message) { if (!value) throw new Error(message); }
export function checkedInteger(n, min, max, label) {
  requireThat(Number.isInteger(n) && n >= min && n <= max, `Invalid ${label}`); return n;
}
// Budget for one decoded region (system or graphics). Not a claim about game limits.
export const MAX_REGION = 8 * 1024 * 1024;
export const MAX_PAGES = 128;
// RSC7 page-count fields: [bit offset, bit width] for size classes base<<8 ... base<<0.
const PAGE_FIELDS = [[4, 1], [5, 2], [7, 4], [11, 6], [17, 7], [24, 1], [25, 1], [26, 1], [27, 1]];
export function pageLayout(flags) {
  // Readers accept any page split; the writer below still emits a single page.
  const base = 512 * 2 ** (flags & 15), pages = [];
  PAGE_FIELDS.forEach(([shift, width], i) => {
    const count = (flags >>> shift) & ((1 << width) - 1), size = base * 2 ** (8 - i);
    for (let n = 0; n < count; n++) pages.push(size);
  });
  const total = pages.reduce((sum, size) => sum + size, 0);
  requireThat(pages.length <= MAX_PAGES, 'Unsupported page layout');
  requireThat(total <= MAX_REGION, 'Page exceeds proof budget');
  return {pages, total};
}
export function pageSize(flags) { return pageLayout(flags).total; }
function padded(bytes) {
  requireThat(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_PAGE, 'Invalid page bytes');
  let size = 8192, shift = 4;
  while (size < bytes.length) { size *= 2; shift++; }
  const data = Buffer.alloc(size); bytes.copy(data); return {data, flags: 0x08000000 + shift};
}
export function encodeResource(version, system, graphics = null) {
  checkedInteger(version, 0, 255, 'resource version');
  const s = padded(system), g = graphics ? padded(graphics) : null, header = Buffer.alloc(16);
  header.write('RSC7'); header.writeUInt32LE(version, 4);
  header.writeUInt32LE((s.flags | ((version >>> 4) << 28)) >>> 0, 8);
  header.writeUInt32LE(((g?.flags ?? 0) | ((version & 15) << 28)) >>> 0, 12);
  const raw = g ? Buffer.concat([s.data, g.data]) : s.data;
  return Buffer.concat([header, deflateRawSync(raw, {level: 6})]);
}
export function decodeResource(bytes, version) {
  requireThat(Buffer.isBuffer(bytes) && bytes.length >= 18 && bytes.length <= MAX_PAGE * 2, 'Invalid resource size');
  requireThat(bytes.toString('ascii', 0, 4) === 'RSC7' && bytes.readUInt32LE(4) === version, 'Unsupported resource version');
  const sf = bytes.readUInt32LE(8), gf = bytes.readUInt32LE(12);
  requireThat((sf >>> 28) === (version >>> 4) && (gf >>> 28) === (version & 15), 'Resource version flags mismatch');
  const systemSize = pageSize(sf), graphicsSize = pageSize(gf);
  requireThat(systemSize > 0, 'Missing system pages');
  const expected = systemSize + graphicsSize;
  const decoded = inflateRawSync(bytes.subarray(16), {maxOutputLength: expected, info: true});
  requireThat(decoded.buffer.length === expected, 'Resource page size mismatch');
  requireThat(decoded.engine.bytesWritten === bytes.length - 16, 'Trailing resource bytes');
  return {system: decoded.buffer.subarray(0, systemSize), graphics: decoded.buffer.subarray(systemSize),
    systemPages: pageLayout(sf).pages.length, graphicsPages: pageLayout(gf).pages.length};
}
export class Arena {
  constructor() { this.bytes = Buffer.alloc(4096); this.cursor = 0; }
  allocate(size) {
    checkedInteger(size, 1, MAX_PAGE, 'block size'); // Writer still emits a single page per region.
    const at = (this.cursor + 15) & ~15;
    requireThat(at + size <= MAX_PAGE, 'Allocation exceeds proof budget');
    if (at + size > this.bytes.length) {
      let capacity = this.bytes.length; while (capacity < at + size) capacity *= 2;
      const next = Buffer.alloc(capacity); this.bytes.copy(next); this.bytes = next;
    }
    this.cursor = at + size; return at;
  }
  pointer(at, target, region = 0x50000000) { this.bytes.writeBigUInt64LE(BigInt(region + target), at); }
  u32(at, value) { this.bytes.writeUInt32LE(value >>> 0, at); }
  u16(at, value) { this.bytes.writeUInt16LE(value, at); }
  float(at, value) { requireThat(Number.isFinite(value), 'Nonfinite float'); this.bytes.writeFloatLE(value, at); }
  finish() { return this.bytes.subarray(0, this.cursor); }
}
export class View {
  constructor(resource) { Object.assign(this, resource); }
  range(region, at, length) {
    const b = this[region]; requireThat(Number.isSafeInteger(at) && Number.isSafeInteger(length) && at >= 0 && length >= 0 && at + length <= b.length, 'Pointer outside resource');
    return b.subarray(at, at + length);
  }
  ptr(at, length, region = 'system') {
    const b = this.range('system', at, 8), p = b.readBigUInt64LE();
    const base = region === 'system' ? 0x50000000n : 0x60000000n;
    requireThat(p >= base && p <= base + BigInt(MAX_REGION), 'Invalid resource pointer');
    const off = Number(p - base); this.range(region, off, length); return off;
  }
  // Pointer that may target either region (e.g. vertex data). Returns {region, off}.
  ptrAny(at, length) {
    const p = this.range('system', at, 8).readBigUInt64LE(), region = p >= 0x60000000n ? 'graphics' : 'system';
    return {region, off: this.ptr(at, length, region)};
  }
  zero(at, length) { requireThat(this.range('system', at, length).every(x => x === 0), 'Unsupported field in proof profile'); }
  // Every byte of a structure is either a field validated by the caller or must be zero.
  known(at, length, fields) {
    const b = Buffer.from(this.range('system', at, length));
    for (const [o, l] of fields) b.fill(0, o, o + l);
    requireThat(b.every(x => x === 0), 'Unsupported field in proof profile');
  }
  // Page-info block (16 bytes + 8 per page). Content is runtime bookkeeping; counts must be sane.
  pagesInfo(at) {
    const off = this.ptr(at, 16), system = this.system[off + 8], graphics = this.system[off + 9];
    requireThat(system >= 1, 'Invalid page info');
    const length = 16 + 8 * (system + graphics); this.known(off, length, [[8, 2]]);
    return {off, length, system, graphics};
  }
  // Blocks may not overlap (identical shared blocks are allowed once) and every byte
  // outside them must be zero: no hidden payload, no aliasing between structures.
  exclusive(blocks) {
    const seen = new Set();
    for (const region of ['system', 'graphics']) {
      const bytes = this[region], list = [];
      for (const [r, off, len] of blocks) { const key = `${r}:${off}:${len}`; if (r === region && !seen.has(key)) { seen.add(key); list.push([off, off + len]); } }
      list.sort((x, y) => x[0] - y[0]);
      let cursor = 0;
      const gapIsZero = (from, to) => { for (let i = from; i < to; i++) if (bytes[i] !== 0) return false; return true; };
      for (const [start, end] of list) {
        requireThat(start >= cursor, 'Overlapping resource blocks');
        requireThat(gapIsZero(cursor, start), 'Unreferenced resource data'); cursor = end;
      }
      requireThat(gapIsZero(cursor, bytes.length), 'Unreferenced resource data');
    }
  }
  u32(at) { return this.range('system', at, 4).readUInt32LE(); }
  u16(at) { return this.range('system', at, 2).readUInt16LE(); }
  float(at) { const n = this.range('system', at, 4).readFloatLE(); requireThat(Number.isFinite(n), 'Nonfinite float'); return n; }
  string(at, maximum = 128) {
    const off = this.ptr(at, 1), bytes = this.system.subarray(off, Math.min(off + maximum + 1, this.system.length));
    const end = bytes.indexOf(0); requireThat(end >= 0 && end <= maximum, 'Unterminated resource name');
    // latin1 keeps every byte; Node's 'ascii' decoder drops the high bit and would accept 0xF0 as 'p'.
    const value = bytes.subarray(0, end).toString('latin1');
    requireThat(/^[a-z0-9_./:]+$/.test(value), 'Invalid resource name'); return value;
  }
}
export function nameHash(name) {
  let h = 0; for (const b of Buffer.from(name.toLowerCase())) { h = (h + b) >>> 0; h = (h + (h << 10)) >>> 0; h ^= h >>> 6; }
  h = (h + (h << 3)) >>> 0; h ^= h >>> 11; return (h + (h << 15)) >>> 0;
}
export function proofName(name) { requireThat(typeof name === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(name), 'Invalid proof name'); return name; }
export function fileHeader(arena, at, pages) { arena.u32(at + 4, 1); arena.pointer(at + 8, pages); }
export function pagesInfo(arena, graphics) { const at = arena.allocate(graphics ? 32 : 24); arena.bytes[at + 8] = 1; arena.bytes[at + 9] = graphics ? 1 : 0; return at; }
