'use strict';
// RPForge texture engine — public API used by the Photoshop panel (and Node tests).
// Everything runs locally on Uint8Arrays; no file system, network or native code here.
const { EngineError, ensure, tick } = require('./binary');
const ytdCodec = require('./ytd');
const yftCodec = require('./yft');
const objCodec = require('./obj');
const bc = require('./bc');
const { drawGuide, drawOverlay } = require('./uv');
const render = require('./render');
const { decodePng } = require('./png');
const { decodeImage } = require('./image');

const MIN_WORK = 2048, MAX_GUIDE = 8192;
const LIVERY_SAMPLER = /^diffusesampler2$/i;

function summarize(uses) {
  const byChannel = new Map();
  for (const u of uses) {
    if (!byChannel.has(u.channel)) byChannel.set(u.channel, { channel: u.channel, triangles: 0, geometries: new Set(), samplers: new Set(), shaders: new Set() });
    const c = byChannel.get(u.channel);
    c.triangles += u.indices.length / 3; c.geometries.add(u.geometry); c.samplers.add(u.sampler); c.shaders.add(u.shader);
  }
  return [...byChannel.values()].sort((a, b) => a.channel - b.channel)
    .map(c => ({ channel: c.channel, triangles: c.triangles, geometries: c.geometries.size, samplers: [...c.samplers], shaders: [...c.shaders] }));
}
function recommendedChannel(uvs) {
  if (!uvs.length) return null;
  const channels = uvs.map(u => u.channel);
  const livery = uvs.some(u => u.samplers.some(s => LIVERY_SAMPLER.test(s)));
  if (livery && channels.includes(1)) return 1;
  return channels.includes(0) ? 0 : channels[0];
}

class ModelSession {
  // model: { kind: 'yft'|'ydr'|'ydd', bytes } or { kind: 'obj', text, mtl: [text] } or null
  // dictionaries: [{ name, bytes }] (.ytd files); the first one is the default target for new textures.
  // parsed: the result of an earlier parse of the same model (skips reading it twice).
  constructor({ model = null, dictionaries = [], parsed = null } = {}) {
    ensure(model || dictionaries.length, 'Abra um modelo ou um YTD.');
    this.kind = model ? model.kind : 'ytd';
    this.dicts = dictionaries.map(d => ({ name: d.name, dict: ytdCodec.readYtd(d.bytes) }));
    this.dict = this.dicts.length ? this.dicts[0].dict : null; // compatibility
    this.entries = new Map();
    const add = (name, patch) => {
      const key = name.toLowerCase();
      if (!this.entries.has(key)) this.entries.set(key, { name, texture: null, origin: 'missing', source: null, image: null, uses: [] });
      Object.assign(this.entries.get(key), patch);
    };
    for (const d of this.dicts) for (const t of d.dict.textures) if (!this.entries.has(t.name.toLowerCase()) || !this.entries.get(t.name.toLowerCase()).texture) add(t.name, { name: t.name, texture: t, origin: 'ytd', source: d.name });
    this.model = null;
    if (model && model.kind === 'obj') {
      const obj = objCodec.readObj(model.text);
      const mats = new Map();
      for (const m of model.mtl || []) for (const [k, v] of objCodec.readMtl(m)) mats.set(k, v);
      this.model = { geometries: obj.materials.length, triangles: obj.triangles, usage: obj.usage, meshes: obj.meshes, embedded: [], up: 'y' };
      for (const [key, u] of obj.usage) {
        const mat = mats.get(key);
        add(u.name, { origin: 'image', image: mat && mat.diffuse ? mat.diffuse : null, uses: u.uses });
      }
    } else if (model) {
      this.model = parsed || yftCodec.readModel(model.bytes, model.kind);
      for (const t of this.model.embedded) if (!this.entries.has(t.name.toLowerCase()) || !this.entries.get(t.name.toLowerCase()).texture) add(t.name, { texture: t, origin: 'embedded' });
      for (const [key, u] of this.model.usage) { if (!this.entries.has(key)) add(u.name, {}); this.entries.get(key).uses = u.uses; }
    }
  }

  // Decoded images for OBJ materials (3D preview only).
  setImage(name, img) { (this.images = this.images || new Map()).set(String(name).toLowerCase(), img); }

