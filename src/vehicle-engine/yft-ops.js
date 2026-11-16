// More growth/shrink operations on a decoded YFT, same pattern as yft-grow.js (extended region ->
// re-read to validate -> full writer):
// - addShader: clone a shader of a drawable (own parameter block), so one part can get its own
//   finish (chrome, matte, colour) without changing every part that shares the original shader.
// - removeGeometries: drop geometries from a model (arrays shrink, data is zeroed so it is not kept).
import {readYftResource, SIZES} from './yft-read.js';
import {repackYft} from './yft-repack.js';
import {Extender} from './yft-grow.js';
import {ErrorCode, ensure} from '../animation-engine/errors.js';

const SYS = 0x50000000;
const drawableOf = (read, child) => (child === undefined || child < 0 ? read.model.drawable : read.model.physics?.[0]?.children[child]?.drawable);

function paramsBlockSize(shader) {
  let data = 0; for (const p of shader.parameters) if (p.kind !== 'texture') data += (p.kind === 'vector' ? 1 : p.value.length) * 16;
  return {count: shader.parameters.length, data, total: shader.parameters.length * 16 + data + shader.parameters.length * 4};
}

/**
 * Clone shader `from` of a drawable. Returns {read, regions, index}: index of the new shader.
 * Options: {child?: physics child index (default main drawable), parameters?: {name: [x,y,z,w]}} to set vector values on the copy.
 */
export function addShader(read, from, {child, parameters = {}} = {}) {
  const d = drawableOf(read, child), sg = d?.shaderGroup;
  ensure(sg, ErrorCode.INVALID_INPUT, 'Drawable without a shader group');
  const src = sg.shaders[from]; ensure(src, ErrorCode.INVALID_INPUT, 'Shader not found', {from});
  const ext = new Extender(read.resource), dv0 = new DataView(read.resource.system.buffer, read.resource.system.byteOffset);
  const oldParams = dv0.getUint32(src.at, true) - SYS, size = paramsBlockSize(src);
  const fx = ext.copy(src.at, SIZES.shaderFX), params = ext.copy(oldParams, size.total);
  let dv = ext.dv;
  ext.ptr(fx, params);
  // Vector data pointers live inside the parameter block: move them with the block.
  src.parameters.forEach((p, i) => {
    const field = params + i * 16 + 8, lo = dv.getUint32(field, true);
    if (p.kind !== 'texture' && lo) ext.ptr(field, lo - SYS - oldParams + params);
  });
  dv = ext.dv;
  src.parameters.forEach((p, i) => {
    const v = parameters[p.name]; if (!v || p.kind !== 'vector') return;
    const at = dv.getUint32(params + i * 16 + 8, true) - SYS;
    v.forEach((x, k) => dv.setFloat32(at + k * 4, x, true));
  });
  const count = sg.shaders.length, ptrs = ext.alloc((count + 1) * 8), oldPtrs = dv0.getUint32(sg.at + 0x10, true) - SYS;
  ext.bytes.copyWithin(ptrs, oldPtrs, oldPtrs + count * 8); ext.ptr(ptrs + count * 8, fx);
  ext.bytes.fill(0, oldPtrs, oldPtrs + count * 8);
  ext.ptr(sg.at + 0x10, ptrs); dv = ext.dv;
  dv.setUint16(sg.at + 0x18, count + 1, true); dv.setUint16(sg.at + 0x1A, count + 1, true);
  dv.setUint32(sg.at + 0x30, dv.getUint32(sg.at + 0x30, true) + 3, true); // 3 block units per shader (measured: 336 for 112, 21 for 7)
  const grown = readYftResource(ext.finish());
  return {read: grown, get regions() { return repackYft(grown); }, index: count};
}

/** Point geometries at another shader, in place (no growth). refs: [{model, geometry, child?}]. */
export function setGeometryShader(read, refs, shaderIndex) {
  for (const r of refs) {
    const m = drawableOf(read, r.child)?.lods.high?.[r.model]; ensure(m, ErrorCode.INVALID_INPUT, 'Model not found');
    const g = m.geometries[r.geometry]; ensure(g, ErrorCode.INVALID_INPUT, 'Geometry not found');
    const dv = new DataView(read.resource.system.buffer, read.resource.system.byteOffset);
    const map = dv.getUint32(m.at + 0x20, true) - SYS; dv.setUint16(map + r.geometry * 2, shaderIndex, true);
    g.shaderIndex = shaderIndex;
  }
}

