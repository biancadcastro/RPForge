// "Separar pele": classify the faces of a garment into skin, cloth and uncertain per LOD, let the
// person review them, and write two YDDs (cloth and skin) with the faces partitioned.
// Same rules as the desktop engine (scripts/clothing/ClothingSkin.cs, docs/CLOTHING_SKIN.md):
// - High LOD: a face is skin when its shader is a ped skin shader or its triangle is in the
//   freemode body reference; otherwise cloth.
// - Lower LODs may hold only part of the body: unresolved faces are proven skin/cloth when all their
//   corners match high-LOD vertices of one role (same material, position and UV), or when samples of
//   the face fall only inside high-LOD UV triangles of one role of the same material. Otherwise the
//   face is uncertain and blocks the export until the person marks it.
// - The output keeps vertex bytes, rig, materials and embedded textures; it is re-read and compared.
import {readYddResource, lodGeometries, LODS} from './ydd-read.js';
import {repackYdd} from './ydd-write.js';
import {geometryArrays, vertexBytes} from './vertex.js';
import {triangleFingerprint, isSkinShader} from './skin-reference.js';
import {Extender} from '../vehicle-engine/yft-grow.js';
import {joaat} from '../animation-engine/hash.js';
import {ErrorCode, EngineError, ensure} from '../animation-engine/errors.js';

export const SKIN_LIMITS = Object.freeze({faces: 2_000_000, overrides: 200_000});
const ROLE = Object.freeze({cloth: 0, skin: 1, uncertain: 2});
const userError = message => new EngineError(ErrorCode.INVALID_INPUT, message);
const q = v => Math.floor(v * 10000 + 0.5);

function material(shader, index) { return shader?.diffuse ? shader.diffuse.toLowerCase() : `shader:${index}`; }

function insideUv(px, py, t) {
  const ax = t[2] - t[0], ay = t[3] - t[1], bx = t[4] - t[0], by = t[5] - t[1], qx = px - t[0], qy = py - t[1];
  const det = ax * by - ay * bx; if (Math.abs(det) < 1e-12) return false;
  const u = (qx * by - qy * bx) / det, v = (ax * qy - ay * qx) / det;
  return u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001;
}

/**
 * Analyse a single-drawable YDD. reference: Set of triangle fingerprints for the garment's gender.
 * Returns {lods: {lod: [{model, index, material, arrays, roles: Uint8Array (0 cloth, 1 skin, 2 uncertain)}]}, counts, canSplit, reason}.
 */
