// "Roupas para Neon": every shader of the garment becomes the RedHorn ped_emissive preset and every
// vertex gets the Neon colour, in all LODs. Same contract as the desktop tool (docs/CLOTHING_NEON.md):
// - garments with skin are refused (skin shader or a triangle of the freemode body reference);
// - diffuse, normal, specular and volume samplers are reused from the original material;
// - every original vertex channel is copied byte for byte except Colour0; UV1 (1,-1) and tangents
//   are added only when missing;
// - the result is re-read and refused if positions, normals, UVs, weights, bone indices, triangles,
//   rig or embedded textures changed.
import {readYddResource, lodGeometries, LODS} from './ydd-read.js';
import {repackYdd} from './ydd-write.js';
import {geometryArrays, componentReader, vertexBytes} from './vertex.js';
import {triangleFingerprint, isSkinShader} from './skin-reference.js';
import {Extender} from '../vehicle-engine/yft-grow.js';
import {COMPONENT_SIZES} from '../vehicle-engine/names.js';
import {joaat} from '../animation-engine/hash.js';
import {ErrorCode, EngineError, ensure} from '../animation-engine/errors.js';

const SYS = 0x50000000;
export const NEON_SHADER = Object.freeze({name: 0x6f83f1e2, file: 0x1a0aeada, label: 'ped_emissive.sps'});
export const NEON_COLOUR = Object.freeze([255, 185, 255, 0]);
// Parameter block of the preset (RedHorn acervo: emissiveMultiplier 1), pointers zeroed: 13 headers, 9 vectors, 13 hashes.
const PRESET_PARAMS = '0002000000000000000000000000000000030000000000000000000000000000000400000000000000000000000000000005000000000000000000000000000001a8000000000000000000000000000001a7000000000000000000000000000001a6000000000000000000000000000001a5000000000000000000000000000001a4000000000000000000000000000001a3000000000000000000000000000001a2000000000000000000000000000001a1000000000000000000000000000001a00000000000000000000000000000000000000000000000000000000000000000c8410000c84100000000000000000000003f0000000000000000000000000000c842000000000000000000000000ec51783f0000000000000000000000000000803f0000000000000000000000000000803f00000000000000000000000000000000000000000000c04100000000000000409a99193f0000000000000000712bfef15e620b2f4fc6b746c69987601adaff214bbf061a4f3318f480467487fab2b927812b71f648edeb5e8f2e1eb569c92fee';
const PRESET = Uint8Array.from(PRESET_PARAMS.match(/../g), h => parseInt(h, 16));
const PRESET_COUNT = 13, PRESET_TEXTURES = ['DiffuseSampler', 'VolumeSampler', 'BumpSampler', 'SpecSampler'].map(joaat);
// Vertex channels Neon needs (bit -> GTAV1 type nibble): colour0 (colour), texcoord1 (float2), tangent (float4).
const ADDED = Object.freeze({4: 9, 7: 5, 14: 7});
const REQUIRED_FLAGS = 0x4f; // position, blend weights, blend indices, normal, texcoord0

const userError = message => new EngineError(ErrorCode.INVALID_INPUT, message);

/** Refuse garments with skin. reference: Set of triangle fingerprints for the garment's gender (or null to skip the geometric check). */
export function refuseSkin(read, reference) {
  for (const {drawable: d} of read.model.drawables) {
    if (d.shaderGroup.shaders.some(isSkinShader)) throw userError('Pele identificada. Use Separar pele antes de converter para Neon. Nenhuma saída foi criada.');
    if (!reference) continue;
    for (const lod of LODS) for (const {geometry} of lodGeometries(d, lod)) {
      const {positions, indices} = geometryArrays(read.view, geometry);
      for (let i = 0; i < indices.length; i += 3)
        if (reference.has(triangleFingerprint(positions, indices[i], indices[i + 1], indices[i + 2])))
          throw userError('Pele identificada na peça. Use a ferramenta Separar pele antes de converter para Neon. Nenhuma saída foi criada.');
    }
  }
}

