'use strict';
// Runs the real Photoshop panel (photoshop/texture-studio/main.js) against a simulated
// Photoshop + UXP + DOM, clicking its buttons like a user. Used by texture-studio.test.js.
const fs = require('fs'), path = require('path'), vm = require('vm');

const PANEL = path.join(__dirname, '..', 'photoshop', 'texture-studio');

// ---------- tiny DOM ----------
class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(c) { this.set.add(c); } remove(c) { this.set.delete(c); }
  toggle(c, on) { if (on === undefined) on = !this.set.has(c); if (on) this.set.add(c); else this.set.delete(c); return on; }
  contains(c) { return this.set.has(c); }
}
class El {
  constructor(tag, attrs = {}) {
    this.tagName = tag; this.id = attrs.id || ''; this.children = []; this.listeners = {}; this.style = {}; this.dataset = {};
    this.classList = new ClassList(this); for (const c of (attrs.class || '').split(/\s+/).filter(Boolean)) this.classList.add(c);
    for (const [k, v] of Object.entries(attrs)) if (k.startsWith('data-')) this.dataset[k.slice(5)] = v;
    this._text = ''; this.value = attrs.value || ''; this.checked = 'checked' in attrs; this.disabled = false; this.title = '';
  }
  set className(v) { this.classList.set = new Set(v.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classList.set].join(' '); }
  set textContent(v) { this._text = String(v); this.children = []; } get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(v) { this._text = String(v).replace(/<[^>]+>/g, ' '); this.children = []; } get innerHTML() { return this._text; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  async click() { for (const fn of this.listeners.click || []) await fn(); }
  dispatch(type) { for (const fn of this.listeners[type] || []) fn(); }
  all() { return [this, ...this.children.flatMap(c => c.all())]; }
}
function buildDom(html) {
  const byId = new Map(), every = [], body = new El('body');
  const re = /<(input|select|button|div|span|p|section|footer|header|label|b|h2|option|img)\b([^>]*)>/g;
  let m; const selects = [];
  while ((m = re.exec(html))) {
    const attrs = {}; m[2].replace(/([\w-]+)(?:="([^"]*)")?/g, (_, k, v) => { attrs[k] = v === undefined ? '' : v; });
    const el = new El(m[1], attrs);
    if (m[1] === 'select') selects.push(el);
    if (m[1] === 'option' && selects.length) { const s = selects[selects.length - 1]; if ('selected' in attrs || !s.value) s.value = attrs.value; }
    if (attrs.id) byId.set(attrs.id, el);
    every.push(el);
  }
  return {
    body, getElementById: id => byId.get(id) || null, createElement: tag => new El(tag),
    querySelectorAll: sel => (sel.startsWith('.') ? every.filter(e => e.classList.contains(sel.slice(1))) : []),
  };
}

// ---------- simulated Photoshop ----------
function makePhotoshop(log) {
  let nextId = 1;
  const docs = [];
  const app = { documents: { add: async o => {
    const doc = makeDoc(o); docs.push(doc); app.activeDocument = doc; log.push(['add', o]); return doc;
  } }, activeDocument: null,
    open: async e => {
      if (!modal.active) throw new Error('open outside executeAsModal');
      const b = fs.readFileSync(e.nativePath), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
      const doc = makeDoc({ width: w, height: h, name: e.name }); doc.layers[0].name = 'Background';
      doc.layers[0].pixels = new Uint8Array(w * h * 4).fill(255); docs.push(doc); app.activeDocument = doc; log.push(['open', e.name]); return doc;
    } };
  function makeLayer(doc, name, opacity = 100, kind = 'pixel') {
    return { id: nextId++, name, opacity, kind, visible: true, _locked: false, pixels: null,
      get allLocked() { return this._locked; }, set allLocked(v) { this._locked = v; }, set selected(v) { if (v) doc._active = this; } };
  }
  function makeDoc(o) {
    const doc = { id: nextId++, width: o.width, height: o.height, name: o.name, layers: [], _xmp: '', path: '' };
    doc.layers.push(makeLayer(doc, 'Layer 1'));
    doc.createPixelLayer = async (opts = {}) => { const l = makeLayer(doc, opts.name || 'Layer', opts.opacity); doc.layers.unshift(l); return l; };
    doc.duplicate = async name => {
      const copy = makeDoc({ width: doc.width, height: doc.height, name }); copy.layers = doc.layers.map(l => { const c = makeLayer(copy, l.name, l.opacity); c.visible = l.visible; c._locked = l._locked; c.pixels = l.pixels; return c; });
      for (const l of copy.layers) l.delete = async () => { if (l._locked) throw new Error('locked'); copy.layers.splice(copy.layers.indexOf(l), 1); };
      docs.push(copy); app.activeDocument = copy; return copy;
    };
    doc.flatten = async () => {
      const r = await imaging.getPixels({ documentID: doc.id }), px = await r.imageData.getData();
      const l = makeLayer(doc, 'Background'); l.pixels = px; doc.layers = [l];
    };
    doc.saveAs = {
      png: async (e, o, asCopy) => { if (!modal.active || !asCopy) throw new Error('bad saveAs'); fs.writeFileSync(e.nativePath, encodePng(doc)); log.push(['savePng', e.name, doc.layers.map(l => l.name)]); },
      jpg: async (e, o, asCopy) => { if (!modal.active || !asCopy) throw new Error('bad saveAs'); fs.writeFileSync(e.nativePath, encodePng(doc)); log.push(['saveJpg', e.name]); },
    };
    doc.closeWithoutSaving = async () => { docs.splice(docs.indexOf(doc), 1); };
    doc.guides = { add: async (direction, coordinate) => { if (!modal.active) throw new Error('guides outside modal'); const g = { direction, coordinate, delete: async () => log.push(['guideDelete', direction]) }; log.push(['guide', direction, coordinate]); return g; } };
    return doc;
  }
  const findLayer = id => { for (const d of docs) for (const l of d.layers) if (l.id === id) return l; throw new Error('layer not found ' + id); };
  const imaging = {
    createImageDataFromBuffer: async (buf, o) => {
      if (!(buf instanceof Uint8Array) || buf.length !== o.width * o.height * o.components) throw new Error('bad buffer');
      return { ...o, buf, disposed: false, dispose() { this.disposed = true; } };
    },
    putPixels: async o => {
      if (!modal.active) throw new Error('putPixels outside executeAsModal');
      const l = findLayer(o.layerID); if (l._locked) throw new Error('layer locked');
      l.pixels = new Uint8Array(o.imageData.buf);
    },
    getPixels: async o => {
      const doc = docs.find(d => d.id === o.documentID), w = doc.width, h = doc.height, out = new Uint8Array(w * h * 4);
      if (o.layerID !== undefined) { // like Photoshop: only pixel layers give pixels on their own
        const l = findLayer(o.layerID);
        if (l.kind !== 'pixel' || !l.pixels) throw new Error('layer has no pixels');
        return { imageData: { width: w, height: h, components: 4, getData: async () => l.pixels, dispose() {} }, sourceBounds: { left: 0, top: 0, right: w, bottom: h } };
      }
      for (const l of doc.layers.slice().reverse()) { // bottom to top, simple "over"
        if (!l.visible || !l.pixels) continue;
        const op = l.opacity / 100;
        for (let i = 0; i < w * h; i++) {
          const a = (l.pixels[i * 4 + 3] / 255) * op; if (!a) continue;
          const ba = out[i * 4 + 3] / 255, oa = a + ba * (1 - a);
          for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round((l.pixels[i * 4 + k] * a + out[i * 4 + k] * ba * (1 - a)) / oa);
          out[i * 4 + 3] = Math.round(oa * 255);
        }
      }
      if (o.targetSize && (o.targetSize.width !== w || o.targetSize.height !== h)) {
        // Like Photoshop: a reduced image whose sourceBounds are in the reduced size.
        const tw = o.targetSize.width, th = o.targetSize.height, small = new Uint8Array(tw * th * 4);
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
          const sp = (Math.floor((y + 0.5) * h / th) * w + Math.floor((x + 0.5) * w / tw)) * 4;
          small.set(out.subarray(sp, sp + 4), (y * tw + x) * 4);
        }
        return { imageData: { width: tw, height: th, components: 4, getData: async () => small, dispose() {} }, sourceBounds: { left: 0, top: 0, right: tw, bottom: th } };
      }
      return { imageData: { width: w, height: h, components: 4, getData: async () => out, dispose() {} }, sourceBounds: { left: 0, top: 0, right: w, bottom: h } };
    },
  };
  const modal = { active: false };
  // hostControl: suspended history rolled back with commit=false restores what changed (here: visibility).
  const suspensions = new Map();
  const hostControl = {
    suspendHistory: async o => { const doc = docs.find(d => d.id === o.documentID); const id = nextId++; suspensions.set(id, doc.layers.map(l => [l, l.visible])); log.push(['suspend', o.name]); return id; },
    resumeHistory: async (id, commit = true) => { const snap = suspensions.get(id); suspensions.delete(id); if (!commit) for (const [l, v] of snap) l.visible = v; log.push(['resume', commit]); },
  };
  const core = { executeAsModal: async (fn, opts) => { modal.active = true; log.push(['modal', opts.commandName]); try { return await fn({ reportProgress() {}, hostControl }); } finally { modal.active = false; } } };
  // batchPlay: only what the panel uses — the document's XMP metadata (saved inside the PSD).
  const listeners = [];
  const action = {
    addNotificationListener(events, fn) { listeners.push(fn); },
    batchPlay: async commands => commands.map(c => {
      const ref = c._target.find(t => t._ref === 'document'), doc = docs.find(d => d.id === ref._id);
      if (!doc) throw new Error('no document ' + ref._id);
      if (c._obj === 'get') return { XMPMetadataAsUTF8: doc._xmp };
      if (c._obj === 'set') { if (!modal.active) throw new Error('set outside executeAsModal'); doc._xmp = c.to.XMPMetadataAsUTF8; log.push(['xmp', doc.id]); return {}; }
      throw new Error('unsupported ' + c._obj);
    }),
  };
  const fire = async () => { for (const fn of listeners) fn(); await new Promise(r => setTimeout(r, 80)); };
  return { app, imaging, core, action, constants: {}, docs, makeLayer, fire };
}

