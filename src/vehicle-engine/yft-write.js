// YFT writer, phase 0: in-place serialization. The decoded pages are kept as the canvas
// and every field the reader understood is written back at the address it came from.
// - writeYft(read) with no edits must reproduce the decoded pages byte for byte: that is the
//   round-trip proof that every address/encoding the reader uses is right.
// - Edits that keep sizes (bone transforms, shader vectors, vertex positions, flags) are
//   applied to the model and serialized the same way.
// Growing structures (new bones, new geometries, longer names) need relocation into new
// pages; see appendSystemPage below and docs/VEHICLE_ENGINE_FASE0.md.
import {encodeYftResource} from './resource.js';
import {SIZES} from './yft-read.js';
import {rsc7PageSizes} from '../rsc7.js';
import {ErrorCode, ensure} from '../animation-engine/errors.js';

class Canvas {
  constructor(resource) {
    this.system = Uint8Array.from(resource.system); this.graphics = Uint8Array.from(resource.graphics);
    this.sdv = new DataView(this.system.buffer); this.gdv = new DataView(this.graphics.buffer);
  }
  dv(region) { return region === 'graphics' ? this.gdv : this.sdv; }
  u16(at, x) { this.sdv.setUint16(at, x, true); }
  i16(at, x) { this.sdv.setInt16(at, x, true); }
  u32(at, x) { this.sdv.setUint32(at, x >>> 0, true); }
  f32(at, x) { ensure(Number.isFinite(x), ErrorCode.NONFINITE_VALUE, 'Nonfinite float'); this.sdv.setFloat32(at, x, true); }
  vec(at, xs) { xs.forEach((x, i) => this.f32(at + i * 4, x)); }
  /** Rewrite a NUL-terminated name in its existing slot; refuses names that do not fit. */
  string(ptrAt, value) {
    const lo = this.sdv.getUint32(ptrAt, true); if (!lo) { ensure(value === null, ErrorCode.UNSUPPORTED_STRUCTURE, 'Cannot add a name in place'); return; }
    const off = lo - 0x50000000; let end = off; while (this.system[end] !== 0) end++;
    ensure(value.length <= end - off, ErrorCode.UNSUPPORTED_STRUCTURE, 'Name longer than its slot needs relocation', {value});
    ensure(/^[\x20-\x7e]*$/.test(value), ErrorCode.INVALID_INPUT, 'Names must be printable ASCII', {value});
    for (let i = 0; i < end - off; i++) this.system[off + i] = i < value.length ? value.charCodeAt(i) : 0;
  }
}

function writeSkeleton(c, sk) {
  ensure(sk.bones.length === sk.count, ErrorCode.UNSUPPORTED_STRUCTURE, 'Adding or removing bones needs relocation');
  for (const b of sk.bones) {
    c.vec(b.at, b.rotation); c.vec(b.at + 0x10, b.translation); c.vec(b.at + 0x20, b.scale);
    c.i16(b.at + 0x30, b.sibling); c.i16(b.at + 0x32, b.parent); c.u16(b.at + 0x40, b.flags); c.i16(b.at + 0x42, b.index); c.u16(b.at + 0x44, b.tag);
    c.string(b.at + 0x38, b.name);
    if (sk.parentsAt !== null) c.i16(sk.parentsAt + b.index * 2, b.parent);
  }
  // Bones marked dirty (moved/rotated by an editor) get their local matrix rebuilt, and every bone
  // under them gets a new inverse bind matrix. Layout: 4x4 row-major, row vectors, translation in row 3.
  const dirty = new Set(sk.bones.filter(b => b.dirty).map(b => b.index));
  if (!dirty.size) return;
  const under = i => { for (let k = i; k >= 0; k = sk.bones[k].parent) if (dirty.has(k)) return true; return false; };
  const globals = [];
  for (const b of sk.bones) {
    const local = boneMatrix(b), parent = b.parent >= 0 ? globals[b.parent] : null;
    globals[b.index] = parent ? mul(local, parent) : local;
    if (dirty.has(b.index) && sk.transformsAt !== null) writeAffine(c, sk.transformsAt + b.index * 64, local);
    if (under(b.index) && sk.inverseBindAt !== null) writeAffine(c, sk.inverseBindAt + b.index * 64, invert(globals[b.index]));
  }
}