function newDeclaration(old) {
  ensure((old.flags & REQUIRED_FLAGS) === REQUIRED_FLAGS, ErrorCode.INVALID_INPUT, 'Roupa sem posições, pesos, ossos, normais ou UV principal.');
  let flags = old.flags, lo = old.lo, hi = old.hi;
  for (const [bit, type] of Object.entries(ADDED).map(([b, t]) => [Number(b), t])) {
    if (old.flags & (1 << bit)) continue;
    flags |= 1 << bit;
    if (bit < 8) lo = ((lo & ~(15 << (bit * 4))) | (type << (bit * 4))) >>> 0; else hi = ((hi & ~(15 << ((bit - 8) * 4))) | (type << ((bit - 8) * 4))) >>> 0;
  }
  const components = []; let offset = 0;
  for (let i = 0; i < 16; i++) {
    if (!((flags >>> i) & 1)) continue;
    const type = (i < 8 ? lo >>> (i * 4) : hi >>> ((i - 8) * 4)) & 15;
    components.push({bit: i, type, offset, size: COMPONENT_SIZES[type]}); offset += COMPONENT_SIZES[type];
  }
  ensure(components.find(c => c.bit === 4).type === 9, ErrorCode.INVALID_INPUT, 'Canal de cor não suportado para Neon.');
  return {flags: flags >>> 0, lo, hi, stride: offset, components};
}

// Tangents as the desktop engine computes them (per-face accumulation from positions/UVs, Gram-Schmidt with the normal).
function tangents(arrays) {
  const {positions: p, normals: n, uvs: t, indices} = arrays, count = p.length / 3, acc = new Float64Array(count * 3);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    const e1 = [0, 1, 2].map(k => p[b * 3 + k] - p[a * 3 + k]), e2 = [0, 1, 2].map(k => p[c * 3 + k] - p[a * 3 + k]);
    const d1 = [t[b * 2] - t[a * 2], t[b * 2 + 1] - t[a * 2 + 1]], d2 = [t[c * 2] - t[a * 2], t[c * 2 + 1] - t[a * 2 + 1]];
    const det = d1[0] * d2[1] - d1[1] * d2[0]; if (Math.abs(det) < 1e-12) continue;
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) acc[v * 3 + k] += (e1[k] * d2[1] - e2[k] * d1[1]) / det;
  }
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    let nx = n[i * 3], ny = n[i * 3 + 1], nz = n[i * 3 + 2]; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const dot = nx * acc[i * 3] + ny * acc[i * 3 + 1] + nz * acc[i * 3 + 2];
    let tx = acc[i * 3] - nx * dot, ty = acc[i * 3 + 1] - ny * dot, tz = acc[i * 3 + 2] - nz * dot;
    if (tx * tx + ty * ty + tz * tz < 1e-12) { // cross(n, Z or Y)
      const [ux, uy, uz] = Math.abs(nz) < 0.9 ? [0, 0, 1] : [0, 1, 0];
      tx = ny * uz - nz * uy; ty = nz * ux - nx * uz; tz = nx * uy - ny * ux;
    }
    const l = Math.hypot(tx, ty, tz) || 1; out.set([tx / l, ty / l, tz / l, 1], i * 4);
  }
  return out;
}

function geometrySignature(read, drawable, keepBits) {
  const parts = [];
  for (const lod of LODS) for (const {geometry: g} of lodGeometries(drawable, lod)) {
    const idx = read.view.dv(g.indexData.region), comps = g.declaration.components.filter(c => keepBits.get(g.at)?.has(c.bit) ?? true);
    let h = `${lod}|${g.vertexCount}|${g.indexCount}|`;
    for (let i = 0; i < g.indexCount; i++) h += idx.getUint16(g.indexData.off + i * 2, true) + ',';
    parts.push(h);
    for (const c of comps) { let s = ''; for (let i = 0; i < g.vertexCount; i++) s += Array.from(vertexBytes(read.view, g, i).subarray(c.offset, c.offset + c.size)).join('.') + ';'; parts.push(`${c.bit}:${c.type}:${s}`); }
  }
  return parts;
}
const rigOf = d => JSON.stringify(d.skeleton?.bones ?? null);
const embeddedOf = (read, d) => JSON.stringify(d.shaderGroup.embeddedTextures.map(t => [t.name, t.width, t.height, t.formatCode, t.levels, t.data ? Array.from((t.data.region === 'system' ? read.view.system : read.view.graphics).subarray(t.data.off, t.data.off + t.size)).reduce((a, b) => (a * 31 + b) | 0, 0) : 0]));

