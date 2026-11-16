// Growing a YFT: attach new geometries (parts, rims) to a drawable model.
// New structures are appended past the end of the decoded system region (an "extended" region
// that does not respect pages), the file is re-read to validate the result, and the full writer
// (yft-repack.js) lays everything out again in valid pages.
// The new geometry copies the vertex declaration, vertex/index buffer headers and bone table of a
// template geometry of the same model, so it renders with an existing shader and skin setup.
import {readYftResource, SIZES} from './yft-read.js';
import {repackYft} from './yft-repack.js';
import {ErrorCode, ensure} from '../animation-engine/errors.js';

const SYS = 0x50000000;

export class Extender {
  constructor(resource) {
    this.base = resource.system.length;
    this.bytes = new Uint8Array(this.base + 1024 * 1024); this.bytes.set(resource.system);
    this.end = this.base; this.resource = resource;
  }
  alloc(size) {
    const at = (this.end + 15) & ~15;
    if (at + size > this.bytes.length) { const next = new Uint8Array(Math.max(this.bytes.length * 2, at + size + 1024 * 1024)); next.set(this.bytes); this.bytes = next; }
    this.end = at + size; return at;
  }
  get dv() { return new DataView(this.bytes.buffer); }
  ptr(at, target) { const dv = this.dv; dv.setUint32(at, SYS + target, true); dv.setUint32(at + 4, 0, true); }
  copy(from, size) { const at = this.alloc(size); this.bytes.copyWithin(at, from, from + size); return at; }
  finish() {
    const system = this.bytes.slice(0, (this.end + 15) & ~15);
    return {...this.resource, system};
  }
}

function half(v) { // float -> IEEE half
  const f = new Float32Array([v]), u = new Uint32Array(f.buffer)[0];
  const s = (u >>> 16) & 0x8000, e = ((u >>> 23) & 0xff) - 112, m = u & 0x7fffff;
  if (e <= 0) return s; if (e >= 31) return s | 0x7c00; return s | (e << 10) | (m >>> 13);
}

/**
 * Encode vertices with the template declaration. `vertex` gives, per vertex, position, normal, uv
 * (stage-independent GTA space) and the bone table slot that skins it.
 */
function encodeVertices(decl, stride, count, data) {
  const out = new Uint8Array(count * stride), dv = new DataView(out.buffer);
  for (let i = 0; i < count; i++) {
    const at = i * stride;
    for (const c of decl.components) {
      const o = at + c.offset;
      const vec = c.semantic === 'position' ? data.positions.subarray(i * 3, i * 3 + 3)
        : c.semantic === 'normal' ? (data.normals ? data.normals.subarray(i * 3, i * 3 + 3) : [0, 0, 1])
        : c.semantic.startsWith('texcoord') ? (data.uvs ? data.uvs.subarray(i * 2, i * 2 + 2) : [0, 0])
        : c.semantic === 'tangent' || c.semantic === 'binormal' ? [1, 0, 0, 1] : null;
      if (c.semantic === 'blendWeights') { out[o] = 255; continue; }
      if (c.semantic === 'blendIndices') { out[o] = data.boneSlot; continue; }
      if (c.semantic.startsWith('colour')) { out.fill(255, o, o + 4); continue; }
      ensure(vec, ErrorCode.UNSUPPORTED_STRUCTURE, 'Vertex component not supported for new geometry', {semantic: c.semantic, type: c.type});
      if (c.type.startsWith('float')) { const n = c.size / 4; for (let k = 0; k < n; k++) dv.setFloat32(o + k * 4, vec[k] ?? 0, true); }
      else if (c.type.startsWith('half')) { const n = c.size / 2; for (let k = 0; k < n; k++) dv.setUint16(o + k * 2, half(vec[k] ?? 0), true); }
      else ensure(false, ErrorCode.UNSUPPORTED_STRUCTURE, 'Vertex component type not supported for new geometry', {semantic: c.semantic, type: c.type});
    }
  }
  return out;
}

const LOD_FIELD = {high: 0x50, med: 0x58, low: 0x60, vlow: 0x68};

