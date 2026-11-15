// YDD (rage::pgDictionary<rmcDrawable>, resource version 165) reader for ped clothing. Pure JS, no CodeWalker.
// Same approach as the vehicle engine (src/vehicle-engine/yft-read.js): every structure read is
// logged in view.blocks and every pointer followed in view.pointerFields, so the full writer
// (vehicle-engine/yft-repack.js) can lay the file out again after edits.
// Layouts were studied from CodeWalker sources/metadata (MIT); CodeWalker is used only as an
// offline oracle in tests, never at runtime.
import {ResourceView} from '../vehicle-engine/view.js';
import {VERTEX_SEMANTICS, COMPONENT_SIZES, COMPONENT_NAMES} from '../vehicle-engine/names.js';
import {readTextureDictionary} from '../vehicle-engine/yft-read.js';
import {ErrorCode, ensure} from '../animation-engine/errors.js';
import {joaat} from '../animation-engine/hash.js';

export const YDD_RESOURCE_VERSION = 165;
export const YTD_RESOURCE_VERSION = 13;
// Engine safety budgets (not game limits). Real freemode clothing is a few MiB.
export const CLOTHING_LIMITS = Object.freeze({maxInputBytes: 64 * 1024 * 1024, maxRegionBytes: 192 * 1024 * 1024, maxPages: 213});
export const SIZES = Object.freeze({
  dictionary: 0x40, drawable: 0xD0, shaderGroup: 0x40, shaderFX: 0x30, shaderParam: 16, texture: 0x50,
  skeleton: 0x70, bone: 0x50, matrix: 64, model: 0x30, geometry: 0x98, vertexBuffer: 0x80, vertexDeclaration: 16,
  indexBuffer: 0x60, aabb: 32, joints: 0x40, light: 0xA8,
});
export const LODS = Object.freeze(['high', 'med', 'low', 'vlow']);
export const LOD_LABELS = Object.freeze({high: 'Alto', med: 'Médio', low: 'Baixo', vlow: 'Muito baixo'});
export const SKIN_SHADER_FILES = Object.freeze(['ped_skin.sps', 'ped_skin_head.sps', 'ped_skin_body.sps'].map(joaat));
const DIFFUSE = joaat('DiffuseSampler');

// Shader/parameter names seen in ped clothing; display only (the file stores hashes).
const NAMES = new Map(['ped', 'ped_alpha', 'ped_cloth', 'ped_cloth_enveff', 'ped_decal', 'ped_decal_decoration', 'ped_decal_nodiff', 'ped_default',
  'ped_default_cloth', 'ped_default_enveff', 'ped_default_mp', 'ped_default_palette', 'ped_emissive', 'ped_enveff', 'ped_fur', 'ped_hair_cutout_alpha',
  'ped_hair_spiked', 'ped_nopeddamagedecals', 'ped_palette', 'ped_skin', 'ped_skin_blendshape', 'ped_wrinkle', 'ped_wrinkle_cloth', 'ped_wrinkle_cloth_enveff',
  'ped_wrinkle_cs', 'ped_wrinkle_enveff', 'default', 'normal', 'normal_spec', 'emissive', 'cutout', 'decal'].flatMap(s => [[joaat(s), s], [joaat(`${s}.sps`), `${s}.sps`]]));
for (const p of ['DiffuseSampler', 'BumpSampler', 'SpecSampler', 'VolumeSampler', 'DetailSampler', 'TextureSamplerDiffPal', 'WrinkleMaskSampler_0', 'WrinkleMaskSampler_1',
  'WrinkleMaskSampler_2', 'WrinkleMaskSampler_3', 'WrinkleSampler_A', 'WrinkleSampler_B', 'umGlobalParams', 'envEffFatThickness', 'specularIntensityMult',
  'specularFalloffMult', 'specularFresnel', 'bumpiness', 'emissiveMultiplier', 'detailSettings', 'StubbleControl', 'PaletteSelector', 'wrinkleMaskStrengths0',
  'wrinkleMaskStrengths1', 'wrinkleMaskStrengths2', 'wrinkleMaskStrengths3', 'envEffScale', 'envEffTexTileUV', 'AlphaTest', 'HardAlphaBlend'])
  NAMES.set(joaat(p), p);
