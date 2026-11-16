// Vertex attribute decoding for drawable geometries (all component types of the GTA V vertex declaration).
import {ErrorCode, ensure} from '../animation-engine/errors.js';

const H = new Float32Array(1), HU = new Uint32Array(H.buffer);
export function halfToFloat(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >>> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}
export function floatToHalf(v) {
  H[0] = v; const u = HU[0];
  const s = (u >>> 16) & 0x8000, e = ((u >>> 23) & 0xff) - 112, m = u & 0x7fffff;
  if (e <= 0) return s; if (e >= 31) return s | 0x7c00; return s | (e << 10) | (m >>> 13);
}
// 10:10:10:2 signed normalized (x in the low bits), as CodeWalker's Dec3N.
function dec3n(u) {
  const c = shift => { const x = (u >>> shift) & 0x3ff; return (x & 0x200 ? x - 0x400 : x) / 511; };
  return [c(0), c(10), c(20)];
}

/** Reader for one component of a geometry: (vertex) -> number[] (floats, or 0..255 bytes for ubyte4/colour). */
export function componentReader(view, geometry, semantic) {
  const c = geometry.declaration.components.find(x => x.semantic === semantic);
  if (!c) return null;
  const {region, off} = geometry.vertexData, dv = view.dv(region), stride = geometry.stride;
  const at = i => off + i * stride + c.offset;
  switch (c.type) {
    case 'float': return i => [dv.getFloat32(at(i), true)];
    case 'float2': return i => [dv.getFloat32(at(i), true), dv.getFloat32(at(i) + 4, true)];
    case 'float3': return i => [dv.getFloat32(at(i), true), dv.getFloat32(at(i) + 4, true), dv.getFloat32(at(i) + 8, true)];
    case 'float4': return i => [0, 4, 8, 12].map(k => dv.getFloat32(at(i) + k, true));
    case 'half': return i => [halfToFloat(dv.getUint16(at(i), true))];
    case 'half2': return i => [0, 2].map(k => halfToFloat(dv.getUint16(at(i) + k, true)));
    case 'half3': return i => [0, 2, 4].map(k => halfToFloat(dv.getUint16(at(i) + k, true)));
    case 'half4': return i => [0, 2, 4, 6].map(k => halfToFloat(dv.getUint16(at(i) + k, true)));
    case 'ubyte4': case 'colour': return i => [0, 1, 2, 3].map(k => dv.getUint8(at(i) + k));
    case 'dec3n': return i => dec3n(dv.getUint32(at(i), true));
    default: ensure(false, ErrorCode.UNSUPPORTED_STRUCTURE, 'Unknown vertex component', {type: c.type});
  }
}

/** Positions, normals and first UV of one geometry as typed arrays, plus indices. Missing attributes stay null. */
export function geometryArrays(view, geometry) {
  const n = geometry.vertexCount;
  const pos = componentReader(view, geometry, 'position'), nor = componentReader(view, geometry, 'normal'), uv = componentReader(view, geometry, 'texcoord0');
  ensure(pos, ErrorCode.UNSUPPORTED_STRUCTURE, 'Geometry without positions');
  const positions = new Float32Array(n * 3), normals = nor ? new Float32Array(n * 3) : null, uvs = uv ? new Float32Array(n * 2) : null;
  for (let i = 0; i < n; i++) {
    positions.set(pos(i).slice(0, 3), i * 3);
    if (nor) normals.set(nor(i).slice(0, 3), i * 3);
    if (uv) uvs.set(uv(i).slice(0, 2), i * 2);
  }
  const {region, off} = geometry.indexData, dv = view.dv(region), indices = new Uint16Array(geometry.indexCount);
  for (let i = 0; i < indices.length; i++) indices[i] = dv.getUint16(off + i * 2, true);
  ensure(indices.every(i => i < n), ErrorCode.INCONSISTENT_REFERENCE, 'Index outside the vertex buffer');
  return {positions, normals, uvs, indices};
}

/** Raw bytes of one vertex (for exact comparisons). */
export function vertexBytes(view, geometry, i) {
  const {region, off} = geometry.vertexData, src = region === 'system' ? view.system : view.graphics;
  return src.subarray(off + i * geometry.stride, off + (i + 1) * geometry.stride);
}