export function analyseSkin(read, reference) {
  if (read.model.drawables.length !== 1) throw userError('Esta etapa exige um drawable por YDD.');
  const d = read.model.drawables[0].drawable, lods = {};
  let total = 0;
  for (const lod of LODS) {
    const list = lodGeometries(d, lod);
    if (!list.length) continue;
    lods[lod] = list.map(({model, index, geometry, shader}) => {
      const arrays = geometryArrays(read.view, geometry);
      ensure(arrays.uvs, ErrorCode.INVALID_INPUT, 'UV principal não suportado.');
      const faces = arrays.indices.length / 3, roles = new Uint8Array(faces);
      total += faces; if (total > SKIN_LIMITS.faces) throw userError('Peça excede o limite de faces.');
      const all = isSkinShader(shader);
      for (let f = 0; f < faces; f++) roles[f] = all || reference.has(triangleFingerprint(arrays.positions, arrays.indices[f * 3], arrays.indices[f * 3 + 1], arrays.indices[f * 3 + 2])) ? ROLE.skin : ROLE.cloth;
      return {model, index, material: material(shader, geometry.shaderIndex), arrays, roles, geometry};
    });
  }
  ensure(lods.high, ErrorCode.INVALID_INPUT, 'A peça não tem LOD Alto.');
  // High-LOD vertex keys and UV faces per role.
  const vkey = (g, v) => `${g.material}:${q(g.arrays.positions[v * 3])},${q(g.arrays.positions[v * 3 + 1])},${q(g.arrays.positions[v * 3 + 2])}:${q(g.arrays.uvs[v * 2])},${q(g.arrays.uvs[v * 2 + 1])}`;
  const skinKeys = new Set(), clothKeys = new Set(), uvFaces = new Map(); // material -> [{t: Float64Array(6), skin}]
  for (const g of lods.high) {
    const {indices: ix, uvs} = g.arrays, list = uvFaces.get(g.material) ?? uvFaces.set(g.material, []).get(g.material);
    for (let f = 0; f < g.roles.length; f++) {
      const skin = g.roles[f] === ROLE.skin, target = skin ? skinKeys : clothKeys, t = new Float64Array(6);
      for (let c = 0; c < 3; c++) { const v = ix[f * 3 + c]; target.add(vkey(g, v)); t[c * 2] = uvs[v * 2]; t[c * 2 + 1] = uvs[v * 2 + 1]; }
      list.push({t, skin});
    }
  }
  for (const lod of LODS.slice(1)) for (const g of lods[lod] ?? []) {
    const {indices: ix, uvs} = g.arrays, faces = uvFaces.get(g.material) ?? [];
    for (let f = 0; f < g.roles.length; f++) {
      if (g.roles[f] === ROLE.skin) continue;
      const keys = [0, 1, 2].map(c => vkey(g, ix[f * 3 + c]));
      const allSkin = keys.every(k => skinKeys.has(k)), allCloth = keys.every(k => clothKeys.has(k));
      if (allSkin && !allCloth) { g.roles[f] = ROLE.skin; continue; }
      if (allCloth && !allSkin) continue;
      const p = [0, 1, 2].map(c => [uvs[ix[f * 3 + c] * 2], uvs[ix[f * 3 + c] * 2 + 1]]);
      const mix = (a, b, c) => [p[0][0] * a + p[1][0] * b + p[2][0] * c, p[0][1] * a + p[1][1] * b + p[2][1] * c];
      const samples = [mix(1 / 3, 1 / 3, 1 / 3), mix(0.6, 0.2, 0.2), mix(0.2, 0.6, 0.2), mix(0.2, 0.2, 0.6)];
      let onlySkin = true, onlyCloth = true;
      for (const [sx, sy] of samples) {
        let hasSkin = false, hasCloth = false;
        for (const face of faces) if (insideUv(sx, sy, face.t)) { if (face.skin) hasSkin = true; else hasCloth = true; if (hasSkin && hasCloth) break; }
        onlySkin &&= hasSkin && !hasCloth; onlyCloth &&= hasCloth && !hasSkin;
      }
      g.roles[f] = onlySkin ? ROLE.skin : onlyCloth ? ROLE.cloth : ROLE.uncertain;
    }
  }
  return summarize({lods});
}

export function summarize(analysis) {
  const counts = LODS.filter(l => analysis.lods[l]).map(lod => {
    const c = {lod, skin: 0, cloth: 0, uncertain: 0};
    for (const g of analysis.lods[lod]) for (const r of g.roles) c[r === ROLE.skin ? 'skin' : r === ROLE.cloth ? 'cloth' : 'uncertain']++;
    return c;
  });
  const high = counts[0];
  const reason = !high.skin ? 'Pele não identificada com segurança. Marque as faces de pele antes de separar.'
    : !high.cloth ? 'A peça contém somente pele reconhecida; não há roupa para separar.'
    : counts.find(c => c.uncertain) ? `Há faces incertas no LOD ${{high: 'Alto', med: 'Médio', low: 'Baixo', vlow: 'Muito baixo'}[counts.find(c => c.uncertain).lod]}. Marque-as como pele ou roupa.` : null;
  return Object.assign(analysis, {counts, canSplit: reason === null, reason});
}