export const hashName = h => NAMES.get(h >>> 0) ?? `0x${(h >>> 0).toString(16).padStart(8, '0')}`;

function listHeader(v, at) { return {ptr: v.ptr(at), count: v.u16(at + 8), capacity: v.u16(at + 10)}; }

function readVertexDeclaration(v, off) {
  v.mark('system', off, SIZES.vertexDeclaration, 'VertexDeclaration');
  const flags = v.u32(off), stride = v.u16(off + 4), count = v.u8(off + 7);
  const lo = v.u32(off + 8), hi = v.u32(off + 12);
  const components = []; let offset = 0;
  for (let i = 0; i < 16; i++) {
    if (!((flags >>> i) & 1)) continue;
    const type = ((i < 8 ? lo >>> (i * 4) : hi >>> ((i - 8) * 4)) & 15);
    const size = COMPONENT_SIZES[type];
    ensure(size !== undefined, ErrorCode.UNSUPPORTED_STRUCTURE, 'Unknown vertex component type', {type});
    components.push({semantic: VERTEX_SEMANTICS[i], bit: i, type: COMPONENT_NAMES[type], typeCode: type, offset, size}); offset += size;
  }
  ensure(offset === stride, ErrorCode.INCONSISTENT_REFERENCE, 'Vertex declaration stride mismatch', {stride, computed: offset});
  ensure(components.length === count, ErrorCode.INCONSISTENT_REFERENCE, 'Vertex declaration count mismatch');
  return {at: off, flags, stride, lo, hi, components};
}

function readGeometry(v, off, ctx) {
  v.mark('system', off, SIZES.geometry, 'DrawableGeometry');
  const vbOff = v.ptr(off + 0x18, SIZES.vertexBuffer), ibOff = v.ptr(off + 0x38, SIZES.indexBuffer);
  ensure(vbOff !== null && ibOff !== null, ErrorCode.INCONSISTENT_REFERENCE, 'Geometry without buffers', {off});
  const indexCount = v.u32(off + 0x58), triangles = v.u32(off + 0x5C), primitive = v.u16(off + 0x62);
  const stride = v.u16(off + 0x70), boneIdCount = v.u16(off + 0x72);
  v.mark('system', vbOff, SIZES.vertexBuffer, 'VertexBuffer');
  const vbStride = v.u16(vbOff + 8), vbCount = v.u32(vbOff + 0x18);
  const decl = readVertexDeclaration(v, v.ptr(vbOff + 0x30, SIZES.vertexDeclaration));
  ensure(vbStride === stride && decl.stride === stride, ErrorCode.INCONSISTENT_REFERENCE, 'Vertex stride mismatch', {off});
  ensure(vbCount > 0 && vbCount <= 65536, ErrorCode.UNSUPPORTED_STRUCTURE, 'Vertex count outside 16-bit indices', {vbCount});
  // Rockstar files fill both data pointers of the vertex buffer; some exporters (Sollumz) fill only
  // the second one. Every pointer present must agree (one vertex stream).
  const data1 = v.ptrAny(vbOff + 0x10, vbCount * stride), data2 = v.ptrAny(vbOff + 0x20, vbCount * stride), dataG = v.pointer(off + 0x78);
  const data = data1 ?? data2;
  const same = p => !p || (p.region === data.region && p.off === data.off);
  ensure(data && same(data2) && same(dataG), ErrorCode.INCONSISTENT_REFERENCE, 'Vertex data pointer mismatch', {off});
  v.mark(data.region, data.off, vbCount * stride, 'VertexData');
  v.mark('system', ibOff, SIZES.indexBuffer, 'IndexBuffer');
  const ibCount = v.u32(ibOff + 8);
  ensure(ibCount === indexCount && primitive === 3 && indexCount % 3 === 0 && indexCount > 0, ErrorCode.INCONSISTENT_REFERENCE, 'Index count mismatch', {off});
  if (triangles * 3 !== indexCount) ctx.warnings.push({code: 'GEOMETRY_TRIANGLE_COUNT', at: off, triangles, indices: indexCount});
  const indices = v.ptrAny(ibOff + 0x10, indexCount * 2);
  v.mark(indices.region, indices.off, indexCount * 2, 'IndexData');
  let boneIds = [];
  if (boneIdCount) {
    const at = v.ptr(off + 0x68, boneIdCount * 2); v.mark('system', at, boneIdCount * 2, 'GeometryBoneIds');
    boneIds = Array.from({length: boneIdCount}, (_, i) => v.u16(at + i * 2));
  }
  return {at: off, vertexBufferAt: vbOff, indexBufferAt: ibOff, vertexCount: vbCount, indexCount, triangles: indexCount / 3, stride, declaration: decl, boneIds,
    vertexData: {region: data.region, off: data.off, length: vbCount * stride},
    indexData: {region: indices.region, off: indices.off, length: indexCount * 2}};
}