  get hasModel() { return !!this.model; }
  get hasDictionary() { return this.dicts.length > 0; }
  // Texture names the model uses but that are not in the opened files (to look for <name>.ytd).
  missingNames() { return [...this.entries.values()].filter(e => e.uses.length && !e.texture && e.origin !== 'image').map(e => e.name); }

  textures() {
    return [...this.entries.values()].map(e => {
      const uvs = summarize(e.uses), t = e.texture;
      const livery = uvs.some(u => u.samplers.some(s => LIVERY_SAMPLER.test(s)));
      // A missing livery is a slot to fill; other missing names come from the game's shared dictionaries.
      const origin = e.origin === 'missing' && !livery ? 'game' : e.origin;
      return {
        name: e.name, origin, source: e.source, image: e.image,
        width: t ? t.width : 0, height: t ? t.height : 0, format: t ? t.format : null, levels: t ? t.levels : 0,
        formatLabel: t ? bc.FORMATS[t.format].label : null,
        uvs, recommendedChannel: recommendedChannel(uvs), livery,
        editable: origin === 'ytd' || origin === 'image' || origin === 'embedded' || (origin === 'missing' && this.dicts.length > 0),
      };
    }).sort((a, b) => (b.livery - a.livery) || a.name.localeCompare(b.name));
  }

  entry(name) {
    const e = this.entries.get(String(name).toLowerCase());
    ensure(e, `Textura não encontrada: ${name}`);
    return e;
  }

  // Canvas size for painting: the texture size, but at least 2048 on the long side (placeholder liveries are tiny).
  workSize(name) {
    const t = this.entry(name).texture;
    let w = t ? t.width : MIN_WORK, h = t ? t.height : MIN_WORK;
    if (Math.max(w, h) < MIN_WORK) { const k = MIN_WORK / Math.max(w, h); w = Math.round(w * k / 4) * 4; h = Math.round(h * k / 4) * 4; }
    return { width: w, height: h };
  }

  // Top mip as RGBA8 at its own size, or null when the pixels are not in these files.
  pixels(name) {
    const t = this.entry(name).texture;
    if (!t) return null;
    return { rgba: bc.decode(t.format, t.data, t.width, t.height), width: t.width, height: t.height };
  }

  // Top-level texture reduced to at most maxSize on the long side, decoded from the closest mip.
  previewPixels(name, maxSize = 1024) {
    const t = this.entry(name).texture;
    if (!t) return null;
    let w = t.width, h = t.height, offset = 0, level = 0;
    while (level + 1 < t.levels && Math.max(w, h) > maxSize) {
      offset += bc.levelSize(t.format, w, h); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); level++;
    }
    const size = bc.levelSize(t.format, w, h);
    let rgba = bc.decode(t.format, t.data.subarray(offset, offset + size), w, h);
    if (Math.max(w, h) > maxSize) { const k = maxSize / Math.max(w, h), nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k)); rgba = resize(rgba, w, h, nw, nh); w = nw; h = nh; }
    return { rgba, width: w, height: h };
  }

  // 3D scene of the model (null without a model or geometry).
  scene() {
    if (!this.model || !this.model.meshes || !this.model.meshes.length) return null;
    const scene = new render.Scene(this.model.meshes, this.model.up || 'z');
    for (const m of scene.meshes) for (const name of [m.diffuse, m.livery]) {
      if (!name || scene.texture(name)) continue;
      const img = this.images && this.images.get(name.toLowerCase());
      if (img) { scene.setTexture(name, img); continue; }
      try { const px = this.previewPixels(name, 1024); if (px) scene.setTexture(name, px); } catch { /* unsupported texture: drawn untextured */ }
    }
    return scene;
  }

  // Extra UV layers like Photoshop's old "Create UV Overlays": 'shaded' or 'normal'.
  overlay(name, channel, kind, width, height) {
    const ids = new Set(this.entry(name).uses.filter(u => u.channel === channel).map(u => u.geometry));
    const meshes = (this.model && this.model.meshes || []).filter(m => ids.has(m.id) && m.uv[channel]);
    ensure(meshes.length, 'Não há geometria para esta textura.');
    return drawOverlay(meshes, channel, kind, width, height, this.model.up || 'z');
  }

  guide(name, channel, width, height) {
    const uses = this.entry(name).uses.filter(u => u.channel === channel);
    ensure(uses.length, 'Esta textura não tem UV nesse canal.');
    ensure(width <= MAX_GUIDE && height <= MAX_GUIDE, 'Guia grande demais.');
    return drawGuide(uses, width, height);
  }
}