/** Apply manual decisions: {"lod:geometry:face": "skin" | "cloth"}. */
export function applyOverrides(analysis, overrides) {
  const entries = Object.entries(overrides ?? {});
  if (entries.length > SKIN_LIMITS.overrides) throw userError('Seleção de faces inválida.');
  for (const [key, value] of entries) {
    const m = /^(high|med|low|vlow):(\d{1,5}):(\d{1,7})$/.exec(key);
    const g = m && analysis.lods[m[1]]?.[Number(m[2])];
    if (!g || Number(m[3]) >= g.roles.length || !['skin', 'cloth'].includes(value)) throw userError('Seleção de faces inválida. Refaça a análise.');
    g.roles[Number(m[3])] = ROLE[value];
  }
  return summarize(analysis);
}

// --- Writing one role -------------------------------------------------------------------------

function writeBounds(ext, at, lo, hi) {
  const dv = ext.dv;
  for (let k = 0; k < 3; k++) { dv.setFloat32(at + k * 4, lo[k], true); dv.setFloat32(at + 16 + k * 4, hi[k], true); }
  dv.setFloat32(at + 12, 0, true); dv.setFloat32(at + 28, 0, true);
}

/** Build the YDD that keeps only the faces of one role ('cloth' or 'skin'), named `name`. Returns the re-read file. */
function buildRole(read, analysis, role, name) {
  const d = read.model.drawables[0].drawable, want = ROLE[role];
  const ext = new Extender(read.resource), graphics = Uint8Array.from(read.resource.graphics ?? []);
  const zero = (region, off, len) => (region === 'system' ? ext.bytes : graphics).fill(0, off, off + len);
  let dlo = [Infinity, Infinity, Infinity], dhi = [-Infinity, -Infinity, -Infinity];
  LODS.forEach((lod, li) => {
    const models = d.lods[lod]; if (!models) return;
    let gi = 0; const keptModels = [];
    for (const m of models) {
      const kept = [];
      for (const g of m.geometries) {
        const a = analysis.lods[lod][gi++], ix = a.arrays.indices, faces = [];
        for (let f = 0; f < a.roles.length; f++) if (a.roles[f] === want) faces.push(f);
        if (!faces.length) {
          // Geometry leaves this file: its structures are zeroed so the repacker does not keep them.
          for (const [r, o, l] of [['system', g.at, 0x98], ['system', g.vertexBufferAt, 0x80], ['system', g.indexBufferAt, 0x60],
            [g.vertexData.region, g.vertexData.off, g.vertexData.length], [g.indexData.region, g.indexData.off, g.indexData.length]]) zero(r, o, l);
          continue;
        }
        // Compact: used vertices in ascending order, indices remapped.
        const used = [...new Set(faces.flatMap(f => [ix[f * 3], ix[f * 3 + 1], ix[f * 3 + 2]]))].sort((x, y) => x - y), map = new Map(used.map((v, i) => [v, i]));
        const vd = ext.alloc(used.length * g.stride), src = g.vertexData.region === 'system' ? read.resource.system : read.resource.graphics;
        used.forEach((v, i) => ext.bytes.set(src.subarray(g.vertexData.off + v * g.stride, g.vertexData.off + (v + 1) * g.stride), vd + i * g.stride));
        const id = ext.alloc(faces.length * 6), dv = ext.dv;
        faces.forEach((f, k) => { for (let c = 0; c < 3; c++) dv.setUint16(id + (k * 3 + c) * 2, map.get(ix[f * 3 + c]), true); });
        zero(g.vertexData.region, g.vertexData.off, g.vertexData.length); zero(g.indexData.region, g.indexData.off, g.indexData.length);
        const vb = g.vertexBufferAt, ib = g.indexBufferAt;
        if (dv.getUint32(vb + 0x10, true)) ext.ptr(vb + 0x10, vd);
        ext.ptr(vb + 0x20, vd); ext.ptr(g.at + 0x78, vd); dv.setUint32(vb + 0x18, used.length, true); dv.setUint16(g.at + 0x60, used.length & 0xffff, true);
        ext.ptr(ib + 0x10, id); dv.setUint32(ib + 8, faces.length * 3, true); dv.setUint32(g.at + 0x58, faces.length * 3, true); dv.setUint32(g.at + 0x5C, faces.length, true);
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], p = a.arrays.positions;
        for (const v of used) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[v * 3 + k]); hi[k] = Math.max(hi[k], p[v * 3 + k]); }
        kept.push({g, lo, hi});
      }
      if (!kept.length) {
        zero('system', m.at, 0x30); zero('system', m.geometryPointersAt, m.geometries.length * 8); zero('system', m.shaderMappingAt, m.geometries.length * 2);
        if (m.boundsAt !== null) zero('system', m.boundsAt, (m.geometries.length > 1 ? m.geometries.length + 1 : 1) * 32);
        continue;
      }
      // Rewrite the model's geometry pointers, shader mapping and bounds for the kept geometries.
      const n = kept.length, ptrs = ext.alloc(n * 8), mapping = ext.alloc(Math.max(16, n * 2)), boxes = ext.alloc((n > 1 ? n + 1 : 1) * 32);
      kept.forEach((k, i) => { ext.ptr(ptrs + i * 8, k.g.at); ext.dv.setUint16(mapping + i * 2, k.g.shaderIndex, true); });
      const mlo = [0, 1, 2].map(k => Math.min(...kept.map(x => x.lo[k]))), mhi = [0, 1, 2].map(k => Math.max(...kept.map(x => x.hi[k])));
      if (n > 1) { writeBounds(ext, boxes, mlo, mhi); kept.forEach((k, i) => writeBounds(ext, boxes + (i + 1) * 32, k.lo, k.hi)); } else writeBounds(ext, boxes, kept[0].lo, kept[0].hi);
      zero('system', m.geometryPointersAt, m.geometries.length * 8); zero('system', m.shaderMappingAt, m.geometries.length * 2);
      if (m.boundsAt !== null) zero('system', m.boundsAt, (m.geometries.length > 1 ? m.geometries.length + 1 : 1) * 32);
      ext.ptr(m.at + 8, ptrs); ext.ptr(m.at + 0x18, boxes); ext.ptr(m.at + 0x20, mapping);
      const dv = ext.dv; dv.setUint16(m.at + 0x10, n, true); dv.setUint16(m.at + 0x12, n, true); dv.setUint16(m.at + 0x2E, n, true);
      for (let k = 0; k < 3; k++) { dlo[k] = Math.min(dlo[k], mlo[k]); dhi[k] = Math.max(dhi[k], mhi[k]); }
      keptModels.push(m.at);
    }
    // Model list of this LOD.
    const head = models.listAt, dv = ext.dv, oldPtrs = dv.getUint32(head, true) - 0x50000000;
    if (!keptModels.length) {
      ensure(lod !== 'high', ErrorCode.INVALID_INPUT, 'O LOD Alto ficaria vazio.');
      zero('system', oldPtrs, models.length * 8); zero('system', head, 16);
      dv.setBigUint64(d.at + 0x50 + li * 8, 0n, true); dv.setUint32(d.at + 0x80 + li * 4, 0, true);
      return;
    }
    keptModels.forEach((at, i) => ext.ptr(oldPtrs + i * 8, at));
    for (let i = keptModels.length; i < models.length; i++) dv.setBigUint64(oldPtrs + i * 8, 0n, true);
    dv.setUint16(head + 8, keptModels.length, true); dv.setUint16(head + 10, keptModels.length, true);
  });
  // Drawable bounds, name and dictionary hash.
  const dv = ext.dv;
  for (let k = 0; k < 3; k++) { dv.setFloat32(d.at + 0x30 + k * 4, dlo[k], true); dv.setFloat32(d.at + 0x40 + k * 4, dhi[k], true); dv.setFloat32(d.at + 0x20 + k * 4, (dlo[k] + dhi[k]) / 2, true); }
  dv.setFloat32(d.at + 0x2C, Math.hypot(dhi[0] - dlo[0], dhi[1] - dlo[1], dhi[2] - dlo[2]) / 2, true);
  const str = ext.alloc(name.length + 1);
  for (let k = 0; k < name.length; k++) ext.bytes[str + k] = name.charCodeAt(k);
  ext.ptr(d.at + 0xA8, str); dv.setUint32(read.model.hashesAt, joaat(name.toLowerCase()), true);
  return readYddResource({...ext.finish(), graphics});
}

