'use strict';
// RPForge texture engine — YTD texture dictionaries (GTA V Legacy, resource version 13).
//
// Layout (system region):
//   root 0x40  : file header (0x00 VFT, 0x04 =1, 0x08 pages-info ptr), 0x18 =1,
//                0x20 name-hash list {ptr,count,capacity}, 0x30 texture pointer list {ptr,count,capacity}
//   texture 0x90 (grcTexture): 0x28 name ptr, 0x50 width, 0x52 height, 0x54 depth, 0x56 stride,
//                0x58 format, 0x5D mip levels, 0x70 pixel data ptr (graphics region)
// Unknown bytes of the root and of every texture are preserved as read.
const { EngineError, ensure, u16, u32, w16, w32, pointerAt, writePointer, joaat, cstring } = require('./binary');
const rsc7 = require('./rsc7');
const bc = require('./bc');

const VERSION = 13, ROOT_SIZE = 0x40, TEXTURE_SIZE = 0x90;

function readTexture(sys, gfx, at) {
  ensure(at + TEXTURE_SIZE <= sys.length, 'Textura fora do recurso.');
  const namePtr = pointerAt(sys, at + 0x28);
  ensure(namePtr && namePtr.region === 'system', 'Textura sem nome.');
  const name = cstring(sys, namePtr.offset);
  const width = u16(sys, at + 0x50), height = u16(sys, at + 0x52), depth = u16(sys, at + 0x54);
  const code = u32(sys, at + 0x58), levels = sys[at + 0x5d];
  ensure(width > 0 && height > 0 && width <= 16384 && height <= 16384, `Dimensões inválidas em ${name}.`);
  ensure(depth === 1, `Textura volumétrica não suportada (${name}).`);
  ensure(levels >= 1 && levels <= 16, `Mipmaps inválidos em ${name}.`);
  const format = bc.formatName(code);
  const size = bc.dataSize(format, width, height, levels);
  const dataPtr = pointerAt(sys, at + 0x70);
  ensure(dataPtr, `Textura sem pixels (${name}).`);
  const region = dataPtr.region === 'graphics' ? gfx : sys;
  ensure(dataPtr.offset + size <= region.length, `Pixels fora do recurso (${name}).`);
  return {
    name, width, height, format, levels,
    struct: sys.slice(at, at + TEXTURE_SIZE),
    data: region.slice(dataPtr.offset, dataPtr.offset + size),
  };
}

// Parses a .ytd file (Uint8Array) into { root, textures[] }.
function readYtd(bytes) {
  const h = rsc7.header(bytes);
  if (h.version !== VERSION) {
    if (h.version === 5) throw new EngineError('Este YTD é do GTA V Enhanced (gen9). Por enquanto só o Legacy é suportado.', 'gen9');
    throw new EngineError(`Versão de YTD não suportada (${h.version}).`, 'version');
  }
  const res = rsc7.decode(bytes), sys = res.system, gfx = res.graphics;
  const list = pointerAt(sys, 0x30), count = u16(sys, 0x38);
  ensure(count <= 4096, 'Dicionário com texturas demais.');
  const textures = [];
  for (let i = 0; i < count; i++) {
    const p = pointerAt(sys, list.offset + i * 8);
    ensure(p && p.region === 'system', 'Ponteiro de textura inválido.');
    textures.push(readTexture(sys, gfx, p.offset));
  }
  const seen = new Set();
  for (const t of textures) { const k = joaat(t.name); ensure(!seen.has(k), `Nome de textura duplicado: ${t.name}`); seen.add(k); }
  return { root: sys.slice(0, ROOT_SIZE), textures };
}

// Lightweight listing without copying pixel data.
function listYtd(bytes) {
  return readYtd(bytes).textures.map(t => ({ name: t.name, width: t.width, height: t.height, format: t.format, levels: t.levels }));
}

