// YFT (rage::fragType, resource version 162) reader for vehicles. Pure JS, no CodeWalker.
// Reads what the vehicle editor needs: drawable models per LOD, geometries and vertex
// layouts, skeleton (names, tags, hierarchy, transforms), shaders/materials with texture
// references, embedded textures, lights, glass and the physics LOD (groups, children, bounds).
// Every structure read is logged in view.blocks with its address so that later stages
// (coverage report, in-place patch writer) know exactly where each field lives.
// Layouts were studied from CodeWalker sources/metadata (MIT); CodeWalker is used only as an
// offline oracle in tests, never at runtime.
import {decodeYftResource} from './resource.js';
import {ResourceView} from './view.js';
import {shaderName, shaderFileName, parameterName, BOUND_TYPES, VERTEX_SEMANTICS, COMPONENT_SIZES, COMPONENT_NAMES} from './names.js';
import {ErrorCode, ensure} from '../animation-engine/errors.js';

export const SIZES = Object.freeze({
  fragType: 0x130, fragDrawable: 0x150, shaderGroup: 0x40, shaderFX: 0x30, shaderParam: 16, texture: 0x50, embeddedTexture: 0x90,
  textureDictionary: 0x40, skeleton: 0x70, bone: 0x50, matrix: 64, model: 0x30, geometry: 0x98, vertexBuffer: 0x80,
  vertexDeclaration: 16, indexBuffer: 0x60, aabb: 32, physicsLodGroup: 0x30, physicsLod: 0x130, physGroup: 0xB0, physChild: 0x100,
  light: 0xA8, boundBase: 0x70, boundComposite: 0xB0, joints: 0x40,
});
export const MAX_BONES = 128; // game limit for vehicle skeletons (more than this breaks the vehicle in game)
const LODS = ['high', 'med', 'low', 'vlow'];

function listHeader(v, at) {
  // ResourcePointerList64 / ResourceSimpleList64: pointer, count u16, capacity u16, pad u32.
  return {ptr: v.ptr(at), count: v.u16(at + 8), capacity: v.u16(at + 10)};
}

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
    components.push({semantic: VERTEX_SEMANTICS[i], type: COMPONENT_NAMES[type], typeCode: type, offset, size}); offset += size;
  }
  ensure(offset === stride, ErrorCode.INCONSISTENT_REFERENCE, 'Vertex declaration stride mismatch', {stride, computed: offset});
  ensure(components.length === count, ErrorCode.INCONSISTENT_REFERENCE, 'Vertex declaration count mismatch');
  return {flags, stride, types: (BigInt(hi) << 32n | BigInt(lo)).toString(16).toUpperCase().padStart(16, '0'), components};
}