function readModel(v, off, ctx) {
  v.mark('system', off, SIZES.model, 'DrawableModel');
  const count = v.u16(off + 0x10);
  ensure(count > 0 && count === v.u16(off + 0x12) && count === v.u16(off + 0x2E), ErrorCode.INCONSISTENT_REFERENCE, 'Model geometry counts disagree', {off});
  const ptrs = v.ptr(off + 8, count * 8); v.mark('system', ptrs, count * 8, 'GeometryPointers');
  const boundsCount = count > 1 ? count + 1 : 1, bounds = v.ptr(off + 0x18, boundsCount * SIZES.aabb);
  if (bounds !== null) v.mark('system', bounds, boundsCount * SIZES.aabb, 'GeometryBounds');
  const mapping = v.ptr(off + 0x20, count * 2); v.mark('system', mapping, count * 2, 'ShaderMapping');
  const binding = v.u32(off + 0x28), maskFlags = v.u16(off + 0x2C);
  const geometries = [];
  for (let i = 0; i < count; i++) {
    const g = readGeometry(v, v.ptr(ptrs + i * 8, SIZES.geometry), ctx);
    g.shaderIndex = v.u16(mapping + i * 2);
    geometries.push(g);
  }
  return {at: off, geometryPointersAt: ptrs, boundsAt: bounds, shaderMappingAt: mapping, boneIndex: (binding >>> 24) & 0xff, hasSkin: (binding >>> 8) & 0xff,
    renderMask: maskFlags & 0xff, flags: maskFlags >>> 8, geometries};
}

function readTextureRef(v, off) {
  v.mark('system', off, SIZES.texture, 'TextureRef');
  return {at: off, name: v.stringAt(off + 0x28)};
}

function readShader(v, off) {
  v.mark('system', off, SIZES.shaderFX, 'ShaderFX');
  const count = v.u8(off + 0x10), nameHash = v.u32(off + 8), fileHash = v.u32(off + 0x18);
  const params = v.ptr(off, Math.max(1, count * SIZES.shaderParam));
  const raw = []; let dataSize = 0;
  for (let i = 0; i < count; i++) {
    const p = params + i * SIZES.shaderParam, type = v.u8(p);
    raw.push({type, at: p}); if (type !== 0) dataSize += type * 16;
  }
  const hashesAt = params + count * SIZES.shaderParam + dataSize;
  v.mark('system', params, count * SIZES.shaderParam + dataSize + count * 4, 'ShaderParameters');
  const parameters = raw.map(({type, at}, i) => {
    const hash = v.u32(hashesAt + i * 4), name = hashName(hash);
    if (type === 0) {
      const tex = v.ptr(at + 8, SIZES.texture);
      return {name, hash, kind: 'texture', texture: tex === null ? null : readTextureRef(v, tex).name, textureAt: tex, at};
    }
    const data = v.ptr(at + 8, type * 16);
    const value = Array.from({length: type}, (_, k) => v.vec4(data + k * 16));
    return {name, hash, kind: type === 1 ? 'vector' : 'array', value: type === 1 ? value[0] : value, at, dataAt: data};
  });
  return {at: off, parametersAt: params, parameterBytes: count * SIZES.shaderParam + dataSize + count * 4, name: hashName(nameHash), nameHash,
    fileName: hashName(fileHash), fileHash, renderBucket: v.u8(off + 0x11), parameters,
    diffuse: parameters.find(p => p.hash === DIFFUSE && p.kind === 'texture')?.texture ?? null,
    skin: SKIN_SHADER_FILES.includes(fileHash)};
}