// Earlier API (vehicle + one YTD), kept for callers and tests.
class VehicleSession extends ModelSession {
  constructor({ yft = null, ytd = null } = {}) {
    super({ model: yft ? { kind: 'yft', bytes: yft } : null, dictionaries: ytd ? [{ name: 'ytd', bytes: ytd }] : [] });
  }
}

// Nearest-neighbour or bilinear resize of RGBA8 (used to fit the original texture to the canvas).
function resize(rgba, w, h, nw, nh) {
  if (w === nw && h === nh) return rgba;
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * h / nh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < nw; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * w / nw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4, o = (y * nw + x) * 4;
      for (let k = 0; k < 4; k++) out[o + k] = Math.round((rgba[a + k] * (1 - tx) + rgba[b + k] * tx) * (1 - ty) + (rgba[c + k] * (1 - tx) + rgba[d + k] * tx) * ty);
    }
  }
  return out;
}

const OUTPUT_FORMATS = ['DXT1', 'DXT5', 'BC7', 'A8R8G8B8'];

// Writes `rgba` (width x height) as texture `name` into the YTD bytes and returns the new YTD.
// options.format: 'keep' (default) or one of OUTPUT_FORMATS. Missing names are added
// using an existing texture of the same dictionary as the template.
async function replaceTexture(ytdBytes, name, rgba, width, height, options = {}) {
  const progress = options.onProgress || (() => {});
  const dict = ytdCodec.readYtd(ytdBytes);
  ensure(rgba && rgba.length === width * height * 4, 'Imagem inválida.');
  const index = dict.textures.findIndex(t => t.name.toLowerCase() === String(name).toLowerCase());
  const base = index >= 0 ? dict.textures[index] : dict.textures[0];
  ensure(base, 'O YTD não tem nenhuma textura para servir de modelo.');
  let format = options.format && options.format !== 'keep' ? options.format : (index >= 0 ? base.format : 'DXT5');
  ensure(bc.FORMATS[format], `Formato desconhecido: ${format}`);
  if (format === 'DXT1' && hasTranslucency(rgba)) format = 'DXT5'; // DXT1 keeps only on/off alpha
  progress(0.02, 'Comprimindo');
  await tick();
  const texture = await ytdCodec.buildTexture({ name: index >= 0 ? base.name : name, struct: base.struct.slice() }, rgba, width, height, format,
    async f => { progress(0.05 + f * 0.75, 'Comprimindo'); await tick(); });
  if (index >= 0) dict.textures[index] = texture; else dict.textures.push(texture);
  progress(0.85, 'Montando o YTD');
  await tick();
  const out = ytdCodec.writeYtd(dict);
  progress(0.95, 'Conferindo');
  await tick();
  const check = ytdCodec.readYtd(out);
  const written = check.textures.find(t => t.name.toLowerCase() === texture.name.toLowerCase());
  ensure(written && written.width === width && written.height === height && check.textures.length === dict.textures.length, 'A verificação do YTD gerado falhou.');
  progress(1, 'Pronto');
  return { bytes: out, format, levels: texture.levels, added: index < 0, textures: check.textures.length };
}

function hasTranslucency(rgba) {
  for (let i = 3; i < rgba.length; i += 4) { const a = rgba[i]; if (a > 8 && a < 247) return true; }
  return false;
}

// Saves pixels into a texture embedded in a GTA model (.yft/.ydr/.ydd), resized to its original size.
async function replaceEmbeddedTexture(modelBytes, kind, name, rgba, width, height, options = {}) {
  const probe = yftCodec.readModel(modelBytes, kind).embedded.find(t => t.name.toLowerCase() === String(name).toLowerCase());
  ensure(probe, `Textura embutida não encontrada: ${name}`);
  const px = width === probe.width && height === probe.height ? rgba : resize(rgba, width, height, probe.width, probe.height);
  const result = await yftCodec.replaceEmbedded(modelBytes, kind, name, px, probe.width, probe.height, f => (options.onProgress || (() => {}))(0.1 + f * 0.8, 'Comprimindo'));
  return { ...result, width: probe.width, height: probe.height, resized: width !== probe.width || height !== probe.height };
}

module.exports = { decodeImage, replaceEmbeddedTexture, decodePng, render, ModelSession, VehicleSession, replaceTexture, resize, OUTPUT_FORMATS, EngineError, FORMATS: bc.FORMATS };
