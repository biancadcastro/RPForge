'use strict';
// RPForge texture engine — YFT fragment reader (GTA V Legacy, resource version 162).
// Read-only: extracts which textures each material uses, the UV triangles of the
// high-detail model (UV0 and UV1) and any textures embedded in the fragment.
//
// Offsets (system region):
//   FragType   0x30 drawable ptr
//   Drawable   0x10 shader group, 0x50 high-LOD model list {ptr,count,capacity}
//   ShaderGroup 0x08 embedded texture dictionary, 0x10 shader ptr list, 0x18 count
//   Shader     0x00 parameters ptr, 0x08 name hash, 0x10 parameter count, 0x18 file name hash
//   Parameters 16 bytes each {u8 type, ... , 0x08 data ptr}; then inline data; then u32 name hashes
//   Model      0x08 geometry ptr list, 0x10 count, 0x20 shader mapping (u16 per geometry)
//   Geometry   0x18 vertex buffer, 0x38 index buffer
//   VertexBuffer 0x08 stride, 0x10 data ptr, 0x18 vertex count, 0x30 declaration
//   Declaration 0x00 component flags, 0x04 stride, 0x08 component types (4 bits each)
//   IndexBuffer 0x08 index count, 0x10 data ptr (u16)
const { EngineError, ensure, u16, u32, view, pointerAt, cstring, joaat } = require('./binary');
const rsc7 = require('./rsc7');
const bc = require('./bc');

const VERSION = 162;
// Size in bytes of each vertex component type.
const TYPE_SIZE = [0, 4, 4, 8, 0, 8, 12, 16, 4, 4, 4, 2, 2, 2, 2, 2];
const UV_COMPONENT = [6, 7];

const SAMPLER_NAMES = ['DiffuseSampler', 'DiffuseSampler2', 'DiffuseSampler3', 'BumpSampler', 'BumpSampler2', 'SpecSampler', 'SpecSampler2',
  'DetailSampler', 'DirtSampler', 'DirtBumpSampler', 'PlateBgSampler', 'PlateBgBumpSampler', 'FontSampler', 'FontNormalSampler',
  'EnvironmentSampler', 'DamageSampler', 'DamageTextureSampler', 'TintPaletteSampler', 'NoiseSampler', 'HeightSampler', 'DiffuseExtraSampler',
  'TextureSamp', 'DiffuseSamplerPoint', 'SnowSampler', 'DiffuseHfSampler', 'distanceMapSampler', 'AnisoNoiseSpecSampler', 'MaskSampler'];
const SAMPLERS = new Map(SAMPLER_NAMES.map(n => [joaat(n), n]));
const SHADER_NAMES = ['vehicle_paint1', 'vehicle_paint1_enveff', 'vehicle_paint2', 'vehicle_paint2_enveff', 'vehicle_paint3', 'vehicle_paint3_enveff', 'vehicle_paint3_lvr',
  'vehicle_paint4', 'vehicle_paint4_emissive', 'vehicle_paint4_enveff', 'vehicle_paint5_enveff', 'vehicle_paint6', 'vehicle_paint6_enveff', 'vehicle_paint7',
  'vehicle_paint7_enveff', 'vehicle_paint8', 'vehicle_paint9', 'vehicle_mesh', 'vehicle_mesh_enveff', 'vehicle_mesh2_enveff', 'vehicle_badges', 'vehicle_decal',
  'vehicle_decal2', 'vehicle_tire', 'vehicle_tire_emissive', 'vehicle_lightsemissive', 'vehicle_lights', 'vehicle_vehglass', 'vehicle_vehglass_inner',
  'vehicle_interior', 'vehicle_interior2', 'vehicle_shuts', 'vehicle_dash_emissive', 'vehicle_dash_emissive_opaque', 'vehicle_blurredrotor',
  'vehicle_blurredrotor_emissive', 'vehicle_cloth', 'vehicle_cloth2', 'vehicle_detail', 'vehicle_detail2', 'vehicle_licenseplate', 'vehicle_track',
  'vehicle_track_ammo', 'vehicle_track_emissive', 'vehicle_track2', 'vehicle_track2_emissive', 'vehicle_emissive_alpha', 'vehicle_emissive_opaque',
  'vehicle_generic', 'vehicle_basic', 'default', 'emissive', 'normal', 'normal_spec', 'spec', 'cutout', 'decal', 'glass', 'normal_spec_decal'];