function readGeometry(v, off, ctx) {
  v.mark('system', off, SIZES.geometry, 'DrawableGeometry');
  const vbOff = v.ptr(off + 0x18, SIZES.vertexBuffer), ibOff = v.ptr(off + 0x38, SIZES.indexBuffer);
  ensure(vbOff !== null && ibOff !== null, ErrorCode.INCONSISTENT_REFERENCE, 'Geometry without buffers', {off});
  const indexCount = v.u32(off + 0x58), triangles = v.u32(off + 0x5C), vertexCount = v.u16(off + 0x60), primitive = v.u16(off + 0x62);
  const stride = v.u16(off + 0x70), boneIdCount = v.u16(off + 0x72);
  v.mark('system', vbOff, SIZES.vertexBuffer, 'VertexBuffer');
  const vbStride = v.u16(vbOff + 8), vbCount = v.u32(vbOff + 0x18);
  const decl = readVertexDeclaration(v, v.ptr(vbOff + 0x30, SIZES.vertexDeclaration));
  ensure(vbStride === stride && decl.stride === stride, ErrorCode.INCONSISTENT_REFERENCE, 'Vertex stride mismatch', {off});
  // The u16 field in the geometry wraps above 65535 vertices; the vertex buffer holds the real count
  // (the game and CodeWalker use it). Some protected/obfuscated mods zero the geometry field.
  if ((vbCount & 0xffff) !== vertexCount) ctx.warnings.push({code: 'GEOMETRY_VERTEX_COUNT', at: off, geometry: vertexCount, buffer: vbCount});
  const data = v.ptrAny(vbOff + 0x10, vbCount * stride);
  const data2 = v.pointer(vbOff + 0x20), dataG = v.pointer(off + 0x78);
  ensure(data && (!dataG || (dataG.region === data.region && dataG.off === data.off)), ErrorCode.INCONSISTENT_REFERENCE, 'Vertex data pointer mismatch', {off});
  v.mark(data.region, data.off, vbCount * stride, 'VertexData');
  v.mark('system', ibOff, SIZES.indexBuffer, 'IndexBuffer');
  const ibCount = v.u32(ibOff + 8);
  ensure(ibCount === indexCount && primitive === 3 && indexCount % 3 === 0, ErrorCode.INCONSISTENT_REFERENCE, 'Index count mismatch', {off});
  if (triangles * 3 !== indexCount) ctx.warnings.push({code: 'GEOMETRY_TRIANGLE_COUNT', at: off, triangles, indices: indexCount});
  const indices = v.ptrAny(ibOff + 0x10, indexCount * 2);
  v.mark(indices.region, indices.off, indexCount * 2, 'IndexData');
  let boneIds = [];
  if (boneIdCount) {
    const at = v.ptr(off + 0x68, boneIdCount * 2); v.mark('system', at, boneIdCount * 2, 'GeometryBoneIds');
    boneIds = Array.from({length: boneIdCount}, (_, i) => v.u16(at + i * 2));
  }
  ctx.triangles += indexCount / 3;
  return {at: off, vertexCount: vbCount, indexCount, triangles: indexCount / 3, storedTriangles: triangles, stride, declaration: decl, boneIds,
    vertexData: {region: data.region, off: data.off, length: vbCount * stride},
    indexData: {region: indices.region, off: indices.off, length: indexCount * 2},
    secondVertexData: data2 ? {region: data2.region, off: data2.off} : null};
}

function readModel(v, off, ctx) {
  v.mark('system', off, SIZES.model, 'DrawableModel');
  const count = v.u16(off + 0x10);
  ensure(count === v.u16(off + 0x12) && count === v.u16(off + 0x2E), ErrorCode.INCONSISTENT_REFERENCE, 'Model geometry counts disagree', {off});
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
  return {at: off, boneIndex: (binding >>> 24) & 0xff, hasSkin: (binding >>> 8) & 0xff, skeletonBinding: binding,
    renderMask: maskFlags & 0xff, flags: maskFlags >>> 8, geometries};
}

// Pixel data size of an embedded texture: block-compressed FourCCs (4x4 blocks) or D3DFMT codes.
const BLOCK_BYTES = {DXT1: 8, ATI1: 8, BC4U: 8, DXT3: 16, DXT5: 16, ATI2: 16, BC5U: 16, 'BC7 ': 16};
const PIXEL_BYTES = {21: 4, 22: 4, 32: 4, 33: 4, 23: 2, 25: 2, 26: 2, 28: 1, 50: 1, 51: 2};
export function textureDataSize(formatCode, width, height, levels) {
  const fourcc = String.fromCharCode(formatCode & 255, (formatCode >>> 8) & 255, (formatCode >>> 16) & 255, formatCode >>> 24);
  const block = BLOCK_BYTES[fourcc], pixel = PIXEL_BYTES[formatCode];
  ensure(block || pixel, ErrorCode.UNSUPPORTED_STRUCTURE, 'Unknown texture format', {formatCode});
  let total = 0;
  for (let i = 0; i < Math.max(1, levels); i++) {
    const w = Math.max(1, width >> i), h = Math.max(1, height >> i);
    total += block ? Math.ceil(w / 4) * Math.ceil(h / 4) * block : w * h * pixel;
  }
  return total;
}