function encodePng(doc) {
  const zlib = require('zlib'), w = doc.width, h = doc.height, px = doc.layers[0].pixels || new Uint8Array(w * h * 4);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(px.buffer, px.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- simulated UXP storage over real files ----------
function makeUxp(queue) {
  const entry = p => ({
    name: path.basename(p), nativePath: p, isFile: true,
    read: async (o = {}) => { const b = fs.readFileSync(p); return o.format === 'utf8' ? b.toString('utf8') : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
    write: async buf => fs.writeFileSync(p, Buffer.from(buf)),
    // real UXP entries have no getParent()
  });
  const folder = p => ({
    name: path.basename(p), nativePath: p, isFile: false,
    getEntries: async () => fs.readdirSync(p).filter(n => fs.statSync(path.join(p, n)).isFile()).map(n => entry(path.join(p, n))),
    createFile: async (name, o = {}) => { const f = path.join(p, name); if (!o.overwrite && fs.existsSync(f)) throw new Error('exists'); return entry(f); },
  });
  const lfs = {
    getFileForOpening: async (o = {}) => { const next = queue.open.shift(); if (!next) return null; return o.allowMultiple ? [].concat(next).map(entry) : entry(next); },
    getFileForSaving: async () => { const next = queue.save.shift(); return next ? entry(next) : null; },
    createPersistentToken: async e => 'token:' + e.nativePath,
    getEntryForPersistentToken: async t => entry(t.slice(6)),
    getEntryWithUrl: async u => { const p = decodeURI(u.replace(/^file:\/*/, '')); if (!fs.existsSync(p)) throw new Error('no entry ' + u); return fs.statSync(p).isDirectory() ? folder(p) : entry(p); },
  };
  return { storage: { localFileSystem: lfs, formats: { binary: 'binary', utf8: 'utf8' } } };
}

function loadPanel() {
  const html = fs.readFileSync(path.join(PANEL, 'index.html'), 'utf8');
  const document = buildDom(html), log = [], queue = { open: [], save: [] };
  const photoshop = makePhotoshop(log), uxp = makeUxp(queue);
  const store = new Map();
  const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const requireFn = id => {
    if (id === 'photoshop') return photoshop;
    if (id === 'uxp') return uxp;
    return require(path.join(PANEL, id));
  };
  const context = vm.createContext({ require: requireFn, document, localStorage, console, setTimeout, setInterval: () => 0, Promise, Date, Math, JSON, Uint8Array, Array, Number, String, Set, Map, Error });
  vm.runInContext(fs.readFileSync(path.join(PANEL, 'main.js'), 'utf8'), context, { filename: 'main.js' });
  const $ = id => document.getElementById(id);
  if ($('pvLive')) $('pvLive').checked = false; // live refresh would composite the whole document in JS
  const settle = async () => { for (let i = 0; i < 2000; i++) { await new Promise(r => setTimeout(r, 5)); if (!document.body.classList.contains('busy')) { await new Promise(r => setTimeout(r, 5)); if (!document.body.classList.contains('busy')) return; } } throw new Error('panel stayed busy'); };
  return { document, $, photoshop, queue, log, settle };
}

module.exports = { loadPanel, encodePng };
