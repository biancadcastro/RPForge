// Bounded, pointer-checked access to the decoded pages of a resource, with a block log
// (what was read, where, how long) used for coverage reports and in-place patching.
import {SYSTEM_BASE, GRAPHICS_BASE} from './resource.js';
import {ErrorCode, ensure, fail} from '../animation-engine/errors.js';

const LATIN1 = new TextDecoder('latin1');

export class ResourceView {
  constructor({system, graphics}) {
    this.system = system; this.graphics = graphics ?? new Uint8Array(0);
    this.sdv = new DataView(system.buffer, system.byteOffset, system.byteLength);
    this.gdv = new DataView(this.graphics.buffer, this.graphics.byteOffset, this.graphics.byteLength);
    this.blocks = [];
    this.pointerFields = new Map(); // field address -> {region, off} for every non-null pointer the reader followed
  }
  /** Record a structure we decoded. Kinds are informational (coverage report). */
  mark(region, off, length, kind) { if (length > 0) this.blocks.push({region, off, length, kind}); }
  check(region, off, length) {
    const size = region === 'system' ? this.system.length : this.graphics.length;
    ensure(Number.isSafeInteger(off) && Number.isSafeInteger(length) && off >= 0 && length >= 0 && off + length <= size,
      ErrorCode.POINTER_OUT_OF_RANGE, 'Pointer outside resource', {region, off, length});
  }
  dv(region) { return region === 'system' ? this.sdv : this.gdv; }
  u8(at) { this.check('system', at, 1); return this.system[at]; }
  u16(at) { this.check('system', at, 2); return this.sdv.getUint16(at, true); }
  i16(at) { this.check('system', at, 2); return this.sdv.getInt16(at, true); }
  u32(at) { this.check('system', at, 4); return this.sdv.getUint32(at, true); }
  f32(at) { this.check('system', at, 4); return this.sdv.getFloat32(at, true); }
  vec3(at) { return [this.f32(at), this.f32(at + 4), this.f32(at + 8)]; }
  vec4(at) { return [this.f32(at), this.f32(at + 4), this.f32(at + 8), this.f32(at + 12)]; }
  /** Raw 64-bit pointer value as {region, off} or null. */
  pointer(at) {
    this.check('system', at, 8);
    const lo = this.sdv.getUint32(at, true), hi = this.sdv.getUint32(at + 4, true);
    if (lo === 0 && hi === 0) return null;
    ensure(hi === 0, ErrorCode.POINTER_OUT_OF_RANGE, 'Invalid 64-bit resource pointer', {at});
    let target = null;
    if (lo >= GRAPHICS_BASE && lo < GRAPHICS_BASE + 0x10000000) target = {region: 'graphics', off: lo - GRAPHICS_BASE};
    else if (lo >= SYSTEM_BASE && lo < SYSTEM_BASE + 0x10000000) target = {region: 'system', off: lo - SYSTEM_BASE};
    if (target) { this.pointerFields.set(at, target); return target; }
    fail(ErrorCode.POINTER_OUT_OF_RANGE, 'Pointer outside both regions', {at, value: lo});
  }
  /** System pointer whose target must hold `length` bytes; null when the field is 0. */
  ptr(at, length = 1) {
    const p = this.pointer(at); if (!p) return null;
    ensure(p.region === 'system', ErrorCode.UNSUPPORTED_STRUCTURE, 'Expected a system-page pointer', {at});
    this.check('system', p.off, length); return p.off;
  }
  /** Pointer that may target either region; target range is checked. */
  ptrAny(at, length) { const p = this.pointer(at); if (p) this.check(p.region, p.off, length); return p; }
  /** NUL-terminated latin1 string (names are not restricted here; editors validate on write). */
  cstring(off, maximum = 256) {
    this.check('system', off, 1);
    const end = Math.min(off + maximum + 1, this.system.length);
    let i = off; while (i < end && this.system[i] !== 0) i++;
    ensure(i < end, ErrorCode.INCONSISTENT_REFERENCE, 'Unterminated resource string', {off});
    this.mark('system', off, i - off + 1, 'string');
    return LATIN1.decode(this.system.subarray(off, i));
  }
  stringAt(at, maximum = 256) { const p = this.ptr(at); return p === null ? null : this.cstring(p, maximum); }
  /** Fixed-size char array (e.g. physics group names: 40 bytes). */
  fixedString(at, length) {
    this.check('system', at, length);
    const bytes = this.system.subarray(at, at + length), end = bytes.indexOf(0);
    return LATIN1.decode(end < 0 ? bytes : bytes.subarray(0, end));
  }
}