function readTextureRef(v, off, embedded) {
  v.mark('system', off, embedded ? SIZES.embeddedTexture : SIZES.texture, embedded ? 'Texture' : 'TextureRef');
  const name = v.stringAt(off + 0x28);
  if (!embedded) return {name};
  const formatCode = v.u32(off + 0x58), width = v.u16(off + 0x50), height = v.u16(off + 0x52), levels = v.u8(off + 0x5D);
  const size = textureDataSize(formatCode, width, height, levels);
  const data = v.ptrAny(off + 0x70, size);
  if (data) v.mark(data.region, data.off, size, 'TextureData');
  return {name, width, height, levels, formatCode, format: String.fromCharCode(formatCode & 255, (formatCode >>> 8) & 255, (formatCode >>> 16) & 255, formatCode >>> 24).split(String.fromCharCode(0)).join('') || formatCode, data};
}

function readShader(v, off) {
  v.mark('system', off, SIZES.shaderFX, 'ShaderFX');
  const count = v.u8(off + 0x10), nameHash = v.u32(off + 8), fileHash = v.u32(off + 0x18);
  const params = v.ptr(off, count * SIZES.shaderParam);
  const out = [];
  let dataSize = 0;
  for (let i = 0; i < count; i++) {
    const p = params + i * SIZES.shaderParam, type = v.u8(p);
    out.push({type, at: p});
    if (type !== 0) dataSize += type * 16;
  }
  const hashesAt = params + count * SIZES.shaderParam + dataSize;
  v.mark('system', params, count * SIZES.shaderParam + dataSize + count * 4, 'ShaderParameters');
  const parameters = out.map(({type, at}, i) => {
    const hash = v.u32(hashesAt + i * 4), name = parameterName(hash);
    if (type === 0) {
      const tex = v.ptr(at + 8, SIZES.texture);
      return {name, hash, kind: 'texture', texture: tex === null ? null : readTextureRef(v, tex, false).name, at};
    }
    const data = v.ptr(at + 8, type * 16);
    const value = Array.from({length: type}, (_, k) => v.vec4(data + k * 16));
    return {name, hash, kind: type === 1 ? 'vector' : 'array', value: type === 1 ? value[0] : value, at, dataAt: data};
  });
  return {at: off, name: shaderName(nameHash), nameHash, fileName: shaderFileName(fileHash), fileHash, renderBucket: v.u8(off + 0x11), parameters};
}

export function readTextureDictionary(v, off) {
  v.mark('system', off, SIZES.textureDictionary, 'TextureDictionary');
  const hashes = listHeader(v, off + 0x20), list = listHeader(v, off + 0x30);
  if (hashes.ptr !== null) v.mark('system', hashes.ptr, hashes.count * 4, 'TextureNameHashes');
  if (list.ptr === null) return [];
  v.mark('system', list.ptr, list.count * 8, 'TexturePointers');
  return Array.from({length: list.count}, (_, i) => readTextureRef(v, v.ptr(list.ptr + i * 8, SIZES.embeddedTexture), true));
}

function readShaderGroup(v, off) {
  v.mark('system', off, SIZES.shaderGroup, 'ShaderGroup');
  const td = v.ptr(off + 8), count = v.u16(off + 0x18), ptrs = v.ptr(off + 0x10, count * 8);
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
    bones.push({at: b, index: v.i16(b + 0x42), name: v.stringAt(b + 0x38), tag: v.u16(b + 0x44), flags: v.u16(b + 0x40),
      parent: v.i16(b + 0x32), sibling: v.i16(b + 0x30), rotation: v.vec4(b), translation: v.vec3(b + 0x10), scale: v.vec3(b + 0x20)});
  }
  bones.forEach((b, i) => {
    ensure(b.index === i, ErrorCode.INCONSISTENT_REFERENCE, 'Bone index mismatch', {bone: i});
    ensure(b.parent >= -1 && b.parent < count && b.parent !== i, ErrorCode.SKELETON_INVALID, 'Invalid bone parent', {bone: i});
  });
  const matrices = (field, kind) => { const at = v.ptr(off + field, count * SIZES.matrix); if (at !== null) v.mark('system', at, count * SIZES.matrix, kind); return at; };
  const inverted = matrices(0x28, 'BoneInverseBindMatrices'), transforms = matrices(0x30, 'BoneTransforms');
  const parentsAt = v.ptr(off + 0x38, count * 2);
  if (parentsAt !== null) {
    v.mark('system', parentsAt, count * 2, 'BoneParentIndices');
    bones.forEach((b, i) => ensure(v.i16(parentsAt + i * 2) === b.parent, ErrorCode.INCONSISTENT_REFERENCE, 'Parent index table mismatch', {bone: i}));
  }
  const childAt = v.ptr(off + 0x40, childCount * 2); if (childAt !== null) v.mark('system', childAt, childCount * 2, 'BoneChildIndices');
  // Bone tag lookup: hash buckets of {tag u32, index u32, next u64}.
  const tags = v.ptr(off + 0x10), tagCap = v.u16(off + 0x18);
  if (tags !== null) {
    v.mark('system', tags, tagCap * 8, 'BoneTagBuckets');
    const seen = new Set();
    for (let i = 0; i < tagCap; i++) for (let p = v.ptr(tags + i * 8, 16); p !== null && !seen.has(p); p = v.ptr(p + 8, 16)) { seen.add(p); v.mark('system', p, 16, 'BoneTag'); }
  }
  return {at: off, bones, count, inverseBindAt: inverted, transformsAt: transforms, parentsAt, childIndicesAt: childAt, childIndexCount: childCount};
}

