// "Roupas para OBJ": one LOD of a clothing YDD as OBJ + MTL, for texturing.
// Same contract as the desktop tool (docs/CLOTHING_OBJ.md): bind pose, GTA Z-up axes and
// original scale; OBJ V = 1 - GTA V; native normals kept; one group/material per geometry;
// every geometry must have normals, UVs and a diffuse texture found embedded or in the YTD given.
import {LODS, LOD_LABELS, lodGeometries} from './ydd-read.js';
import {geometryArrays} from './vertex.js';
import {ErrorCode, EngineError, ensure} from '../animation-engine/errors.js';

export const OBJ_LIMITS = Object.freeze({vertices: 1_000_000, triangles: 2_000_000});

/** Shortest decimal that reads back as the same float32. */
export function f32(x) {
  const v = Math.fround(x);
  if (Object.is(v, -0) || v === 0) return '0';
  for (let p = 1; p <= 9; p++) { const s = Number(v.toPrecision(p)); if (Math.fround(s) === v) return String(s); }
  return String(v);
}

const userError = (message, details) => new EngineError(ErrorCode.INVALID_INPUT, message, details);

/**
 * read: readYdd result. textures: names available in the YTD the user chose (array of strings) or [].
 * Returns {obj, mtl, report}. The OBJ references "<name>.mtl".
 */
export function buildClothingObj(read, {lod = 'high', textures = [], name = 'roupa'} = {}) {
  ensure(LODS.includes(lod), ErrorCode.INVALID_INPUT, 'Invalid LOD', {lod});
  ensure(/^[A-Za-z0-9_^.-]{1,120}$/.test(name), ErrorCode.INVALID_INPUT, 'Invalid output name');
  const external = new Set(textures.map(t => t.toLowerCase()));
  const meshes = [];
  read.model.drawables.forEach(({drawable: d}, di) => {
    const list = lodGeometries(d, lod);
    if (!list.length) throw userError(`A peça não tem o LOD ${LOD_LABELS[lod]}. Escolha outro LOD.`, {drawable: di});
    const embedded = new Set(d.shaderGroup.embeddedTextures.map(t => t.name.toLowerCase()));
    for (const {geometry: g, shader} of list) {
      const diffuse = shader?.diffuse;
      if (!diffuse) throw userError('Há um material sem textura difusa (DiffuseSampler).');
      if (!embedded.has(diffuse.toLowerCase()) && !external.has(diffuse.toLowerCase()))
        throw userError(`Textura difusa ausente: ${diffuse}. Selecione o YTD correspondente.`, {texture: diffuse});
      const a = geometryArrays(read.view, g);
      if (!a.normals || !a.uvs) throw userError('Malha sem normais ou UV principal.');
      for (const arr of [a.positions, a.normals, a.uvs]) if (arr.some(v => !Number.isFinite(v) || Math.abs(v) > 1e8)) throw userError('Coordenada inválida na malha.');
      meshes.push({...a, texture: diffuse, shader: shader.name});
    }
  });
  const vertices = meshes.reduce((s, m) => s + m.positions.length / 3, 0), triangles = meshes.reduce((s, m) => s + m.indices.length / 3, 0);
  if (vertices > OBJ_LIMITS.vertices || triangles > OBJ_LIMITS.triangles) throw userError('Peça excede o limite de geometria.');
  const obj = ['# RPForge: LOD selecionado, bind pose, eixos GTA Z-up, escala original', '# UV V = 1 - GTA V; OBJ para texturizacao, sem rig', `mtllib ${name}.mtl`];
  const mtl = ['# RPForge: materiais difusos; shaders GTA permanecem no YDD original'];
  let base = 1;
  meshes.forEach((m, i) => {
    obj.push(`o mesh_${i}`, `usemtl material_${i}`);
    const n = m.positions.length / 3;
    for (let k = 0; k < n; k++) obj.push(`v ${f32(m.positions[k * 3])} ${f32(m.positions[k * 3 + 1])} ${f32(m.positions[k * 3 + 2])}`);
    for (let k = 0; k < n; k++) obj.push(`vt ${f32(m.uvs[k * 2])} ${f32(1 - m.uvs[k * 2 + 1])}`);
    for (let k = 0; k < n; k++) obj.push(`vn ${f32(m.normals[k * 3])} ${f32(m.normals[k * 3 + 1])} ${f32(m.normals[k * 3 + 2])}`);
    for (let k = 0; k < m.indices.length; k += 3) obj.push('f ' + [0, 1, 2].map(c => { const v = m.indices[k + c] + base; return `${v}/${v}/${v}`; }).join(' '));
    base += n;
    mtl.push(`newmtl material_${i}`, 'Kd 1 1 1', 'd 1', 'illum 2', '');
  });
  return {obj: obj.join('\n') + '\n', mtl: mtl.join('\n') + '\n',
    report: {lod, vertices, triangles, meshes: meshes.length, groups: meshes.map((m, i) => ({name: `mesh_${i}`, material: `material_${i}`, texture: m.texture, shader: m.shader}))}};
}