function writeYtd(dict, options = {}) {
  const textures = dict.textures.slice().map(t => ({ ...t, hash: joaat(t.name) }));
  textures.sort((a, b) => a.hash - b.hash);
  for (let i = 1; i < textures.length; i++) ensure(textures[i].hash !== textures[i - 1].hash, `Nome de textura duplicado: ${textures[i].name}`);
  ensure(textures.length > 0 && textures.length <= 4096, 'Dicionário vazio ou grande demais.');
  for (const t of textures) {
    ensure(/^[\x20-\x7e]{1,255}$/.test(t.name), `Nome de textura inválido: ${t.name}`);
    ensure(t.data.length === bc.dataSize(t.format, t.width, t.height, t.levels), `Tamanho de pixels incorreto em ${t.name}.`);
  }
  // Pages-info block holds 8 bytes per page; size it from the previous attempt until stable.
  let pages = 16;
  for (let attempt = 0; attempt < 6; attempt++) {
    const b = new rsc7.ResourceBuilder(VERSION);
    const root = b.add('system', ROOT_SIZE, (s, o) => {
      s.set(dict.root, o);
      writePointer(s, o + 0x08, 'system', info.offset);
      writePointer(s, o + 0x20, 'system', hashes.offset); w16(s, o + 0x28, textures.length); w16(s, o + 0x2a, textures.length); w32(s, o + 0x2c, 0);
      writePointer(s, o + 0x30, 'system', pointers.offset); w16(s, o + 0x38, textures.length); w16(s, o + 0x3a, textures.length); w32(s, o + 0x3c, 0);
    });
    const info = b.add('system', 16 + 8 * pages, (s, o, builder) => {
      s[o + 8] = builder.systemPages; s[o + 9] = builder.graphicsPages;
    });
    const hashes = b.add('system', 4 * textures.length, (s, o) => textures.forEach((t, i) => w32(s, o + i * 4, t.hash)));
    const structs = textures.map(t => b.add('system', TEXTURE_SIZE, (s, o) => {
      s.set(t.struct, o);
      writePointer(s, o + 0x28, 'system', t.nameBlock.offset);
      w16(s, o + 0x50, t.width); w16(s, o + 0x52, t.height); w16(s, o + 0x54, 1);
      w16(s, o + 0x56, bc.strideOf(t.format, t.width));
      w32(s, o + 0x58, bc.FORMATS[t.format].code); s[o + 0x5d] = t.levels;
      writePointer(s, o + 0x70, 'graphics', t.dataBlock.offset);
    }));
    const pointers = b.add('system', 8 * textures.length, (s, o) => structs.forEach((st, i) => writePointer(s, o + i * 8, 'system', st.offset)));
    for (const t of textures) {
      const name = t.name;
      t.nameBlock = b.add('system', name.length + 1, (s, o) => { for (let i = 0; i < name.length; i++) s[o + i] = name.charCodeAt(i); s[o + name.length] = 0; });
      t.dataBlock = b.add('graphics', t.data.length, (g, o) => g.set(t.data, o));
    }
    void root;
    const out = b.build(options);
    if (b.systemPages + b.graphicsPages <= pages) return out;
    pages = b.systemPages + b.graphicsPages;
  }
  throw new EngineError('Não foi possível organizar as páginas do YTD.');
}

// Builds a full-chain texture (GTA mip convention) from RGBA8 pixels.
async function buildTexture(base, rgba, width, height, format, onProgress) {
  ensure(width % 4 === 0 && height % 4 === 0, 'Largura e altura precisam ser múltiplas de 4.');
  ensure(width <= 16384 && height <= 16384, 'Textura grande demais (máximo 16384).');
  const levels = bc.gtaLevels(width, height);
  const parts = [];
  let cur = { rgba, w: width, h: height };
  for (let l = 0; l < levels; l++) {
    parts.push(bc.encode(format, cur.rgba, cur.w, cur.h));
    if (onProgress) await onProgress((l + 1) / levels);
    if (l + 1 < levels) cur = bc.downsample(cur.rgba, cur.w, cur.h);
  }
  const data = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { data.set(p, o); o += p.length; }
  return { ...base, width, height, format, levels, data };
}

module.exports = { VERSION, readYtd, listYtd, writeYtd, buildTexture, TEXTURE_SIZE };