// Affine matrices as {r: 3x3 rows, t: [x,y,z]} (row vectors: p' = p * r + t).
export function boneMatrix(b) {
  const [x, y, z, w] = b.rotation, [sx, sy, sz] = b.scale;
  const r = [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
  [sx, sy, sz].forEach((s, i) => { r[i] = r[i].map(v => v * s); });
  return {r, t: [...b.translation]};
}
function mul(a, b) { // a then b
  const r = a.r.map(row => [0, 1, 2].map(j => row[0] * b.r[0][j] + row[1] * b.r[1][j] + row[2] * b.r[2][j]));
  const t = [0, 1, 2].map(j => a.t[0] * b.r[0][j] + a.t[1] * b.r[1][j] + a.t[2] * b.r[2][j] + b.t[j]);
  return {r, t};
}
export function invert(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m.r, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  ensure(Math.abs(det) > 1e-12, ErrorCode.INVALID_INPUT, 'Bone matrix is not invertible');
  const r = [[(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det], [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det], [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]];
  const t = [0, 1, 2].map(j => -(m.t[0] * r[0][j] + m.t[1] * r[1][j] + m.t[2] * r[2][j]));
  return {r, t};
}
function writeAffine(c, at, m) {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c.f32(at + (i * 4 + j) * 4, m.r[i][j]);
  for (let j = 0; j < 3; j++) c.f32(at + (12 + j) * 4, m.t[j]); // column 3 is left as stored
}

function writeShaderGroup(c, sg) {
  for (const s of sg.shaders) {
    c.u32(s.at + 8, s.nameHash); c.u32(s.at + 0x18, s.fileHash); c.system[s.at + 0x11] = s.renderBucket;
    for (const p of s.parameters) {
      if (p.kind === 'texture') {
        const lo = c.sdv.getUint32(p.at + 8, true);
        if (lo) c.string(lo - 0x50000000 + 0x28, p.texture); // texture reference name, in its own slot
      } else if (p.kind === 'vector') c.vec(p.dataAt, p.value);
      else if (p.kind === 'array') p.value.forEach((v, k) => c.vec(p.dataAt + k * 16, v));
    }
  }
}

function writeGeometry(c, g) {
  if (g.indices) {
    // Index edits keep the count (hiding a part = degenerate triangles, e.g. all zeros).
    ensure(g.indices.length === g.indexCount, ErrorCode.INVALID_INPUT, 'Indices must keep the index count');
    const dv = c.dv(g.indexData.region);
    for (let i = 0; i < g.indexCount; i++) { const x = g.indices[i]; ensure(Number.isInteger(x) && x >= 0 && x < g.vertexCount, ErrorCode.INVALID_INPUT, 'Index outside the vertex buffer'); dv.setUint16(g.indexData.off + i * 2, x, true); }
  }
  if (g.normals) {
    const nc = g.declaration.components.find(x => x.semantic === 'normal'), dvn = c.dv(g.vertexData.region);
    ensure(nc?.type === 'float3' && g.normals.length === g.vertexCount * 3, ErrorCode.INVALID_INPUT, 'Normals must be float3 and keep the vertex count');
    for (let i = 0; i < g.vertexCount; i++) for (let k = 0; k < 3; k++) dvn.setFloat32(g.vertexData.off + i * g.stride + nc.offset + k * 4, g.normals[i * 3 + k], true);
  }
  if (!g.positions) return; // untouched geometry: bytes stay as decoded
  const pos = g.declaration.components.find(x => x.semantic === 'position'), dv = c.dv(g.vertexData.region);
  ensure(pos?.type === 'float3' && g.positions.length === g.vertexCount * 3, ErrorCode.INVALID_INPUT, 'Positions must keep the vertex count');
  for (let i = 0; i < g.vertexCount; i++) for (let k = 0; k < 3; k++) {
    const x = g.positions[i * 3 + k]; ensure(Number.isFinite(x), ErrorCode.NONFINITE_VALUE, 'Nonfinite vertex');
    dv.setFloat32(g.vertexData.off + i * g.stride + pos.offset + k * 4, x, true);
  }
}

function writeDrawable(c, d, done) {
  if (done.has(d.at)) return; done.add(d.at);
  d.lodDistances.forEach((x, i) => c.f32(d.at + 0x70 + i * 4, x));
  if (d.shaderGroup && !done.has(d.shaderGroup.at)) { done.add(d.shaderGroup.at); writeShaderGroup(c, d.shaderGroup); }
  if (d.skeleton && !done.has(d.skeleton.at)) { done.add(d.skeleton.at); writeSkeleton(c, d.skeleton); }
  for (const models of Object.values(d.lods)) for (const m of models) {
    c.u16(m.at + 0x2C, (m.flags << 8) | m.renderMask);
    for (const g of m.geometries) writeGeometry(c, g);
  }
  c.string(d.at + 0x130, d.name);
}

/** Serialize the model over its own decoded pages and return {system, graphics, bytes}. */
export function writeYft(read, {level = 6} = {}) {
  const out = writeYftRegions(read);
  return {...out, bytes: encodeYftResource(out, {level})};
}

/** In-place serialization without compression: {system, graphics, systemFlags, graphicsFlags}. */
export function writeYftRegions({model, resource}) {
  const c = new Canvas(resource), done = new Set();
  c.string(0x58, model.name);
  c.vec(0x20, model.boundingSphere.center); c.f32(0x2C, model.boundingSphere.radius);
  c.f32(0xD0, model.gravityFactor); c.f32(0xD4, model.buoyancyFactor);
  writeDrawable(c, model.drawable, done);
  for (const a of model.drawableArray) writeDrawable(c, a.drawable, done);
  for (const l of model.lights) {
    c.vec(l.at + 8, l.position); l.color.forEach((x, i) => { c.system[l.at + 0x18 + i] = x; }); c.system[l.at + 0x1B] = l.flashiness;
    c.f32(l.at + 0x1C, l.intensity); c.u32(l.at + 0x20, l.flags); c.u16(l.at + 0x24, l.boneId); c.system[l.at + 0x26] = l.type;
  }
  for (const lod of model.physics ?? []) {
    if (!lod) continue;
    for (const g of lod.groups) { c.f32(g.at + 0x44, g.mass); c.f32(g.at + 0x10, g.strength); }
    for (const ch of lod.children) {
      c.f32(ch.at + 8, ch.pristineMass); c.f32(ch.at + 0xC, ch.damagedMass); c.u16(ch.at + 0x12, ch.boneTag);
      if (ch.drawable) writeDrawable(c, ch.drawable, done);
      if (ch.damagedDrawable) writeDrawable(c, ch.damagedDrawable, done);
    }
  }
  const out = {system: c.system, graphics: c.graphics, systemFlags: resource.systemFlags, graphicsFlags: resource.graphicsFlags};
  return out;
}

/**
 * Relocation primitive: append one system page at the END of the region so that every
 * existing offset stays valid. The page uses the smallest size class at or below the
 * smallest existing page that still has room in its count field. Returns the new region,
 * flags and the offset of the new page. Updates the file's page-info block.
 */
export function appendSystemPage(system, systemFlags, minimumBytes) {
  const base = 512 * 2 ** (systemFlags & 15);
  const FIELDS = [[4, 1], [5, 2], [7, 4], [11, 6], [17, 7], [24, 1], [25, 1], [26, 1], [27, 1]];
  const sizes = rsc7PageSizes(systemFlags), smallest = sizes[sizes.length - 1];
  let chosen = -1;
  for (let i = FIELDS.length - 1; i >= 0; i--) {
    const size = base * 2 ** (8 - i), [shift, width] = FIELDS[i], count = (systemFlags >>> shift) & ((1 << width) - 1);
    if (size > smallest || size < minimumBytes) continue;
    if (count < (1 << width) - 1 && (chosen < 0 || size > base * 2 ** (8 - chosen))) chosen = i;
  }
  // Pages of the class equal to the smallest existing one are appended after it; smaller classes come later still.
  ensure(chosen >= 0, ErrorCode.LIMIT_EXCEEDED, 'No page class left to append without moving data', {minimumBytes});
  const [shift] = FIELDS[chosen], size = base * 2 ** (8 - chosen);
  const flags = (systemFlags + (1 << shift)) >>> 0;
  ensure(size >= minimumBytes + 0x200, ErrorCode.LIMIT_EXCEEDED, 'Appended page too small', {size, minimumBytes});
  const next = new Uint8Array(system.length + size); next.set(system);
  const dv = new DataView(next.buffer), oldInfo = dv.getUint32(8, true) - 0x50000000;
  // The file's page-info block has 8 bytes per page: it cannot grow in place, so a fresh
  // copy (one more system page) goes at the start of the new page and the root points to it.
  const sys = next[oldInfo + 8] + 1, gfx = next[oldInfo + 9], info = system.length;
  next.set(next.subarray(oldInfo, oldInfo + 8), info); next[info + 8] = sys; next[info + 9] = gfx;
  dv.setUint32(8, 0x50000000 + info, true);
  const cursor = (info + 16 + 8 * (sys + gfx) + 15) & ~15;
  return {system: next, systemFlags: flags, pageOffset: system.length, pageSize: size, cursor};
}

/**
 * Move one block of the system region into a newly appended page and repoint the single
 * pointer field that owns it. Proof of the relocation path needed to grow arrays
 * (bones, geometries, shaders). The old bytes are zeroed so nothing can still read them.
 */
export function relocateBlock({system, graphics, systemFlags, graphicsFlags}, pointerAt, length) {
  const dv0 = new DataView(system.buffer, system.byteOffset, system.byteLength);
  ensure(dv0.getUint32(pointerAt + 4, true) === 0, ErrorCode.INVALID_INPUT, 'Not a 64-bit pointer field');
  const from = dv0.getUint32(pointerAt, true) - 0x50000000;
  ensure(from >= 0 && from + length <= system.length, ErrorCode.POINTER_OUT_OF_RANGE, 'Block outside system region');
  const page = appendSystemPage(system, systemFlags, length);
  const to = page.cursor, dv = new DataView(page.system.buffer);
  page.system.copyWithin(to, from, from + length);
  page.system.fill(0, from, from + length);
  dv.setUint32(pointerAt, 0x50000000 + to, true);
  return {system: page.system, graphics, systemFlags: page.systemFlags, graphicsFlags, movedTo: to};
}

export {SIZES};