function readDrawable(v, off, ctx, kind) {
  if (ctx.drawables.has(off)) return ctx.drawables.get(off);
  v.mark('system', off, SIZES.fragDrawable, kind);
  const d = {at: off, name: null, lods: {}, lodDistances: [v.f32(off + 0x70), v.f32(off + 0x74), v.f32(off + 0x78), v.f32(off + 0x7C)],
    boundingCenter: v.vec3(off + 0x20), boundingRadius: v.f32(off + 0x2C), boundingBoxMin: v.vec3(off + 0x30), boundingBoxMax: v.vec3(off + 0x40)};
  ctx.drawables.set(off, d);
  const pages = v.ptr(off + 8, 16); if (pages !== null) v.mark('system', pages, 16 + 8 * (v.u8(pages + 8) + v.u8(pages + 9)), 'PagesInfo');
  const sg = v.ptr(off + 0x10, SIZES.shaderGroup);
  if (sg !== null) { if (!ctx.shaderGroups.has(sg)) ctx.shaderGroups.set(sg, readShaderGroup(v, sg)); d.shaderGroup = ctx.shaderGroups.get(sg); }
  const sk = v.ptr(off + 0x18, SIZES.skeleton);
  if (sk !== null) { if (!ctx.skeletons.has(sk)) ctx.skeletons.set(sk, readSkeleton(v, sk)); d.skeleton = ctx.skeletons.get(sk); }
  const joints = v.ptr(off + 0x90, SIZES.joints);
  if (joints !== null && !ctx.joints.has(joints)) {
    ctx.joints.add(joints); v.mark('system', joints, SIZES.joints, 'Joints');
    // Rotation limits (0xC0 each, count u16 @0x30) and translation limits (0x40 each, count u16 @0x32).
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
    if (!count) { d.lods[lod] = []; return; }
    v.mark('system', ptr, count * 8, 'ModelPointers');
    const tri = ctx.triangles; ctx.triangles = 0;
    d.lods[lod] = Array.from({length: count}, (_, k) => readModel(v, v.ptr(ptr + k * 8, SIZES.model), ctx));
    d.lods[lod].triangles = ctx.triangles; ctx.triangles = tri;
  });
  // FragDrawable tail: bound, fragment matrices, name.
  const bound = v.ptr(off + 0xF0); if (bound !== null) d.bound = readBound(v, bound, ctx);
  const fmCount = v.u16(off + 0x110), fm = v.ptr(off + 0x108, fmCount * 64); if (fm !== null) v.mark('system', fm, fmCount * 64, 'FragMatrices');
  const fiCount = v.u16(off + 0x100), fi = v.ptr(off + 0xF8, fiCount * 8); if (fi !== null) v.mark('system', fi, fiCount * 8, 'FragMatrixIndices');
  d.name = v.stringAt(off + 0x130);
  // Some exporters store a second pointer into the name string here (e.g. its "skel" suffix).
  const alias = v.ptr(off + 0xA8); if (alias !== null) v.cstring(alias);
  return d;
}

