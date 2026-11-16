// Bounded view over the decoded system region with block bookkeeping.
// Every structure the reader interprets is registered, so strict callers can prove
// that no byte outside validated structures is non-zero and that blocks do not alias.
import {ErrorCode, ensure, fail} from './errors.js';
import {SYSTEM_BASE} from './envelope.js';

export class Region {
  constructor(bytes) {
    this.bytes = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.blocks = [];
  }
  check(at, length, what = 'block') {
    if (!(Number.isSafeInteger(at) && Number.isSafeInteger(length) && at >= 0 && length >= 0 && at + length <= this.bytes.length)) {
      fail(ErrorCode.POINTER_OUT_OF_RANGE, `${what} outside resource`, {at, length});
    }
    return at;
  }
  /** Register a structure [at, at+length). Identical re-registration (shared block) is allowed. */
  claim(at, length, what) { this.check(at, length, what); this.blocks.push([at, length, what]); return at; }
  u8(at) { this.check(at, 1); return this.bytes[at]; }
  u16(at) { this.check(at, 2); return this.dv.getUint16(at, true); }
  u32(at) { this.check(at, 4); return this.dv.getUint32(at, true); }
  i32(at) { this.check(at, 4); return this.dv.getInt32(at, true); }
  f32(at) { this.check(at, 4); return this.dv.getFloat32(at, true); }
  /** Finite float or a NONFINITE_VALUE failure naming the field. */
  finite(at, what) {
    const v = this.f32(at);
    ensure(Number.isFinite(v), ErrorCode.NONFINITE_VALUE, `Non-finite ${what}`, {at});
    return v;
  }
  /** Raw 64-bit pointer as a safe Number (pointers above 2^53 are rejected). */
  rawPointer(at) {
    this.check(at, 8);
    const lo = this.dv.getUint32(at, true), hi = this.dv.getUint32(at + 4, true);
    ensure(hi === 0, ErrorCode.POINTER_OUT_OF_RANGE, 'Pointer outside system region', {at});
    return lo;
  }
  /** Null (0) or offset into the system region with `length` readable bytes. */
  pointer(at, length, what, {nullable = false} = {}) {
    const p = this.rawPointer(at);
    if (p === 0) { ensure(nullable, ErrorCode.INCONSISTENT_REFERENCE, `Missing ${what}`, {at}); return null; }
    ensure(p >= SYSTEM_BASE && p < SYSTEM_BASE + this.bytes.length, ErrorCode.POINTER_OUT_OF_RANGE, `${what} pointer outside system region`, {at, pointer: p});
    return this.check(p - SYSTEM_BASE, length, what);
  }
  /** Fields of a fixed structure not listed in `known` must be zero; returns the offending ranges. */
  nonZeroOutside(at, length, known) {
    const mask = new Uint8Array(length);
    for (const [o, l] of known) mask.fill(1, o, o + l);
    const found = [];
    for (let i = 0; i < length; i++) if (!mask[i] && this.bytes[at + i] !== 0) found.push(i);
    return found;
  }
  /** Zero-terminated latin1 name, printable subset. */
  string(at, maximum) {
    let end = at;
    const limit = Math.min(this.bytes.length, at + maximum + 1);
    while (end < limit && this.bytes[end] !== 0) end++;
    ensure(end < limit, ErrorCode.INCONSISTENT_REFERENCE, 'Unterminated name', {at});
    let s = '';
    for (let i = at; i < end; i++) s += String.fromCharCode(this.bytes[i]);
    ensure(/^[\x20-\x7e]*$/.test(s), ErrorCode.INCONSISTENT_REFERENCE, 'Name contains non-printable bytes', {at});
    return {value: s, length: end - at + 1};
  }
  /** Overlaps and non-zero bytes outside registered blocks. Returns a report; strict callers throw. */
  coverage() {
    const unique = new Map();
    for (const [at, len, what] of this.blocks) { const k = `${at}:${len}`; if (!unique.has(k)) unique.set(k, [at, len, what]); }
    const list = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const overlaps = []; let cursor = 0, unreferenced = 0, firstUnreferenced = -1, last = null;
    const scan = (from, to) => { for (let i = from; i < to; i++) if (this.bytes[i] !== 0) { unreferenced++; if (firstUnreferenced < 0) firstUnreferenced = i; } };
    for (const block of list) {
      const [at, len] = block;
      if (at < cursor) overlaps.push({a: last[2], b: block[2], at});
      else scan(cursor, at);
      if (at + len > cursor) { cursor = at + len; last = block; }
    }
    scan(cursor, this.bytes.length);
    return {blocks: list.length, overlaps, unreferencedBytes: unreferenced, firstUnreferenced};
  }
  requireExclusive() {
    const c = this.coverage();
    ensure(c.overlaps.length === 0, ErrorCode.OVERLAPPING_BLOCKS, 'Overlapping resource blocks', c.overlaps[0]);
    ensure(c.unreferencedBytes === 0, ErrorCode.UNREFERENCED_DATA, 'Unreferenced resource data', {bytes: c.unreferencedBytes, at: c.firstUnreferenced});
    return c;
  }
}