/** Sum of the bytes covered by the block log, per region, counting overlaps once. */
export function coverage(view) {
  const out = {};
  for (const region of ['system', 'graphics']) {
    const list = view.blocks.filter(b => b.region === region).map(b => [b.off, b.off + b.length]).sort((a, b) => a[0] - b[0]);
    let covered = 0, cursor = 0;
    for (const [s, e] of list) { if (e <= cursor) continue; covered += e - Math.max(s, cursor); cursor = e; }
    const bytes = region === 'system' ? view.system : view.graphics;
    let nonZero = 0; for (let i = 0; i < bytes.length; i++) if (bytes[i] !== 0) nonZero++;
    // Non-zero bytes no decoded block explains (unknown structures still to map).
    let unexplained = 0, j = 0;
    const merged = []; cursor = -1;
    for (const [s, e] of list) { if (merged.length && s <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e); else merged.push([s, e]); }
    for (let i = 0; i < bytes.length; i++) {
      while (j < merged.length && merged[j][1] <= i) j++;
      if (bytes[i] !== 0 && !(j < merged.length && merged[j][0] <= i)) unexplained++;
    }
    out[region] = {bytes: bytes.length, covered, nonZero, unexplainedNonZero: unexplained};
  }
  return out;
}

/**
 * Qwords inside decoded system blocks (and in unexplained gaps) that look like resource
 * pointers but were never followed by the reader. Each one is a pointer field the full
 * writer would fail to relocate. Bulk payloads (vertex/index data) are skipped.
 */
// Fields known to hold data that can look like a pointer (e.g. a float). Checked against the oracle.
const NOT_POINTERS = new Set(['PhysGroup+0xa8', 'FragDrawable+0x98']);
// Bulk numeric payloads: never scanned, and a candidate pointing into them is coincidence.
const BULK = ['VertexData', 'IndexData', 'BoundVertices', 'BoundVerticesShrunk', 'BoundPolygons', 'BoundVertexColours', 'BVHNodes', 'BVHTrees', 'string'];
export function unfollowedPointers(view, {skipKinds = BULK} = {}) {
  const sys = view.system, size = sys.length, gsize = view.graphics.length, dv = view.sdv, out = [];
  const looks = at => {
    if (dv.getUint32(at + 4, true) !== 0) return false;
    const lo = dv.getUint32(at, true);
    return (lo >= SYSTEM_BASE && lo < SYSTEM_BASE + size) || (gsize > 0 && lo >= GRAPHICS_BASE && lo < GRAPHICS_BASE + gsize);
  };
  const skip = new Uint8Array(size);
  for (const b of view.blocks) if (b.region === 'system' && skipKinds.includes(b.kind)) skip.fill(1, b.off, b.off + b.length);
  for (let at = 0; at + 8 <= size; at += 8) {
    if (skip[at] || view.pointerFields.has(at) || !looks(at)) continue;
    const owner = view.blocks.filter(b => b.region === 'system' && b.off <= at && at < b.off + b.length).sort((a, b) => a.length - b.length)[0];
    const target = dv.getUint32(at, true) - SYSTEM_BASE;
    if (target >= 0 && target < size && skip[target]) continue;
    if (owner && NOT_POINTERS.has(`${owner.kind}+0x${(at - owner.off).toString(16)}`)) continue;
    out.push({at, value: dv.getUint32(at, true), owner: owner ? {kind: owner.kind, off: owner.off, field: at - owner.off} : null});
  }
  return out;
}