function readBound(v, off, ctx) {
  if (ctx.bounds.has(off)) return ctx.bounds.get(off);
  const typeCode = v.u8(off + 0x10), type = BOUND_TYPES[typeCode] ?? `type${typeCode}`;
  const b = {at: off, type, boxMin: v.vec3(off + 0x30), boxMax: v.vec3(off + 0x20)};
  ctx.bounds.set(off, b);
  if (type === 'composite') {
    v.mark('system', off, SIZES.boundComposite, 'BoundComposite');
    const count = v.u16(off + 0xA0), children = v.ptr(off + 0x70, count * 8);
    v.mark('system', children, count * 8, 'BoundChildPointers');
    for (const [field, size, kind] of [[0x78, 64, 'BoundChildTransforms1'], [0x80, 64, 'BoundChildTransforms2'], [0x88, 32, 'BoundChildBoxes'], [0x90, 8, 'BoundChildFlags1'], [0x98, 8, 'BoundChildFlags2']]) {
      const at = v.ptr(off + field, count * size); if (at !== null) v.mark('system', at, count * size, kind);
    }
    b.children = Array.from({length: count}, (_, i) => { const c = v.ptr(children + i * 8); return c === null ? null : readBound(v, c, ctx); });
    const bvh = v.ptr(off + 0xA8); if (bvh !== null) b.bvh = readBvh(v, bvh);
  } else if (type === 'geometry' || type === 'bvh') {
    readBoundGeometry(v, off, b, type);
  } else {
    // Primitive bounds: sphere/box are the base header; disc/capsule/cylinder add 16 bytes.
    v.mark('system', off, ['disc', 'capsule', 'cylinder'].includes(type) ? SIZES.boundBase + 16 : SIZES.boundBase, `Bound:${type}`);
  }
  return b;
}

// rage::phBoundGeometry (0x130) and phBoundBVH (0x150 = geometry + BVH pointer).
function readBoundGeometry(v, off, b, type) {
  v.mark('system', off, type === 'bvh' ? 0x150 : 0x130, `Bound:${type}`);
  const vertices = v.u32(off + 0xD0), polygons = v.u32(off + 0xD4), shrunk = v.u32(off + 0x84);
  const materials = v.u8(off + 0x120), colours = v.u8(off + 0x121);
  const arr = (field, size, kind) => { const at = v.ptr(off + field, Math.max(1, size)); if (at !== null && size > 0) v.mark('system', at, size, kind); return at; };
  arr(0xB0, vertices * 6, 'BoundVertices');            // int16 x3, scaled by Quantum around CenterGeom
  arr(0x78, shrunk * 6, 'BoundVerticesShrunk');
  arr(0xB8, vertices * 4, 'BoundVertexColours');
  arr(0x88, polygons * 16, 'BoundPolygons');
  arr(0xF0, materials * 8, 'BoundMaterials');
  arr(0xF8, colours * 4, 'BoundMaterialColours');
  arr(0x118, polygons, 'BoundPolygonMaterials');
  // Octants: 8 counts (u32) + 8 pointers to u32 polygon lists.
  const counts = v.ptr(off + 0xC0, 32), items = v.ptr(off + 0xC8, 64);
  if (counts !== null) {
    v.mark('system', counts, 32, 'BoundOctantCounts');
    if (items !== null) {
      v.mark('system', items, 64, 'BoundOctantPointers');
      for (let i = 0; i < 8; i++) { const n = v.u32(counts + i * 4), at = v.ptr(items + i * 8, Math.max(1, n * 4)); if (at !== null && n) v.mark('system', at, n * 4, 'BoundOctantItems'); }
    }
  }
  Object.assign(b, {vertices, polygons, materials, quantum: v.vec3(off + 0x90), center: v.vec3(off + 0xA0)});
  if (type === 'bvh') { const bvh = v.ptr(off + 0x130); if (bvh !== null) b.bvh = readBvh(v, bvh); }
}