const SHADERS = new Map(SHADER_NAMES.flatMap(n => [[joaat(n), n], [joaat(n + '.sps'), n]]));

const samplerName = h => SAMPLERS.get(h) || `0x${h.toString(16).padStart(8, '0')}`;
const shaderName = (h, file) => SHADERS.get(h) || SHADERS.get(file) || `0x${h.toString(16).padStart(8, '0')}`;

function list(sys, at) {
  const p = pointerAt(sys, at), count = u16(sys, at + 8);
  if (!p || !count) return [];
  const out = [];
  for (let i = 0; i < count; i++) { const q = pointerAt(sys, p.offset + i * 8); if (q) out.push(q.offset); }
  return out;
}

function readShaders(sys, sg) {
  const shaders = [];
  for (const s of list(sys, sg + 0x10)) {
    const params = pointerAt(sys, s), count = sys[s + 0x10];
    const nameHash = u32(sys, s + 0x08), fileHash = u32(sys, s + 0x18);
    const textures = [];
    if (params && count) {
      let dataSize = 0;
      for (let i = 0; i < count; i++) dataSize += 16 * sys[params.offset + i * 16];
      const hashesAt = params.offset + 16 * count + dataSize;
      for (let i = 0; i < count; i++) {
        const p = params.offset + i * 16;
        if (sys[p] !== 0) continue; // only texture parameters
        const tp = pointerAt(sys, p + 8);
        if (!tp || tp.region !== 'system') continue;
        const np = pointerAt(sys, tp.offset + 0x28);
        if (!np) continue;
        let name; try { name = cstring(sys, np.offset); } catch { continue; }
        if (!name) continue;
        textures.push({ name, sampler: samplerName(u32(sys, hashesAt + i * 4)) });
      }
    }
    shaders.push({ name: shaderName(nameHash, fileHash), textures });
  }
  return shaders;
}

function readEmbedded(sys, gfx, sg) {
  const td = pointerAt(sys, sg + 0x08);
  if (!td) return [];
  const out = [];
  for (const at of list(sys, td.offset + 0x30)) {
    try {
      const np = pointerAt(sys, at + 0x28), name = cstring(sys, np.offset);
      const width = u16(sys, at + 0x50), height = u16(sys, at + 0x52), levels = sys[at + 0x5d];
      const format = bc.formatName(u32(sys, at + 0x58));
      const dp = pointerAt(sys, at + 0x70), region = dp.region === 'graphics' ? gfx : sys;
      const size = bc.dataSize(format, width, height, levels);
      ensure(dp.offset + size <= region.length, 'Pixels fora do recurso.');
      out.push({ name, width, height, format, levels, data: region.slice(dp.offset, dp.offset + size), location: { region: dp.region, offset: dp.offset, size } });
    } catch { /* unsupported embedded texture: listed as missing pixels */ }
  }
  return out;
}

// Decodes one vertex component as up to 3 floats (positions, normals) or 2 (UVs).
function readComponent(dv, at, type, out, o, n) {
  switch (type) {
    case 6: case 7: for (let k = 0; k < n; k++) out[o + k] = dv.getFloat32(at + k * 4, true); return true; // Float3/Float4
    case 5: for (let k = 0; k < Math.min(n, 2); k++) out[o + k] = dv.getFloat32(at + k * 4, true); return true; // Float2
    case 3: case 1: for (let k = 0; k < Math.min(n, type === 1 ? 2 : 4); k++) out[o + k] = half(dv.getUint16(at + k * 2, true)); return true; // Half4/Half2
    case 10: { // Dec3N: 10:10:10:2 signed normalized
      const v = dv.getUint32(at, true);
      for (let k = 0; k < Math.min(n, 3); k++) { let c = (v >>> (k * 10)) & 1023; if (c & 512) c -= 1024; out[o + k] = Math.max(-1, c / 511); }
      return true;
    }
    case 8: case 9: for (let k = 0; k < Math.min(n, 3); k++) out[o + k] = dv.getUint8(at + k) / 127.5 - 1; return true; // UByte4/Colour
    default: return false;
  }
}