function readShaderGroup(v, off) {
  v.mark('system', off, SIZES.shaderGroup, 'ShaderGroup');
  const td = v.ptr(off + 8), count = v.u16(off + 0x18), ptrs = v.ptr(off + 0x10, Math.max(1, count * 8));
  v.mark('system', ptrs, count * 8, 'ShaderPointers');
  const shaders = Array.from({length: count}, (_, i) => readShader(v, v.ptr(ptrs + i * 8, SIZES.shaderFX)));
  return {at: off, shaders, embeddedTextures: td === null ? [] : readTextureDictionary(v, td)};
}

function readSkeleton(v, off) {
  v.mark('system', off, SIZES.skeleton, 'Skeleton');
  const count = v.u16(off + 0x5E), childCount = v.u16(off + 0x60);
  const bonesAt = v.ptr(off + 0x20, count * SIZES.bone);
  v.mark('system', bonesAt, count * SIZES.bone, 'Bones');
  const bones = [];
  for (let i = 0; i < count; i++) {
    const b = bonesAt + i * SIZES.bone;
    bones.push({index: v.i16(b + 0x42), name: v.stringAt(b + 0x38), tag: v.u16(b + 0x44), parent: v.i16(b + 0x32)});
  }
  for (const [field, kind] of [[0x28, 'BoneInverseBindMatrices'], [0x30, 'BoneTransforms']]) {
    const at = v.ptr(off + field, count * SIZES.matrix); if (at !== null) v.mark('system', at, count * SIZES.matrix, kind);
  }
  const parents = v.ptr(off + 0x38, count * 2); if (parents !== null) v.mark('system', parents, count * 2, 'BoneParentIndices');
  const children = v.ptr(off + 0x40, childCount * 2); if (children !== null) v.mark('system', children, childCount * 2, 'BoneChildIndices');
  const tags = v.ptr(off + 0x10), tagCap = v.u16(off + 0x18);
  if (tags !== null) {
    v.mark('system', tags, tagCap * 8, 'BoneTagBuckets');
    const seen = new Set();
    for (let i = 0; i < tagCap; i++) for (let p = v.ptr(tags + i * 8, 16); p !== null && !seen.has(p); p = v.ptr(p + 8, 16)) { seen.add(p); v.mark('system', p, 16, 'BoneTag'); }
  }
  return {at: off, count, bones};
}

function readDrawable(v, off, ctx) {
  v.mark('system', off, SIZES.drawable, 'Drawable');
  const d = {at: off, lods: {}, lodDistances: [v.f32(off + 0x70), v.f32(off + 0x74), v.f32(off + 0x78), v.f32(off + 0x7C)],
    boundingCenter: v.vec3(off + 0x20), boundingRadius: v.f32(off + 0x2C), boundingBoxMin: v.vec3(off + 0x30), boundingBoxMax: v.vec3(off + 0x40)};
  const pages = v.ptr(off + 8, 16); if (pages !== null) v.mark('system', pages, 16 + 8 * (v.u8(pages + 8) + v.u8(pages + 9)), 'PagesInfo');
  const sg = v.ptr(off + 0x10, SIZES.shaderGroup);
  ensure(sg !== null, ErrorCode.UNSUPPORTED_STRUCTURE, 'Drawable without shaders');
  d.shaderGroup = readShaderGroup(v, sg);
  const sk = v.ptr(off + 0x18, SIZES.skeleton); d.skeleton = sk === null ? null : readSkeleton(v, sk);
  const joints = v.ptr(off + 0x90, SIZES.joints);
  if (joints !== null) {
    v.mark('system', joints, SIZES.joints, 'Joints');
    for (const [field, countAt, size, kind] of [[0x10, 0x30, 0xC0, 'JointRotationLimits'], [0x18, 0x32, 0x40, 'JointTranslationLimits']]) {
      const n = v.u16(joints + countAt), at = v.ptr(joints + field, Math.max(1, n * size)); if (at !== null && n) v.mark('system', at, n * size, kind);
    }
  }
  const modelsBlock = v.ptr(off + 0xA0), blockSize = v.u16(off + 0x9A);
  if (modelsBlock !== null) v.mark('system', modelsBlock, Math.max(16, blockSize * 16), 'DrawableModelsBlock');
  LODS.forEach((lod, i) => {
    const head = v.ptr(off + 0x50 + i * 8, 16);
    if (head === null) return;
    v.mark('system', head, 16, 'ModelList');
    const {ptr, count} = listHeader(v, head);
    if (!count) return;
    v.mark('system', ptr, count * 8, 'ModelPointers');
    d.lods[lod] = Array.from({length: count}, (_, k) => readModel(v, v.ptr(ptr + k * 8, SIZES.model), ctx));
    d.lods[lod].listAt = head;
  });
  d.name = v.stringAt(off + 0xA8);
  const lights = listHeader(v, off + 0xB0);
  if (lights.ptr !== null && lights.count) v.mark('system', lights.ptr, lights.count * SIZES.light, 'LightAttributes');
  d.lightCount = lights.ptr === null ? 0 : lights.count;
  // Embedded collision bounds are not part of clothing; the full writer refuses unknown pointers anyway.
  d.hasBound = v.pointer(off + 0xC8) !== null;
  return d;
}