// Signature of the faces of one role: per LOD and geometry, shader, declaration and the bytes of every face corner.
function signature(read, drawable, roleOf) {
  const parts = [];
  for (const lod of LODS) {
    let gi = 0;
    for (const {geometry: g, shader} of lodGeometries(drawable, lod)) {
      const roles = roleOf(lod, gi++), ix = geometryArrays(read.view, g).indices;
      let s = '';
      for (let f = 0; f < ix.length / 3; f++) if (!roles || roles(f)) for (let c = 0; c < 3; c++) s += Array.from(vertexBytes(read.view, g, ix[f * 3 + c])).join('.') + ';';
      if (!s) continue;
      parts.push(`${lod}|${JSON.stringify([shader.nameHash, shader.fileHash, shader.parameters.map(p => [p.hash, p.texture ?? p.value])])}|${g.declaration.flags}|${g.declaration.lo}|${g.declaration.hi}|${s}`);
    }
  }
  return parts;
}
const rigOf = d => JSON.stringify(d.skeleton?.bones ?? null);
const embeddedOf = (read, d) => JSON.stringify(d.shaderGroup.embeddedTextures.map(t => [t.name, t.width, t.height, t.formatCode, t.levels,
  t.data ? Array.from((t.data.region === 'system' ? read.view.system : read.view.graphics).subarray(t.data.off, t.data.off + t.size)).reduce((a, b) => (a * 31 + b) | 0, 0) : 0]));

