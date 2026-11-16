import {Arena, View, encodeResource, decodeResource, fileHeader, pagesInfo, proofName, nameHash, requireThat, checkedInteger} from './resource.js';

// Deliberately restricted: one unrigged, untextured Float3 mesh in high LOD.
// A binary geometry proof, NOT a garment exporter or a render-ready material.
// Layout knowledge was studied from CodeWalker sources (MIT); see the proof report for provenance.

const VFT_MODEL = 1080101528, VFT_GEOMETRY = 1080133528, VFT_VERTEX_BUFFER = 1080153080, VFT_INDEX_BUFFER = 1080152408;
const LOD_DISTANCE_HIGH = 100, RENDER_MASK_HIGH = 0xff01, MODEL_RENDER_MASK = 0xff, PRIMITIVE_TRIANGLES = 3, STRIDE = 12;
// Contiguous "drawable models block" for one LOD list holding one model with one geometry:
// list header(16) + pointer(8) + pad(8) | model(48) shaderMap(2+6) geometryPointer(8) bounds(32) | geometry(152)
const MODELS = {lod: 0, array: 16, model: 32, shaderMap: 80, geometryPointers: 88, bounds: 96, geometry: 128, length: 280};
const MODELS_BLOCK_SIZE = Math.ceil(MODELS.length / 16);

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  positions.forEach((v, i) => { min[i % 3] = Math.min(min[i % 3], v); max[i % 3] = Math.max(max[i % 3], v); });
  const center = min.map((v, i) => (v + max[i]) / 2), radius = Math.hypot(...max.map((v, i) => v - center[i]));
  return {min, max, center, radius};
}
export function writeYdd({name, positions, indices}) {
  proofName(name);
  requireThat(Array.isArray(positions) && positions.length % 3 === 0, 'Invalid positions');
  const count = checkedInteger(positions.length / 3, 3, 60000, 'vertex count');
  requireThat(positions.every(n => Number.isFinite(n) && Math.abs(n) <= 1e5), 'Invalid vertex');
  requireThat(Array.isArray(indices) && indices.length % 3 === 0 && indices.length > 0 && indices.length <= 180000, 'Invalid indices');
  for (const i of indices) checkedInteger(i, 0, count - 1, 'vertex index');
  const stored = positions.map(Math.fround), box = bounds(stored); // Bounds describe the float32 data actually stored.
  const a = new Arena(), g = new Arena(); const root = a.allocate(64), pages = pagesInfo(a, true);
  fileHeader(a, root, pages); a.u32(24, 1);
  const hashes = a.allocate(4), drawables = a.allocate(8), drawable = a.allocate(208), text = a.allocate(name.length + 1);
  a.u32(hashes, nameHash(name)); a.pointer(32, hashes); a.u16(40, 1); a.u16(42, 1);
  a.pointer(48, drawables); a.u16(56, 1); a.u16(58, 1); a.pointer(drawables, drawable);
  fileHeader(a, drawable, pages); a.pointer(drawable + 168, text); a.bytes.write(name, text, 'ascii');
  for (let i = 0; i < 3; i++) { a.float(drawable + 32 + i * 4, box.center[i]); a.float(drawable + 48 + i * 4, box.min[i]); a.float(drawable + 64 + i * 4, box.max[i]); }
  a.float(drawable + 44, box.radius); a.u32(drawable + 60, 0x7f800001); a.u32(drawable + 76, 0x7f800001);
  a.float(drawable + 112, LOD_DISTANCE_HIGH); a.u32(drawable + 128, RENDER_MASK_HIGH); a.u16(drawable + 154, MODELS_BLOCK_SIZE);
  const block = a.allocate(MODELS.length), lod = block + MODELS.lod, model = block + MODELS.model, geometry = block + MODELS.geometry;
  const shaderMap = block + MODELS.shaderMap, geomPointers = block + MODELS.geometryPointers, box2 = block + MODELS.bounds;
  a.pointer(drawable + 80, lod); a.pointer(drawable + 160, lod); a.pointer(lod, block + MODELS.array); a.u16(lod + 8, 1); a.u16(lod + 10, 1); a.pointer(block + MODELS.array, model);
  a.u32(model, VFT_MODEL); a.u32(model + 4, 1); a.pointer(model + 8, geomPointers); a.u16(model + 16, 1); a.u16(model + 18, 1); a.pointer(model + 24, box2); a.pointer(model + 32, shaderMap); a.u16(model + 44, MODEL_RENDER_MASK); a.u16(model + 46, 1); a.pointer(geomPointers, geometry);
  for (let i = 0; i < 3; i++) { a.float(box2 + i * 4, box.min[i]); a.float(box2 + 16 + i * 4, box.max[i]); }
  const vb = a.allocate(128), ib = a.allocate(96), decl = a.allocate(16), ix = a.allocate(indices.length * 2), verts = g.allocate(count * STRIDE);
  a.u32(geometry, VFT_GEOMETRY); a.u32(geometry + 4, 1); a.pointer(geometry + 24, vb); a.pointer(geometry + 56, ib);
  a.u32(geometry + 88, indices.length); a.u32(geometry + 92, indices.length / 3); a.u16(geometry + 96, count); a.u16(geometry + 98, PRIMITIVE_TRIANGLES); a.u16(geometry + 112, STRIDE); a.pointer(geometry + 120, verts, 0x60000000);
  a.u32(vb, VFT_VERTEX_BUFFER); a.u32(vb + 4, 1); a.u16(vb + 8, STRIDE); a.pointer(vb + 16, verts, 0x60000000); a.u32(vb + 24, count); a.pointer(vb + 32, verts, 0x60000000); a.pointer(vb + 48, decl);
  a.u32(decl, 1); a.u16(decl + 4, STRIDE); a.bytes[decl + 7] = 1; a.bytes.writeBigUInt64LE(6n, decl + 8);
  a.u32(ib, VFT_INDEX_BUFFER); a.u32(ib + 4, 1); a.u32(ib + 8, indices.length); a.pointer(ib + 16, ix);
  indices.forEach((n, i) => a.u16(ix + i * 2, n)); stored.forEach((n, i) => g.float(verts + i * 4, n));
  return encodeResource(165, a.finish(), g.finish());
}
export function readYdd(bytes) {
  const v = new View(decodeResource(bytes, 165)), f32 = Math.fround;
  // Root drawable dictionary: one hash, one drawable.
  v.known(0, 64, [[4, 4], [8, 8], [24, 4], [32, 8], [40, 4], [48, 8], [56, 4]]);
  requireThat(v.u32(4) === 1 && v.u32(24) === 1, 'Unsupported dictionary header');
  requireThat(v.u16(40) === 1 && v.u16(42) === 1 && v.u16(56) === 1 && v.u16(58) === 1, 'Unsupported drawable count');
  const pages = v.pagesInfo(8), hashes = v.ptr(32, 4), list = v.ptr(48, 8), d = v.ptr(list, 208);
  requireThat(pages.system === v.systemPages && pages.graphics === v.graphicsPages, 'Page info mismatch');
  v.known(d, 208, [[4, 4], [8, 8], [32, 16], [48, 12], [60, 4], [64, 12], [76, 4], [80, 8], [112, 4], [128, 4], [154, 2], [160, 8], [168, 8]]);
  requireThat(v.u32(d + 4) === 1, 'Unsupported drawable header');
  const drawablePages = v.pagesInfo(d + 8); // CodeWalker saves a separate copy; this writer shares the root block.
  const nameAt = v.ptr(d + 168, 1), name = v.string(d + 168); proofName(name);
  requireThat(nameHash(name) === v.u32(hashes), 'Drawable name/hash mismatch');
  requireThat(v.float(d + 112) === LOD_DISTANCE_HIGH && v.u32(d + 128) === RENDER_MASK_HIGH, 'Unsupported LOD settings');
  requireThat(v.u32(d + 60) === 0x7f800001 && v.u32(d + 76) === 0x7f800001, 'Unsupported bounds padding');
  requireThat(v.u16(d + 154) === MODELS_BLOCK_SIZE, 'Unsupported drawable models block size');
  // Models block must be contiguous and match the declared size.
  const lod = v.ptr(d + 80, MODELS.length);
  requireThat(v.ptr(d + 160, 8) === lod, 'Drawable models pointer mismatch');
  v.known(lod, 32, [[0, 8], [8, 2], [10, 2], [16, 8]]);
  requireThat(v.u16(lod + 8) === 1 && v.u16(lod + 10) === 1, 'Unsupported model count');
  requireThat(v.ptr(lod, 8) === lod + MODELS.array && v.ptr(lod + MODELS.array, 48) === lod + MODELS.model, 'Non-contiguous models block');
  const model = lod + MODELS.model;
  v.known(model, 48, [[0, 4], [4, 4], [8, 8], [16, 2], [18, 2], [24, 8], [32, 8], [44, 2], [46, 2]]);
  requireThat(v.u32(model) === VFT_MODEL && v.u32(model + 4) === 1, 'Unsupported model header');
  requireThat(v.u16(model + 16) === 1 && v.u16(model + 18) === 1 && v.u16(model + 46) === 1, 'Unsupported geometry count');
  requireThat(v.u16(model + 44) === MODEL_RENDER_MASK, 'Unsupported model render mask');
  requireThat(v.ptr(model + 8, 8) === lod + MODELS.geometryPointers && v.ptr(model + 24, 32) === lod + MODELS.bounds && v.ptr(model + 32, 2) === lod + MODELS.shaderMap, 'Non-contiguous models block');
  v.zero(lod + MODELS.shaderMap, 8); // Shader index 0 plus padding; no material in this profile.
  requireThat(v.ptr(lod + MODELS.geometryPointers, 152) === lod + MODELS.geometry, 'Non-contiguous models block');
  const box = lod + MODELS.bounds, geom = lod + MODELS.geometry;
  v.known(box, 32, [[0, 12], [16, 12]]);
  v.known(geom, 152, [[0, 4], [4, 4], [24, 8], [56, 8], [88, 4], [92, 4], [96, 2], [98, 2], [112, 2], [120, 8]]);
  requireThat(v.u32(geom) === VFT_GEOMETRY && v.u32(geom + 4) === 1 && v.u16(geom + 98) === PRIMITIVE_TRIANGLES && v.u16(geom + 112) === STRIDE, 'Unsupported geometry layout');
  const vb = v.ptr(geom + 24, 128), ib = v.ptr(geom + 56, 96);
  v.known(vb, 128, [[0, 4], [4, 4], [8, 2], [16, 8], [24, 4], [32, 8], [48, 8]]);
  requireThat(v.u32(vb) === VFT_VERTEX_BUFFER && v.u32(vb + 4) === 1 && v.u16(vb + 8) === STRIDE, 'Unsupported vertex buffer');
  v.known(ib, 96, [[0, 4], [4, 4], [8, 4], [16, 8]]);
  requireThat(v.u32(ib) === VFT_INDEX_BUFFER && v.u32(ib + 4) === 1, 'Unsupported index buffer');
  const decl = v.ptr(vb + 48, 16);
  requireThat(v.u32(decl) === 1 && v.u16(decl + 4) === STRIDE && v.system[decl + 6] === 0 && v.system[decl + 7] === 1 && v.system.readBigUInt64LE(decl + 8) === 6n, 'Unsupported vertex layout');
  const count = checkedInteger(v.u32(vb + 24), 3, 60000, 'vertex count'), indexCount = checkedInteger(v.u32(ib + 8), 3, 180000, 'index count');
  requireThat(indexCount % 3 === 0 && v.u16(geom + 96) === count && v.u32(geom + 88) === indexCount && v.u32(geom + 92) * 3 === indexCount, 'Geometry count mismatch');
  // Vertex data may live in graphics (this writer) or system pages (CodeWalker save); all three pointers must agree.
  const verts = v.ptrAny(vb + 16, count * STRIDE), alias = [v.ptrAny(vb + 32, count * STRIDE), v.ptrAny(geom + 120, count * STRIDE)];
  requireThat(alias.every(p => p.region === verts.region && p.off === verts.off), 'Vertex pointer mismatch');
  requireThat(verts.region === 'graphics' || v.graphics.length === 0, 'Unsupported graphics data');
  const ix = v.ptr(ib + 16, indexCount * 2);
  v.exclusive([['system', 0, 64], ['system', pages.off, pages.length], ['system', drawablePages.off, drawablePages.length], ['system', hashes, 4], ['system', list, 8], ['system', d, 208], ['system', nameAt, name.length + 1],
    ['system', lod, MODELS.length], ['system', vb, 128], ['system', ib, 96], ['system', decl, 16], ['system', ix, indexCount * 2], [verts.region, verts.off, count * STRIDE]]);
  const data = v[verts.region], positions = Array.from({length: count * 3}, (_, i) => data.readFloatLE(verts.off + i * 4));
  requireThat(positions.every(n => Number.isFinite(n) && Math.abs(n) <= 1e5), 'Invalid vertex');
  const indices = Array.from({length: indexCount}, (_, i) => v.u16(ix + i * 2));
  requireThat(indices.every(i => i < count), 'Invalid vertex index');
  // Stored bounds must describe the stored vertices exactly (no stale or forged culling volume).
  const b = bounds(positions);
  for (let i = 0; i < 3; i++) {
    requireThat(v.float(d + 48 + i * 4) === f32(b.min[i]) && v.float(d + 64 + i * 4) === f32(b.max[i]) && v.float(box + i * 4) === f32(b.min[i]) && v.float(box + 16 + i * 4) === f32(b.max[i]), 'Bounds mismatch');
    requireThat(v.float(d + 32 + i * 4) === f32(b.center[i]), 'Bounds mismatch');
  }
  requireThat(v.float(d + 44) === f32(b.radius), 'Bounds mismatch');
  return {name, positions, indices};
}