// rage::phOptimizedBvh: header 0x80, nodes and subtree headers of 16 bytes each.
function readBvh(v, off) {
  v.mark('system', off, 0x80, 'BVH');
  // Node list: used count at +8, allocated capacity at +0xC (the allocation is capacity * 16 bytes).
  const nodes = v.u32(off + 8), capacity = v.u32(off + 0xC), trees = v.u16(off + 0x78);
  ensure(nodes <= capacity, ErrorCode.INCONSISTENT_REFERENCE, 'BVH node count above capacity', {off});
  const n = v.ptr(off, Math.max(1, capacity * 16)); if (n !== null && capacity) v.mark('system', n, capacity * 16, 'BVHNodes');
  const t = v.ptr(off + 0x70, Math.max(1, trees * 16)); if (t !== null && trees) v.mark('system', t, trees * 16, 'BVHTrees');
  return {nodes, capacity, trees};
}

function readPhysicsLod(v, off, ctx) {
  v.mark('system', off, SIZES.physicsLod, 'FragPhysicsLOD');
  const groupCount = v.u8(off + 0x11A), childCount = v.u8(off + 0x11D);
  const groupPtrs = v.ptr(off + 0xC8, groupCount * 8), childPtrs = v.ptr(off + 0xD0, childCount * 8);
  if (groupPtrs !== null) v.mark('system', groupPtrs, groupCount * 8, 'PhysGroupPointers');
  if (childPtrs !== null) v.mark('system', childPtrs, childCount * 8, 'PhysChildPointers');
  // Group names live in a separate block of pointers to 40-char structs (CodeWalker saves may point them inside the groups).
  const namePtrs = v.ptr(off + 0xC0, groupCount * 8);
  if (namePtrs !== null) v.mark('system', namePtrs, groupCount * 8, 'PhysGroupNamePointers');
  const groups = Array.from({length: groupCount}, (_, i) => {
    const g = v.ptr(groupPtrs + i * 8, SIZES.physGroup); v.mark('system', g, SIZES.physGroup, 'PhysGroup');
    const nameAt = namePtrs === null ? null : v.ptr(namePtrs + i * 8, 40);
    if (nameAt !== null) v.mark('system', nameAt, 40, 'PhysGroupName');
    return {at: g, nameAt, name: nameAt === null ? null : v.fixedString(nameAt, 40), parent: v.u8(g + 0x4D), childIndex: v.u8(g + 0x4E), childCount: v.u8(g + 0x4F),
      childGroupIndex: v.u8(g + 0x4C), childGroupCount: v.u8(g + 0x50), glassWindowIndex: v.u8(g + 0x52), mass: v.f32(g + 0x44), strength: v.f32(g + 0x10)};
  });
  const children = Array.from({length: childCount}, (_, i) => {
    const c = v.ptr(childPtrs + i * 8, SIZES.physChild); v.mark('system', c, SIZES.physChild, 'PhysChild');
    const d1 = v.ptr(c + 0xA0), d2 = v.ptr(c + 0xA8), evt = v.ptr(c + 0xB0, 0x30);
    // Event set: CodeWalker reads 0x30 bytes; real files hold more after it (kept as tail bytes by the full writer).
    if (evt !== null) v.mark('system', evt, 0x30, 'FragPhysEvtSet');
    return {at: c, group: v.u16(c + 0x10), boneTag: v.u16(c + 0x12), pristineMass: v.f32(c + 8), damagedMass: v.f32(c + 0xC),
      drawable: d1 === null ? null : readDrawable(v, d1, ctx, 'ChildDrawable'), damagedDrawable: d2 === null ? null : readDrawable(v, d2, ctx, 'ChildDamagedDrawable')};
  });
  const bound = v.ptr(off + 0xE8);
  // Per-child arrays, transforms, extra data and archetypes.
  const perChild = (field, size, kind) => { const at = v.ptr(off + field, Math.max(1, childCount * size)); if (at !== null && childCount) v.mark('system', at, childCount * size, kind); };
  perChild(0x28, 4, 'PhysChildFloats'); perChild(0xF0, 16, 'PhysChildInertia'); perChild(0xF8, 16, 'PhysChildVectors');
  const tr = v.ptr(off + 0x100, 0x20);
  if (tr !== null) { const n = v.u32(tr + 0x10); v.mark('system', tr, 0x20 + n * 64, 'FragPhysTransforms'); }
  for (const [field, countAt, kind] of [[0x108, 0x118, 'PhysUnknownData1'], [0x110, 0x119, 'PhysUnknownData2']]) {
    const n = v.u8(off + countAt), at = v.ptr(off + field, Math.max(1, n)); if (at !== null && n) v.mark('system', at, n, kind);
  }
  const archetypes = [0xD8, 0xE0].map(field => {
    const a = v.ptr(off + field, 0xE0); if (a === null) return null;
    v.mark('system', a, 0xE0, 'FragPhysArchetype');
    const ab = v.ptr(a + 0x20);
    return {at: a, name: v.stringAt(a + 0x18), bound: ab === null ? null : readBound(v, ab, ctx)};
  });
  const body = v.ptr(off + 0x20); if (body !== null) v.mark('system', body, 0xB0, 'FragPhysArticulatedBodyType');
  return {at: off, groups, children, archetypes, articulated: body !== null, rootGroupCount: v.u8(off + 0x11B), bound: bound === null ? null : readBound(v, bound, ctx)};
}