// Reads positions, normals, UV0/UV1 and indices of one geometry (null when the layout is unknown).
function readGeometry(sys, gfx, geometry) {
  const vbp = pointerAt(sys, geometry + 0x18), ibp = pointerAt(sys, geometry + 0x38);
  if (!vbp || !ibp) return null;
  const vb = vbp.offset, ib = ibp.offset;
  const stride = u16(sys, vb + 0x08), count = u32(sys, vb + 0x18);
  const dataPtr = pointerAt(sys, vb + 0x10), declPtr = pointerAt(sys, vb + 0x30);
  if (!dataPtr || !declPtr || !stride || !count) return null;
  const decl = declPtr.offset, flags = u32(sys, decl), declStride = u16(sys, decl + 4);
  const typesLo = u32(sys, decl + 8), typesHi = u32(sys, decl + 12);
  const typeOf = i => (i < 8 ? typesLo >>> (i * 4) : typesHi >>> ((i - 8) * 4)) & 15;
  const offsets = new Array(16).fill(-1);
  let o = 0;
  for (let i = 0; i < 16; i++) if (flags & (1 << i)) { offsets[i] = o; o += TYPE_SIZE[typeOf(i)]; }
  if (o !== stride || declStride !== stride) return null; // unknown layout: skip safely
  const region = dataPtr.region === 'graphics' ? gfx : sys;
  if (dataPtr.offset + stride * count > region.length) return null;
  const dv = view(region), base = dataPtr.offset;
  const read = (comp, n) => {
    if (offsets[comp] < 0) return null;
    const type = typeOf(comp), out = new Float32Array(count * n);
    for (let v = 0; v < count; v++) if (!readComponent(dv, base + v * stride + offsets[comp], type, out, v * n, n)) return null;
    return out;
  };
  const channels = UV_COMPONENT.map(c => (offsets[c] >= 0 && [1, 5].includes(typeOf(c)) ? read(c, 2) : null));
  const positions = read(0, 3), normals = read(3, 3);
  const indexCount = u32(sys, ib + 0x08), ip = pointerAt(sys, ib + 0x10);
  if (!ip || indexCount < 3) return null;
  const iregion = ip.region === 'graphics' ? gfx : sys;
  if (ip.offset + indexCount * 2 > iregion.length) return null;
  const indices = new Uint16Array(indexCount - (indexCount % 3));
  for (let i = 0; i < indices.length; i++) indices[i] = u16(iregion, ip.offset + i * 2);
  for (let i = 0; i < indices.length; i++) if (indices[i] >= count) return null;
  return { channels, indices, positions, normals, count };
}
const readUvs = readGeometry;