/**
 * Add geometries to one model of the main drawable. Each item:
 *   {positions: Float32Array (x,y,z, GTA space), indices: Uint16Array|number[], normals?, uvs?,
 *    bone: bone name the part follows, shaderIndex: existing shader to use, model?: index (default 0), lod?: 'high',
 *    child?: physics child index (default: main drawable; child drawables are not skinned, vertices are bone-local)}
 * Returns {read, regions}: the grown file re-read (validated) and repacked regions for encoding.
 */
export function addGeometries(read, items) {
  const ext = new Extender(read.resource);
  const groups = new Map();
  for (const it of items) { const key = `${it.lod ?? 'high'}:${it.model ?? 0}:${it.child ?? -1}`; (groups.get(key) ?? groups.set(key, []).get(key)).push(it); }
  for (const [key, list] of groups) {
    const [lod, mi, ci] = [key.split(':')[0], Number(key.split(':')[1]), Number(key.split(':')[2])];
    const drawable = ci >= 0 ? read.model.physics?.[0]?.children[ci]?.drawable : read.model.drawable;
    ensure(drawable, ErrorCode.INVALID_INPUT, 'Drawable not found', {child: ci});
    const model = drawable.lods[lod]?.[mi];
    ensure(model, ErrorCode.INVALID_INPUT, 'Model not found', {lod, model: mi});
    const template = model.geometries[0];
    ensure(template, ErrorCode.UNSUPPORTED_STRUCTURE, 'New parts need a model with at least one geometry');
    const old = model.geometries.length, total = old + list.length;
    ensure(total < 0xffff, ErrorCode.LIMIT_EXCEEDED, 'Too many geometries');
    const dv0 = new DataView(read.resource.system.buffer, read.resource.system.byteOffset);
    const vbTemplate = dv0.getUint32(template.at + 0x18, true) - SYS, ibTemplate = dv0.getUint32(template.at + 0x38, true) - SYS;
    const newGeoms = [], newBounds = [];
    for (const it of list) {
      const count = it.positions.length / 3, indices = Uint16Array.from(it.indices);
      ensure(Number.isInteger(count) && count >= 3 && count <= 65535, ErrorCode.LIMIT_EXCEEDED, 'A part must have 3 to 65535 vertices', {count});
      ensure(indices.length % 3 === 0 && indices.length > 0 && indices.every(i => i < count), ErrorCode.INVALID_INPUT, 'Invalid part indices');
      const boneIndex = read.model.skeleton.bones.findIndex(b => b.name.toLowerCase() === String(it.bone).toLowerCase());
      ensure(boneIndex >= 0, ErrorCode.INVALID_INPUT, 'Bone not found', {bone: it.bone});
      let slot = !model.hasSkin ? 0 : template.boneIds.length ? template.boneIds.indexOf(boneIndex) : boneIndex;
      // Geometry bone tables often list only the bones that geometry uses: the new part gets its own table.
      const ownTable = model.hasSkin && slot < 0;
      if (ownTable) slot = 0;
      ensure(slot >= 0 && slot < 256, ErrorCode.UNSUPPORTED_STRUCTURE, 'Bone is not in the geometry bone table', {bone: it.bone});
      const shaders = (drawable.shaderGroup ?? read.model.drawable.shaderGroup)?.shaders ?? [];
      ensure(Number.isInteger(it.shaderIndex) && it.shaderIndex >= 0 && it.shaderIndex < shaders.length, ErrorCode.INVALID_INPUT, 'Invalid shader index');
      // Buffers
      const verts = encodeVertices(template.declaration, template.stride, count, {positions: it.positions, normals: it.normals, uvs: it.uvs, boneSlot: slot});
      const vd = ext.alloc(verts.length); ext.bytes.set(verts, vd);
      const ix = ext.alloc(indices.length * 2); new Uint8Array(ext.bytes.buffer, ix, indices.length * 2).set(new Uint8Array(indices.buffer, indices.byteOffset, indices.length * 2));
      const vb = ext.copy(vbTemplate, SIZES.vertexBuffer), ib = ext.copy(ibTemplate, SIZES.indexBuffer);
      let dv = ext.dv;
      dv.setUint32(vb + 0x18, count, true); ext.ptr(vb + 0x10, vd); if (dv.getUint32(vb + 0x20, true)) ext.ptr(vb + 0x20, vd);
      dv.setUint32(ib + 0x08, indices.length, true); ext.ptr(ib + 0x10, ix);
      const g = ext.copy(template.at, SIZES.geometry); dv = ext.dv;
      ext.ptr(g + 0x18, vb); ext.ptr(g + 0x38, ib); ext.ptr(g + 0x78, vd);
      dv.setUint32(g + 0x58, indices.length, true); dv.setUint32(g + 0x5C, indices.length / 3, true); dv.setUint16(g + 0x60, count & 0xffff, true);
      if (ownTable) { const ids = ext.alloc(2); dv = ext.dv; dv.setUint16(ids, boneIndex, true); ext.ptr(g + 0x68, ids); dv.setUint16(g + 0x72, 1, true); }
      newGeoms.push({at: g, shaderIndex: it.shaderIndex});
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) { const v = it.positions[i * 3 + k]; mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); }
      newBounds.push([mn, mx]);
    }
    // Model arrays grow: geometry pointers, shader mapping, bounds (overall + one per geometry).
    let dv = ext.dv;
    const ptrs = ext.alloc(total * 8), oldPtrs = dv.getUint32(model.at + 0x08, true) - SYS;
    ext.bytes.copyWithin(ptrs, oldPtrs, oldPtrs + old * 8); newGeoms.forEach((g, i) => ext.ptr(ptrs + (old + i) * 8, g.at));
    ext.bytes.fill(0, oldPtrs, oldPtrs + old * 8); // the old array is dead (it may sit inside the models block)
    const map = ext.alloc(total * 2), oldMap = dv.getUint32(model.at + 0x20, true) - SYS; dv = ext.dv;
    ext.bytes.copyWithin(map, oldMap, oldMap + old * 2); newGeoms.forEach((g, i) => dv.setUint16(map + (old + i) * 2, g.shaderIndex, true));
    const oldBoundsAt = dv.getUint32(model.at + 0x18, true) - SYS, oldBoundsCount = old > 1 ? old + 1 : 1;
    const bounds = ext.alloc((total + 1) * 32); dv = ext.dv;
    const pad = dv.getUint32(oldBoundsAt + 12, true);
    const writeBox = (at, mn, mx) => { for (let k = 0; k < 3; k++) { dv.setFloat32(at + k * 4, mn[k], true); dv.setFloat32(at + 16 + k * 4, mx[k], true); } dv.setUint32(at + 12, pad, true); dv.setUint32(at + 28, pad, true); };
    const box = i => [[0, 1, 2].map(k => dv.getFloat32(oldBoundsAt + i * 32 + k * 4, true)), [0, 1, 2].map(k => dv.getFloat32(oldBoundsAt + i * 32 + 16 + k * 4, true))];
    const perGeom = old > 1 ? Array.from({length: old}, (_, i) => box(i + 1)) : [box(0)];
    perGeom.push(...newBounds);
    const all = perGeom.reduce(([a, b], [c, d]) => [a.map((v, k) => Math.min(v, c[k])), b.map((v, k) => Math.max(v, d[k]))]);
    writeBox(bounds, all[0], all[1]); perGeom.forEach(([a, b], i) => writeBox(bounds + (i + 1) * 32, a, b));
    void oldBoundsCount;
    ext.ptr(model.at + 0x08, ptrs); ext.ptr(model.at + 0x20, map); ext.ptr(model.at + 0x18, bounds);
    dv.setUint16(model.at + 0x10, total, true); dv.setUint16(model.at + 0x12, total, true); dv.setUint16(model.at + 0x2E, total, true);
    // Drawable bounding box grows to include the parts (culling).
    const d = drawable.at;
    for (let k = 0; k < 3; k++) { dv.setFloat32(d + 0x30 + k * 4, Math.min(dv.getFloat32(d + 0x30 + k * 4, true), all[0][k]), true); dv.setFloat32(d + 0x40 + k * 4, Math.max(dv.getFloat32(d + 0x40 + k * 4, true), all[1][k]), true); }
  }
  const grown = readYftResource(ext.finish());
  return {read: grown, get regions() { return repackYft(grown); }}; // repack only when asked (chains of operations repack once)
}