/**
 * Convert a read YDD (single drawable) to Neon. name: internal drawable name (e.g. "jbib_005_u").
 * Returns {read: the converted file re-read, regions: repacked regions (encode with the YDD version), report}.
 */
export function convertNeon(read, {name, reference = null}) {
  ensure(/^[a-z0-9_]{1,63}$/i.test(name), ErrorCode.INVALID_INPUT, 'Nome interno inválido.');
  if (read.model.drawables.length !== 1) throw userError('Esta etapa exige um drawable por YDD.');
  refuseSkin(read, reference);
  const d = read.model.drawables[0].drawable;
  const ext = new Extender(read.resource), graphics = Uint8Array.from(read.resource.graphics ?? []);
  const sdv = () => ext.dv;
  // Original bits per geometry (for the preservation check: every original channel except Colour0).
  const keepBits = new Map();
  // 1. Shaders: same ShaderFX slots, new preset parameter blocks pointing at the original textures.
  const reused = new Set();
  for (const s of d.shaderGroup.shaders) {
    const params = ext.alloc(PRESET.length); ext.bytes.set(PRESET, params);
    for (let k = 0; k < PRESET_COUNT; k++) {
      const field = params + k * 16 + 8;
      if (k < 4) {
        const src = s.parameters.find(p => p.kind === 'texture' && p.hash === PRESET_TEXTURES[k] && p.textureAt !== null);
        if (src) { ext.ptr(field, src.textureAt); reused.add(src.textureAt); }
      } else ext.ptr(field, params + PRESET_COUNT * 16 + (k - 4) * 16);
    }
    const dv = sdv(), fx = s.at;
    ext.ptr(fx, params);
    dv.setUint32(fx + 8, NEON_SHADER.name, true); dv.setUint32(fx + 0xC, 0, true);
    ext.bytes[fx + 0x10] = PRESET_COUNT; ext.bytes[fx + 0x11] = 0; dv.setUint16(fx + 0x12, 0x8000, true);
    dv.setUint16(fx + 0x14, 0x160, true); dv.setUint16(fx + 0x16, 0x1c0, true);
    dv.setUint32(fx + 0x18, NEON_SHADER.file, true); dv.setUint32(fx + 0x1C, 0, true);
    dv.setUint32(fx + 0x20, 0xff01, true); dv.setUint16(fx + 0x24, 0, true); ext.bytes[fx + 0x26] = 0; ext.bytes[fx + 0x27] = 4;
    dv.setBigUint64(fx + 0x28, 0n, true);
    ext.bytes.fill(0, s.parametersAt, s.parametersAt + s.parameterBytes);
  }
  // References the preset no longer uses are left as they are: a texture parameter may point at an
  // embedded texture of the dictionary, which must stay intact (the repacker keeps the few stray bytes).
  // 2. Vertices.
  const patchedDecls = new Map();
  for (const lod of LODS) for (const {geometry: g} of lodGeometries(d, lod)) {
    const old = g.declaration;
    const decl = patchedDecls.get(old.at)?.decl ?? newDeclaration(old);
    keepBits.set(g.at, new Set(old.components.map(c => c.bit).filter(b => b !== 4)));
    if (!patchedDecls.has(old.at)) {
      patchedDecls.set(old.at, {decl});
      const dv = sdv(); dv.setUint32(old.at, decl.flags, true); dv.setUint16(old.at + 4, decl.stride, true); ext.bytes[old.at + 7] = decl.components.length;
      dv.setUint32(old.at + 8, decl.lo, true); dv.setUint32(old.at + 12, decl.hi, true);
    }
    const arrays = geometryArrays(read.view, g), tan = old.flags & (1 << 14) ? null : tangents(arrays);
    const at = ext.alloc(g.vertexCount * decl.stride), dv = sdv();
    const src = g.vertexData.region === 'system' ? read.resource.system : read.resource.graphics;
    for (let i = 0; i < g.vertexCount; i++) {
      const base = at + i * decl.stride;
      for (const c of decl.components) {
        const o = old.components.find(x => x.bit === c.bit), dst = base + c.offset;
        if (c.bit === 4) ext.bytes.set(NEON_COLOUR, dst);
        else if (o) ext.bytes.set(src.subarray(g.vertexData.off + i * g.stride + o.offset, g.vertexData.off + i * g.stride + o.offset + o.size), dst);
        else if (c.bit === 7) { dv.setFloat32(dst, 1, true); dv.setFloat32(dst + 4, -1, true); }
        else if (c.bit === 14) for (let k = 0; k < 4; k++) dv.setFloat32(dst + k * 4, tan[i * 4 + k], true);
      }
    }
    const vb = g.vertexBufferAt;
    dv.setUint16(vb + 8, decl.stride, true); dv.setUint16(g.at + 0x70, decl.stride, true);
    if (dv.getUint32(vb + 0x10, true)) ext.ptr(vb + 0x10, at);
    ext.ptr(vb + 0x20, at); ext.ptr(g.at + 0x78, at);
    if (g.vertexData.region === 'system') ext.bytes.fill(0, g.vertexData.off, g.vertexData.off + g.vertexData.length);
    else graphics.fill(0, g.vertexData.off, g.vertexData.off + g.vertexData.length);
  }
  // 3. Identity: new internal name and dictionary hash.
  const str = ext.alloc(name.length + 1);
  for (let k = 0; k < name.length; k++) ext.bytes[str + k] = name.charCodeAt(k);
  ext.ptr(d.at + 0xA8, str); sdv().setUint32(read.model.hashesAt, joaat(name.toLowerCase()), true);
  const converted = readYddResource({...ext.finish(), graphics});
  // 4. Validation of the converted file against the original.
  const c = converted.model.drawables[0].drawable;
  const before = geometrySignature(read, d, keepBits);
  const keepAfter = new Map(); let gi = 0;
  const origList = LODS.flatMap(l => lodGeometries(d, l)), newList = LODS.flatMap(l => lodGeometries(c, l));
  ensure(origList.length === newList.length, ErrorCode.INCONSISTENT_REFERENCE, 'Geometria, UVs, pesos ou esqueleto mudaram. Saída rejeitada.');
  for (const {geometry} of newList) keepAfter.set(geometry.at, keepBits.get(origList[gi++].geometry.at));
  const after = geometrySignature(converted, c, keepAfter);
  ensure(before.length === after.length && before.every((x, i) => x === after[i]) && rigOf(d) === rigOf(c), ErrorCode.INCONSISTENT_REFERENCE, 'Geometria, UVs, pesos ou esqueleto mudaram. Saída rejeitada.');
  ensure(embeddedOf(read, d) === embeddedOf(converted, c), ErrorCode.INCONSISTENT_REFERENCE, 'Texturas embutidas mudaram. Saída rejeitada.');
  ensure(c.name === name && converted.model.drawables[0].hash === joaat(name.toLowerCase()) && c.shaderGroup.shaders.every(s => s.fileHash === NEON_SHADER.file),
    ErrorCode.INCONSISTENT_REFERENCE, 'Preset ou identificação Neon inválidos.');
  for (const {geometry: g} of newList) {
    const col = componentReader(converted.view, g, 'colour0');
    for (let i = 0; i < g.vertexCount; i++) ensure(col(i).every((v, k) => v === NEON_COLOUR[k]), ErrorCode.INCONSISTENT_REFERENCE, 'Cor de vértice Neon não foi preservada.');
  }
  const regions = repackYdd(converted);
  const report = {geometryPreserved: true, rigPreserved: true, embeddedPreserved: true, shader: NEON_SHADER.label,
    lods: LODS.filter(l => c.lods[l]).map(l => ({lod: l, vertices: lodGeometries(c, l).reduce((s, x) => s + x.geometry.vertexCount, 0), triangles: lodGeometries(c, l).reduce((s, x) => s + x.geometry.triangles, 0)}))};
  return {read: converted, regions, report};
}