/**
 * Read a vehicle YFT. Returns a plain model plus `view` (decoded pages and block log).
 * Throws EngineError on anything inconsistent; never guesses.
 */
export function readYft(input, {limits} = {}) {
  return readYftResource(decodeYftResource(input, limits));
}

/** Same as readYft for an already decoded resource ({system, graphics, systemFlags, graphicsFlags, systemPages, graphicsPages}); used by the browser, which inflates asynchronously. */
export function readYftResource(res) {
  const v = new ResourceView(res);
  const ctx = {drawables: new Map(), shaderGroups: new Map(), skeletons: new Map(), bounds: new Map(), joints: new Set(), triangles: 0, warnings: []};
  v.mark('system', 0, SIZES.fragType, 'FragType');
  const pages = v.ptr(8, 16); v.mark('system', pages, 16 + 8 * (v.u8(pages + 8) + v.u8(pages + 9)), 'PagesInfo');
  // Page info is runtime bookkeeping; some exporters leave stale counts. Report, do not refuse.
  if (v.u8(pages + 8) !== res.systemPages || v.u8(pages + 9) !== res.graphicsPages)
    ctx.warnings.push({code: 'PAGE_INFO_COUNTS', file: [v.u8(pages + 8), v.u8(pages + 9)], actual: [res.systemPages, res.graphicsPages]});
  const name = v.stringAt(0x58);
  const main = v.ptr(0x30, SIZES.fragDrawable);
  ensure(main !== null, ErrorCode.UNSUPPORTED_STRUCTURE, 'Fragment without drawable');
  const drawable = readDrawable(v, main, ctx, 'FragDrawable');
  // Extra drawables (e.g. damaged parts) with their names.
  const arrCount = v.u32(0x48), arr = v.ptr(0x38, arrCount * 8), arrNames = v.ptr(0x40, arrCount * 8);
  if (arr !== null) v.mark('system', arr, arrCount * 8, 'DrawableArrayPointers');
  if (arrNames !== null) v.mark('system', arrNames, arrCount * 8, 'DrawableArrayNamePointers');
  const drawableArray = Array.from({length: arr === null ? 0 : arrCount}, (_, i) => ({
    name: arrNames === null ? null : v.stringAt(arrNames + i * 8), drawable: readDrawable(v, v.ptr(arr + i * 8, SIZES.fragDrawable), ctx, 'ArrayDrawable')}));
  const cloths = listHeader(v, 0x60);
  const cloth = v.ptr(0xF8); if (cloth !== null) readDrawable(v, cloth, ctx, 'ClothDrawable');
  const glassCount = v.u8(0xD9), glass = v.ptr(0xE0, glassCount * 8);
  if (glass !== null) v.mark('system', glass, glassCount * 8, 'GlassWindowPointers');
  const vgw = v.ptr(0x120, 16);
  let vehicleGlassWindows = null;
  if (vgw !== null) { const total = v.u32(vgw + 8); v.mark('system', vgw, total, 'VehicleGlassWindows'); vehicleGlassWindows = {at: vgw, count: v.u16(vgw + 6), bytes: total}; }
  const la = listHeader(v, 0x110);
  if (la.ptr !== null) v.mark('system', la.ptr, la.count * SIZES.light, 'LightAttributes');
  const lights = Array.from({length: la.ptr === null ? 0 : la.count}, (_, i) => {
    const l = la.ptr + i * SIZES.light;
    return {at: l, position: v.vec3(l + 8), color: [v.u8(l + 0x18), v.u8(l + 0x19), v.u8(l + 0x1A)], flashiness: v.u8(l + 0x1B), intensity: v.f32(l + 0x1C),
      flags: v.u32(l + 0x20), boneId: v.u16(l + 0x24), type: v.u8(l + 0x26)};
  });
  const bt = v.ptr(0xA8, 0x20); if (bt !== null) v.mark('system', bt, 0x20 + v.u8(bt + 0x10) * 48, 'FragBoneTransforms');
  const lodGroup = v.ptr(0xF0, SIZES.physicsLodGroup);
  let physics = null;
  if (lodGroup !== null) {
    v.mark('system', lodGroup, SIZES.physicsLodGroup, 'FragPhysicsLODGroup');
    physics = [0x10, 0x18, 0x20].map(f => v.ptr(lodGroup + f, SIZES.physicsLod)).map(p => p === null ? null : readPhysicsLod(v, p, ctx));
  }
  const skeleton = drawable.skeleton ?? null;
  const model = {
    version: 162, name, systemFlags: res.systemFlags, graphicsFlags: res.graphicsFlags,
    boundingSphere: {center: v.vec3(0x20), radius: v.f32(0x2C)},
    gravityFactor: v.f32(0xD0), buoyancyFactor: v.f32(0xD4),
    drawable, drawableArray, clothCount: cloths.count, hasClothDrawable: cloth !== null,
    glassWindowCount: glassCount, vehicleGlassWindows, lights, physics, skeleton, warnings: ctx.warnings,
  };
  model.stats = statsOf(model);
  return {model, view: v, resource: res};
}