/**
 * Write the two YDDs. names: {cloth, skin} internal drawable names. analysis must be splittable (canSplit).
 * Returns {cloth: {read, regions}, skin: {read, regions}, report}.
 */
export function splitSkin(read, analysis, names) {
  summarize(analysis);
  if (!analysis.canSplit) throw userError(analysis.reason);
  for (const n of [names.cloth, names.skin]) ensure(/^[a-z0-9_]{1,63}$/i.test(n), ErrorCode.INVALID_INPUT, 'Nome interno inválido.');
  const d = read.model.drawables[0].drawable, out = {};
  for (const role of ['cloth', 'skin']) {
    const built = buildRole(read, analysis, role, names[role]), c = built.model.drawables[0].drawable;
    const expected = signature(read, d, (lod, gi) => { const r = analysis.lods[lod][gi].roles; return f => r[f] === ROLE[role]; });
    const actual = signature(built, c, () => null);
    ensure(expected.length === actual.length && expected.every((x, i) => x === actual[i]) && rigOf(d) === rigOf(c), ErrorCode.INCONSISTENT_REFERENCE, 'Faces, atributos de vértice, materiais ou rig alterados. Saída rejeitada.');
    ensure(embeddedOf(read, d) === embeddedOf(built, c), ErrorCode.INCONSISTENT_REFERENCE, 'Texturas embutidas alteradas. Saída rejeitada.');
    ensure(c.name === names[role] && built.model.drawables[0].hash === joaat(names[role].toLowerCase()), ErrorCode.INCONSISTENT_REFERENCE, 'Identificação do drawable inválida.');
    out[role] = {read: built, regions: repackYdd(built)};
  }
  out.report = {lods: analysis.counts, partitionPreserved: true, attributesPreserved: true, rigPreserved: true, materialsPreserved: true, texturesPreserved: true};
  return out;
}

/** Mesh data for the review viewer: per LOD, per geometry, positions/normals/uvs/indices and per-face roles. */
export function previewOf(analysis) {
  return Object.fromEntries(Object.entries(analysis.lods).map(([lod, list]) => [lod, list.map((g, i) => ({id: `${lod}:${i}`, material: g.material,
    positions: g.arrays.positions, normals: g.arrays.normals, uvs: g.arrays.uvs, indices: g.arrays.indices, roles: g.roles}))]));
}
export {ROLE};