/**
 * Remove geometries from model `model` of a drawable. Their structures and data are zeroed (dead
 * data is not carried by the writer). At least one geometry must remain.
 */
export function removeGeometries(read, geometries, {model = 0, child} = {}) {
  const d = drawableOf(read, child), m = d?.lods.high?.[model];
  ensure(m, ErrorCode.INVALID_INPUT, 'Model not found');
  const drop = new Set(geometries), keep = m.geometries.filter((_, i) => !drop.has(i));
  ensure(keep.length > 0, ErrorCode.INVALID_INPUT, 'A model needs at least one geometry');
  const ext = new Extender(read.resource), dv0 = new DataView(read.resource.system.buffer, read.resource.system.byteOffset);
  const total = keep.length, old = m.geometries.length;
  const oldPtrs = dv0.getUint32(m.at + 0x08, true) - SYS, oldMap = dv0.getUint32(m.at + 0x20, true) - SYS, oldBounds = dv0.getUint32(m.at + 0x18, true) - SYS;
  const ptrs = ext.alloc(total * 8), map = ext.alloc(total * 2), bounds = ext.alloc((total > 1 ? total + 1 : 1) * 32);
  let dv = ext.dv;
  const keptIdx = m.geometries.map((_, i) => i).filter(i => !drop.has(i));
  keptIdx.forEach((i, k) => {
    ext.bytes.copyWithin(ptrs + k * 8, oldPtrs + i * 8, oldPtrs + i * 8 + 8);
    dv.setUint16(map + k * 2, dv0.getUint16(oldMap + i * 2, true), true);
  });
  const box = i => [[0, 1, 2].map(k => dv0.getFloat32(oldBounds + i * 32 + k * 4, true)), [0, 1, 2].map(k => dv0.getFloat32(oldBounds + i * 32 + 16 + k * 4, true))];
  const per = keptIdx.map(i => (old > 1 ? box(i + 1) : box(0)));
  const pad = dv0.getUint32(oldBounds + 12, true);
  const write = (at, [mn, mx]) => { for (let k = 0; k < 3; k++) { dv.setFloat32(at + k * 4, mn[k], true); dv.setFloat32(at + 16 + k * 4, mx[k], true); } dv.setUint32(at + 12, pad, true); dv.setUint32(at + 28, pad, true); };
  if (total > 1) { const all = per.reduce(([a, b], [c, e]) => [a.map((v, k) => Math.min(v, c[k])), b.map((v, k) => Math.max(v, e[k]))]); write(bounds, all); per.forEach((b, k) => write(bounds + (k + 1) * 32, b)); }
  else write(bounds, per[0]);
  // Zero what is gone: pointer array, dropped geometry structs, their buffers and data (when not shared).
  const used = new Set(keep.flatMap(g => [g.vertexData.off, g.indexData.off]));
  for (const i of drop) {
    const g = m.geometries[i];
    const vb = dv0.getUint32(g.at + 0x18, true) - SYS, ib = dv0.getUint32(g.at + 0x38, true) - SYS;
    if (!used.has(g.vertexData.off) && g.vertexData.region === 'system') ext.bytes.fill(0, g.vertexData.off, g.vertexData.off + g.vertexData.length);
    if (!used.has(g.indexData.off) && g.indexData.region === 'system') ext.bytes.fill(0, g.indexData.off, g.indexData.off + g.indexData.length);
    for (const [at, len] of [[vb, SIZES.vertexBuffer], [ib, SIZES.indexBuffer], [g.at, SIZES.geometry]]) ext.bytes.fill(0, at, at + len);
  }
  ext.bytes.fill(0, oldPtrs, oldPtrs + old * 8);
  ext.ptr(m.at + 0x08, ptrs); ext.ptr(m.at + 0x20, map); ext.ptr(m.at + 0x18, bounds); dv = ext.dv;
  dv.setUint16(m.at + 0x10, total, true); dv.setUint16(m.at + 0x12, total, true); dv.setUint16(m.at + 0x2E, total, true);
  const grown = readYftResource(ext.finish());
  return {read: grown, get regions() { return repackYft(grown); }}; // repack only when asked (chains of operations repack once)
}