function half(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

// Reads one drawable (shader group + high-detail models) into the shared usage map.
function readDrawable(sys, gfx, d, label, out, place = {}) {
  const sgp = pointerAt(sys, d + 0x10);
  const shaders = sgp ? readShaders(sys, sgp.offset) : place.shaders;
  if (!shaders) return null;
  if (sgp) { out.shaders += shaders.length; out.embedded.push(...readEmbedded(sys, gfx, sgp.offset)); }
  const record = place.usage !== false;
  const high = pointerAt(sys, d + 0x50);
  if (!high) return;
  let gi = 0;
  for (const model of list(sys, high.offset)) {
    const geos = list(sys, model + 0x08), map = pointerAt(sys, model + 0x20);
    geos.forEach((g, i) => {
      gi++; out.geometries++;
      const shader = shaders[map ? u16(sys, map.offset + i * 2) : 0];
      if (!shader || !shader.textures.length) return;
      const data = readGeometry(sys, gfx, g);
      if (!data) { out.skipped++; return; }
      if (data.positions && place.matrix) { data.positions = transformPoints(data.positions, place.matrix); if (data.normals) data.normals = transformNormals(data.normals, place.matrix); }
      if (data.positions) {
        const pick = re => { const t = shader.textures.find(x => re.test(x.sampler)); return t ? t.name : null; };
        out.meshes.push({
          id: `${label}:${gi}`, shader: shader.name, positions: data.positions, normals: data.normals, uv: data.channels, indices: data.indices,
          diffuse: pick(/^DiffuseSampler$/i) || pick(/^(TextureSamp|DiffuseSamplerPoint|DiffuseHfSampler)$/i) || (shader.textures[0] && !/bump|spec|normal|dirt/i.test(shader.textures[0].sampler) ? shader.textures[0].name : null),
          livery: pick(/^DiffuseSampler2$/i), normalMap: pick(/^BumpSampler$/i),
        });
      }
      if (record) for (const t of shader.textures) for (const ch of [0, 1]) {
        if (!data.channels[ch]) continue;
        const key = t.name.toLowerCase();
        if (!out.usage.has(key)) out.usage.set(key, { name: t.name, uses: [] });
        out.usage.get(key).uses.push({ geometry: `${label}:${gi}`, shader: shader.name, sampler: t.sampler, channel: ch, uv: data.channels[ch], indices: data.indices });
      }
    });
  }
  return shaders;
}

// ---------- skeleton and fragment children (wheels, separate parts) ----------
// Bone (0x50): 0x00 rotation quaternion xyzw, 0x10 translation xyz, 0x20 scale xyz, 0x32 parent (s16),
// 0x38 name ptr, 0x44 tag. Skeleton: 0x20 bones ptr, 0x5E bone count.
function quatMatrix(x, y, z, w, tx, ty, tz, sx, sy, sz) {
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  // column-major 4x4
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function transformPoints(p, m) {
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return out;
}
function transformNormals(n, m) {
  const out = new Float32Array(n.length);
  for (let i = 0; i < n.length; i += 3) {
    const x = n[i], y = n[i + 1], z = n[i + 2];
    let a = m[0] * x + m[4] * y + m[8] * z, b = m[1] * x + m[5] * y + m[9] * z, c = m[2] * x + m[6] * y + m[10] * z;
    const l = Math.hypot(a, b, c) || 1; out[i] = a / l; out[i + 1] = b / l; out[i + 2] = c / l;
  }
  return out;
}
function readSkeleton(sys, drawable) {
  const sp = pointerAt(sys, drawable + 0x18);
  if (!sp) return null;
  const sk = sp.offset, bp = pointerAt(sys, sk + 0x20), count = u16(sys, sk + 0x5e);
  if (!bp || !count || count > 4096) return null;
  const dv = view(sys), f = o => dv.getFloat32(o, true);
  const bones = [];
  for (let i = 0; i < count; i++) {
    const b = bp.offset + i * 0x50;
    const parent = dv.getInt16(b + 0x32, true);
    let name = ''; try { const np = pointerAt(sys, b + 0x38); if (np) name = cstring(sys, np.offset); } catch {}
    const local = quatMatrix(f(b), f(b + 4), f(b + 8), f(b + 12), f(b + 16), f(b + 20), f(b + 24), f(b + 32) || 1, f(b + 36) || 1, f(b + 40) || 1);
    bones.push({ name, tag: u16(sys, b + 0x44), parent, local, world: null });
  }
  const world = i => {
    const bone = bones[i];
    if (bone.world) return bone.world;
    bone.world = bone.local; // guards cycles
    bone.world = bone.parent >= 0 && bone.parent < bones.length && bone.parent !== i ? mul(world(bone.parent), bone.local) : bone.local;
    return bone.world;
  };
  bones.forEach((_, i) => world(i));
  return { bones, byTag: new Map(bones.map(b => [b.tag, b])), byName: new Map(bones.map(b => [b.name.toLowerCase(), b])) };
}
const ROT_Z_180 = [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const WHEEL = /^wheel_(l|r)(f|r|m\d*)$/i;

// Fragment children (FragType 0xF0 → LOD group 0x10 → LOD 0xD0 children, count at 0x11D;
// child 0x12 bone tag, 0xA0 drawable). Wheels share the first wheel drawable on every wheel bone;
// right-side wheels are turned 180° like the game does.
function readChildren(sys, gfx, drawable, mainShaders, out) {
  const group = pointerAt(sys, 0xf0);
  if (!group) return;
  const lod = pointerAt(sys, group.offset + 0x10);
  if (!lod) return;
  const childrenPtr = pointerAt(sys, lod.offset + 0xd0), count = sys[lod.offset + 0x11d];
  if (!childrenPtr || !count) return;
  const skeleton = readSkeleton(sys, drawable);
  if (!skeleton) return;
  const hasGeometry = d => { const h = pointerAt(sys, d + 0x50); return !!(h && list(sys, h.offset).some(m => list(sys, m + 0x08).length)); };
  const placed = new Set();
  let wheelDrawable = null;
  for (let i = 0; i < count; i++) {
    const cp = pointerAt(sys, childrenPtr.offset + i * 8);
    if (!cp) continue;
    const dp = pointerAt(sys, cp.offset + 0xa0);
    if (!dp || !hasGeometry(dp.offset)) continue;
    const bone = skeleton.byTag.get(u16(sys, cp.offset + 0x12));
    if (!bone) continue;
    const first = !out.childDrawables.has(dp.offset);
    out.childDrawables.add(dp.offset);
    readDrawable(sys, gfx, dp.offset, `${bone.name || 'child' + i}`, out, { matrix: bone.world, shaders: mainShaders, usage: first });
    placed.add(bone.name.toLowerCase());
    if (WHEEL.test(bone.name) && !wheelDrawable) wheelDrawable = dp.offset;
  }
  if (wheelDrawable) for (const bone of skeleton.bones) {
    if (!WHEEL.test(bone.name) || placed.has(bone.name.toLowerCase())) continue;
    const right = /^wheel_r/i.test(bone.name);
    readDrawable(sys, gfx, wheelDrawable, bone.name, out, { matrix: right ? mul(bone.world, ROT_Z_180) : bone.world, shaders: mainShaders, usage: false });
  }
}

// kind -> [legacy version, enhanced versions]
const KINDS = { yft: [162, [171]], ydr: [165, [154, 159]], ydd: [165, [159]] };
const LABEL = { yft: 'YFT', ydr: 'YDR', ydd: 'YDD' };

// Parses a GTA model (.yft vehicle/fragment, .ydr prop, .ydd clothing/drawable dictionary).
// Returns { usage: Map(lowercase name -> {name, uses[]}), embedded: [], geometries, skipped, shaders, drawables }.
function readModel(bytes, kind, decoded) {
  kind = String(kind || 'yft').toLowerCase();
  ensure(KINDS[kind], `Tipo de modelo não suportado: ${kind}`);
  const [legacy, enhanced] = KINDS[kind];
  const h = rsc7.header(bytes);
  if (h.version !== legacy) {
    if (enhanced.includes(h.version)) throw new EngineError(`Este ${LABEL[kind]} é do GTA V Enhanced (gen9). Por enquanto só o Legacy é suportado.`, 'gen9');
    throw new EngineError(`Versão de ${LABEL[kind]} não suportada (${h.version}).`, 'version');
  }
  const res = decoded || rsc7.decode(bytes), sys = res.system, gfx = res.graphics;
  let drawables;
  if (kind === 'yft') { const p = pointerAt(sys, 0x30); ensure(p && p.region === 'system', 'YFT sem modelo principal.'); drawables = [p.offset]; }
  else if (kind === 'ydr') drawables = [0];
  else { drawables = list(sys, 0x30); ensure(drawables.length, 'YDD sem drawables.'); }
  const out = { usage: new Map(), meshes: [], childDrawables: new Set(), embedded: [], geometries: 0, skipped: 0, shaders: 0, drawables: drawables.length, up: 'z' };
  drawables.forEach((d, i) => {
    const shaders = readDrawable(sys, gfx, d, i, out);
    if (kind === 'yft' && i === 0) { try { readChildren(sys, gfx, d, shaders, out); } catch { /* children are optional extras */ } }
  });
  return out;
}
const readYft = bytes => readModel(bytes, 'yft');

// Writes new pixels into a texture embedded in a GTA model, in place: same size, format and
// mip count, so no structure moves. Every embedded copy with that name is updated.
async function replaceEmbedded(bytes, kind, name, rgba, width, height, onProgress = () => {}) {
  const res = rsc7.decode(bytes);
  const model = readModel(bytes, kind, res);
  const copies = model.embedded.filter(t => t.name.toLowerCase() === String(name).toLowerCase());
  ensure(copies.length, `Textura embutida não encontrada: ${name}`);
  const t = copies[0];
  ensure(width === t.width && height === t.height, 'A textura embutida precisa manter o tamanho original.');
  const parts = [];
  let cur = { rgba, w: width, h: height };
  for (let l = 0; l < t.levels; l++) {
    parts.push(bc.encode(t.format, cur.rgba, cur.w, cur.h));
    onProgress((l + 1) / t.levels);
    await new Promise(r => setTimeout(r, 0));
    if (l + 1 < t.levels) cur = bc.downsample(cur.rgba, cur.w, cur.h);
  }
  const data = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { data.set(p, o); o += p.length; }
  ensure(data.length === t.location.size, 'Tamanho de pixels diferente do original.');
  for (const c of copies) (c.location.region === 'graphics' ? res.graphics : res.system).set(data, c.location.offset);
  const out = rsc7.reencode(res);
  const check = readModel(out, kind).embedded.find(x => x.name.toLowerCase() === String(name).toLowerCase());
  ensure(check && check.width === width && check.height === height, 'A verificação do arquivo gerado falhou.');
  return { bytes: out, format: t.format, levels: t.levels, copies: copies.length };
}

module.exports = { VERSION, readYft, readModel, replaceEmbedded, samplerName, half };