/** Read a decoded YDD resource. Returns {model: {drawables:[{hash, drawable}]}, view, resource}. Throws EngineError on anything inconsistent. */
export function readYddResource(res) {
  const v = new ResourceView(res);
  const ctx = {warnings: []};
  v.mark('system', 0, SIZES.dictionary, 'DrawableDictionary');
  const pages = v.ptr(8, 16); v.mark('system', pages, 16 + 8 * (v.u8(pages + 8) + v.u8(pages + 9)), 'PagesInfo');
  const hashes = listHeader(v, 0x20), list = listHeader(v, 0x30);
  ensure(hashes.count === list.count && list.count > 0 && list.ptr !== null && hashes.ptr !== null, ErrorCode.UNSUPPORTED_STRUCTURE, 'Empty or inconsistent drawable dictionary');
  v.mark('system', hashes.ptr, hashes.count * 4, 'DrawableHashes');
  v.mark('system', list.ptr, list.count * 8, 'DrawablePointers');
  const drawables = Array.from({length: list.count}, (_, i) => ({hash: v.u32(hashes.ptr + i * 4), drawable: readDrawable(v, v.ptr(list.ptr + i * 8, SIZES.drawable), ctx)}));
  const model = {version: YDD_RESOURCE_VERSION, systemFlags: res.systemFlags, graphicsFlags: res.graphicsFlags, hashesAt: hashes.ptr, drawables, warnings: ctx.warnings};
  model.stats = statsOf(model);
  return {model, view: v, resource: res};
}

export function statsOf(model) {
  return model.drawables.map(({hash, drawable: d}) => ({
    hash, name: d.name, shaders: d.shaderGroup.shaders.length, embeddedTextures: d.shaderGroup.embeddedTextures.length, bones: d.skeleton?.count ?? 0,
    lods: Object.fromEntries(LODS.filter(l => d.lods[l]).map(l => [l, {models: d.lods[l].length,
      geometries: d.lods[l].reduce((s, m) => s + m.geometries.length, 0),
      vertices: d.lods[l].reduce((s, m) => s + m.geometries.reduce((a, g) => a + g.vertexCount, 0), 0),
      triangles: d.lods[l].reduce((s, m) => s + m.geometries.reduce((a, g) => a + g.triangles, 0), 0)}])),
  }));
}

/** Read a YTD: {textures:[{name,width,height,levels,format,formatCode,data}]}. */
export function readYtdResource(res) {
  const v = new ResourceView(res);
  v.mark('system', 0, 0x40, 'TextureDictionary');
  return {textures: readTextureDictionary(v, 0), view: v};
}

/** Every geometry of one LOD, in file order, with its model index. */
export function lodGeometries(drawable, lod) {
  const out = [];
  (drawable.lods[lod] ?? []).forEach((m, mi) => m.geometries.forEach((g, gi) => out.push({model: mi, index: gi, geometry: g, shader: drawable.shaderGroup.shaders[g.shaderIndex]})));
  return out;
}