export function statsOf(model) {
  const lods = {};
  for (const lod of LODS) {
    const ms = model.drawable.lods[lod];
    if (!ms) continue;
    lods[lod] = {models: ms.length, geometries: ms.reduce((s, m) => s + m.geometries.length, 0), triangles: ms.triangles,
      vertices: ms.reduce((s, m) => s + m.geometries.reduce((a, g) => a + g.vertexCount, 0), 0)};
  }
  const bones = model.skeleton?.count ?? 0;
  const seatBones = (model.skeleton?.bones ?? []).filter(b => /^seat_/i.test(b.name)).map(b => b.name);
  const textures = new Set();
  for (const s of model.drawable.shaderGroup?.shaders ?? []) for (const p of s.parameters) if (p.kind === 'texture' && p.texture) textures.add(p.texture);
  return {bones, boneLimit: MAX_BONES, bonesOverLimit: bones > MAX_BONES, lods, shaders: model.drawable.shaderGroup?.shaders.length ?? 0,
    embeddedTextures: model.drawable.shaderGroup?.embeddedTextures.length ?? 0, referencedTextures: [...textures].sort(), seatBones,
    physicsGroups: model.physics?.[0]?.groups.length ?? 0, physicsChildren: model.physics?.[0]?.children.length ?? 0, lights: model.lights.length};
}

/** Positions of one geometry as Float32Array (x,y,z per vertex). Only float3 positions are supported. */
export function geometryPositions(view, geometry) {
  const c = geometry.declaration.components.find(x => x.semantic === 'position');
  ensure(c && c.type === 'float3', ErrorCode.UNSUPPORTED_STRUCTURE, 'Positions are not float3');
  const {region, off} = geometry.vertexData, dv = view.dv(region), out = new Float32Array(geometry.vertexCount * 3);
  for (let i = 0; i < geometry.vertexCount; i++) {
    const at = off + i * geometry.stride + c.offset;
    out[i * 3] = dv.getFloat32(at, true); out[i * 3 + 1] = dv.getFloat32(at + 4, true); out[i * 3 + 2] = dv.getFloat32(at + 8, true);
  }
  return out;
}
export function geometryIndices(view, geometry) {
  const {region, off} = geometry.indexData, dv = view.dv(region), out = new Uint16Array(geometry.indexCount);
  for (let i = 0; i < out.length; i++) out[i] = dv.getUint16(off + i * 2, true);
  return out;
}
