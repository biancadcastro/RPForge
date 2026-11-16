// RPForge Texture Studio — Photoshop panel.
// Paints textures of GTA V models (vehicles .yft, clothing .ydd, props .ydr + .ytd) and of
// any .obj model (+ .mtl and its images), with a UV guide drawn from the model.
// Uses RPForge's own engine (./engine). Everything runs inside Photoshop: no server,
// no external program, nothing leaves the computer.
const { app, core, action, imaging, constants } = require('photoshop');
const uxp = require('uxp');
const fs = uxp.storage.localFileSystem;
const formats = uxp.storage.formats;
const { t, tr, translateDom, variants, numberLocale } = require('./i18n.js');
translateDom(document);
try { const f = document.getElementById('filter'); if (f) { if (f.setAttribute) f.setAttribute('placeholder', t('Search…')); else f.placeholder = t('Search…'); } } catch {}
let engine;
try { engine = require('./engine/index.js'); }
catch (e) { if (window.rpforgeReport) window.rpforgeReport(t('engine failed to load: {0}', e && e.message)); throw e; }

// Two panels share this page: the main panel and the 3D preview (which can float on another monitor).
(function mountPanels() {
  const attach = (id, on) => root => {
    window.rpforgeVisible = window.rpforgeVisible || {};
    window.rpforgeVisible[id] = true;
    if (on) setTimeout(on, 0);
    const node = (root && root.node) || root, el = document.getElementById(id);
    if (node && el && node.appendChild && el.parentNode !== node) node.appendChild(el);
    if (el) el.classList.remove('unmounted');
  };
  try {
    const { entrypoints } = uxp;
    // The plugin's own ID at run time (the Marketplace build has another one), for showPanel().
    if (entrypoints && entrypoints.setup) entrypoints.setup({ plugin: { create() { window.rpforgePluginId = this && this.id; } }, panels: {
      'texturestudio.panel': { create: attach('panelMain'), show: attach('panelMain') },
      'texturestudio.preview': { create: attach('panelPreview'), show: attach('panelPreview', () => preview && preview.shown()), hide: () => { (window.rpforgeVisible = window.rpforgeVisible || {}).panelPreview = false; } },
    } });
  } catch (e) { console.warn('panels', e); }
})();

const PROFILE = 'sRGB IEC61966-2.1';
// UV guide layers: "<UV guide> <channel or overlay> (<not saved>)" in the panel language. Guides
// named in any language (and the "Guia UV" of 1.x) are recognised.
const GUIDE_PREFIXES = [...new Set(['Guia UV', ...variants('UV guide')])].sort((a, b) => b.length - a.length);
const guideName = label => `${t('UV guide')} ${label} (${t('not saved')})`;
const guideRest = name => { const p = GUIDE_PREFIXES.find(x => name.startsWith(x + ' ')); return p ? name.slice(p.length + 1) : null; };
const LINKS_KEY = 'rpforge.links.v2';
const PREFS_KEY = 'rpforge.prefs.v1';
const GTA_MODELS = ['yft', 'ydr', 'ydd'];
const MODEL_TYPES = [...GTA_MODELS, 'obj'];
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'tga'];

const $ = id => document.getElementById(id);
// Photoshop draws <button> its own way and ignores most of our CSS, so the panel uses divs styled
// as buttons. This gives them the "disabled" behaviour of a real button.
function asButton(el) {
  if (!el || el.rpButton) return el;
  el.rpButton = true;
  let off = false;
  Object.defineProperty(el, 'disabled', { configurable: true, get: () => off, set: v => { off = !!v; el.classList.toggle('is-disabled', off); } });
  const add = el.addEventListener.bind(el);
  el.addEventListener = (type, fn, opts) => add(type, type === 'click' ? e => (off ? undefined : fn(e)) : fn, opts);
  add('keydown', e => { if (!off && e && (e.key === 'Enter' || e.key === ' ')) { if (e.preventDefault) e.preventDefault(); el.click(); } });
  return el;
}
Array.from(document.querySelectorAll('.btn')).forEach(asButton);
// model: file entry of the model; kind: yft/ydr/ydd/obj/ytd; dicts: .ytd entries; images: Map(lower material -> image entry)
const state = { model: null, kind: null, dicts: [], images: new Map(), session: null, busy: false, backedUp: new Set() };

// ---------------------------------------------------------------- UI helpers
const show = (el, on) => el.classList.toggle('hidden', !on);
function message(text, kind = '') {
  const el = $('message');
  el.textContent = tr(text) || '';
  el.className = 'message' + (kind ? ' ' + kind : '');
  show(el, !!text);
}
function progress(value, text) {
  show($('progress'), value !== null);
  if (value === null) return;
  $('progressBar').style.width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  $('progressText').textContent = tr(text) || '';
}
const baseName = p => (p || '').split(/[\\/]/).pop();
const stem = name => name.replace(/\.[^.]+$/, '');
const ext = name => (/\.([^.]+)$/.exec(name) || [, ''])[1].toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));
// one/many are keys like '{0} part' / '{0} parts'.
const plural = (n, one, many) => t(n === 1 ? one : many, n.toLocaleString(numberLocale()));

async function run(label, fn) {
  if (state.busy) return;
  state.busy = true; message(''); progress(0.01, label);
  document.body.classList.add('busy');
  try { await fn(); }
  catch (e) { console.error(e); message(friendly(e), 'error'); }
  finally { state.busy = false; progress(null); document.body.classList.remove('busy'); refreshDocument(); }
}
function friendly(e) {
  const text = (e && e.message) || String(e);
  if (/permission|denied|not allowed/i.test(text)) return t('Photoshop did not allow access to the file. Choose the file again with the panel button.');
  return tr(text);
}

function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; } }
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...p })); } catch {} }

// ---------------------------------------------------------------- files
async function readBytes(entry) { return new Uint8Array(await entry.read({ format: formats.binary })); }
async function readText(entry) { return String(await entry.read({ format: formats.utf8 })); }
async function writeBytes(entry, bytes) {
  const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
  await entry.write(buffer, { format: formats.binary });
}
async function tokenFor(entry) { try { return entry ? await fs.createPersistentToken(entry) : null; } catch { return null; } }
async function entryFrom(path, token) {
  if (token) { try { return await fs.getEntryForPersistentToken(token); } catch {} }
  if (path) { try { return await fs.getEntryWithUrl('file:' + path.replace(/\\/g, '/')); } catch {} }
  return null;
}
// UXP entries have no getParent(): the folder is opened from the file's native path
// (the plugin has fullAccess), trying the URL spellings Photoshop versions accept.
async function parentFolder(entry) {
  if (!entry) return null;
  if (typeof entry.getParent === 'function') { try { const f = await entry.getParent(); if (f) return f; } catch {} }
  const native = String(entry.nativePath || '');
  const cut = Math.max(native.lastIndexOf('/'), native.lastIndexOf('\\'));
  if (cut <= 0) return null;
  const dir = native.slice(0, cut), fwd = dir.replace(/\\/g, '/');
  for (const url of ['file:' + dir, 'file:' + fwd, 'file:/' + fwd, 'file:///' + fwd, 'file:///' + encodeURI(fwd)]) {
    try { const f = await fs.getEntryWithUrl(url); if (f && typeof f.getEntries === 'function') return f; } catch {}
  }
  return null;
}
async function folderEntries(entry) {
  try { const folder = await parentFolder(entry); return folder ? (await folder.getEntries()).filter(e => e.isFile) : []; } catch { return []; }
}
const findIn = (entries, names) => {
  for (const n of names) { const hit = entries.find(e => e.name.toLowerCase() === n.toLowerCase()); if (hit) return hit; }
  return null;
};
const timestamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

// ---------------------------------------------------------------- document links
// A link says which texture a Photoshop document paints and where it is saved. It lives in the
// panel (by document id, valid while the document is open) and inside the document itself
// (XMP metadata, saved with the PSD), so reopening the PSD reopens its model by itself.
const PATHS_KEY = 'rpforge.paths.v1';
const XMP_NS = 'https://rpforge.dev/ns/texture-studio/1/';
function links() { try { return JSON.parse(localStorage.getItem(LINKS_KEY) || '{}'); } catch { return {}; } }
function storeLink(docId, link) { const all = links(); all[docId] = link; try { localStorage.setItem(LINKS_KEY, JSON.stringify(all)); } catch {} }
function linkOf(doc) { return doc ? links()[doc.id] || null : null; }
async function setLink(docId, link) {
  const full = { ...link, source: link.source || await sourceInfo() };
  storeLink(docId, full);
  try { await writeDocLink(docId, full); } catch { /* older Photoshop: the panel copy still works */ }
  return full;
}

// The files the panel has open (model, .ytd files, OBJ images), to reopen them later.
async function sourceInfo() {
  const ref = async e => (e ? { path: e.nativePath, token: await tokenFor(e), name: e.name } : null);
  const dicts = [];
  for (const d of state.dicts) dicts.push(await ref(d));
  const images = [];
  for (const [key, e] of state.images) images.push({ key, ...(await ref(e)) });
  return { kind: state.kind, model: await ref(state.model), dicts, images };
}
const samePath = (a, b) => !!a && !!b && a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
function sourceIsOpen(src) {
  if (!src || !state.session) return false;
  if (src.model) return !!state.model && samePath(state.model.nativePath, src.model.path);
  return !state.model && (src.dicts || []).every(d => state.dicts.some(e => samePath(e.nativePath, d.path)));
}

const xmlEscape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlUnescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
async function readXmp(docId) {
  const r = await action.batchPlay([{ _obj: 'get', _target: [{ _property: 'XMPMetadataAsUTF8' }, { _ref: 'document', _id: docId }] }], {});
  return (r && r[0] && typeof r[0].XMPMetadataAsUTF8 === 'string') ? r[0].XMPMetadataAsUTF8 : '';
}
async function readDocLink(docId) {
  const m = /<rpforge:link>([\s\S]*?)<\/rpforge:link>/.exec(await readXmp(docId));
  return m ? JSON.parse(xmlUnescape(m[1])) : null;
}
async function writeDocLink(docId, link) {
  await core.executeAsModal(async () => {
    let xmp = (await readXmp(docId)).replace(/<rdf:Description[^>]*xmlns:rpforge=[\s\S]*?<\/rdf:Description>\s*/g, '');
    const block = `<rdf:Description rdf:about="" xmlns:rpforge="${XMP_NS}"><rpforge:link>${xmlEscape(JSON.stringify(link))}</rpforge:link></rdf:Description>`;
    xmp = /<\/rdf:RDF>/.test(xmp) ? xmp.replace(/<\/rdf:RDF>/, block + '</rdf:RDF>')
      : `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${block}</rdf:RDF></x:xmpmeta>`;
    await action.batchPlay([{ _obj: 'set', _target: [{ _ref: 'property', _property: 'XMPMetadataAsUTF8' }, { _ref: 'document', _id: docId }], to: { _obj: 'document', XMPMetadataAsUTF8: xmp } }], {});
  }, { commandName: t('Remember model (RPForge)') });
}

// Saved documents are also remembered by file path (backup for when metadata is unavailable).
const docPath = doc => { try { return doc && doc.path ? String(doc.path) : ''; } catch { return ''; } };
function pathLinks() { try { return JSON.parse(localStorage.getItem(PATHS_KEY) || '{}'); } catch { return {}; } }
function rememberPath(doc, link) {
  const p = docPath(doc).toLowerCase();
  if (!p) return;
  const all = pathLinks();
  if (all[p] && all[p].texture === link.texture && all[p].path === link.path) return;
  all[p] = link;
  try { localStorage.setItem(PATHS_KEY, JSON.stringify(all)); } catch {}
}

// A document the panel does not know yet (e.g. a PSD reopened): read its link and reopen the
// model and textures it was painted for.
const restoreChecked = new Set();
async function restoreFromDocument(doc) {
  if (!doc || restoreChecked.has(doc.id) || state.busy) return;
  restoreChecked.add(doc.id);
  let link = null;
  try { link = await readDocLink(doc.id); } catch {}
  if (!link) { const p = docPath(doc).toLowerCase(); if (p) link = pathLinks()[p] || null; }
  if (!link || !link.texture) return;
  storeLink(doc.id, link);
  const src = link.source;
  if (src && (src.model || (src.dicts && src.dicts.length)) && !sourceIsOpen(src)) {
    const model = src.model ? await entryFrom(src.model.path, src.model.token) : null;
    if (src.model && !model) {
      refreshDocument();
      message(t('This document paints {0} of {1}, but the model is no longer at {2}. Open it from the panel to continue.', link.texture, src.model.name, src.model.path), 'error');
      return;
    }
    const dicts = [];
    for (const d of src.dicts || []) { const e = await entryFrom(d.path, d.token); if (e) dicts.push(e); }
    state.model = model; state.kind = src.kind || (model ? ext(model.name) : 'ytd'); state.dicts = dicts; state.images = new Map();
    for (const im of src.images || []) { const e = await entryFrom(im.path, im.token); if (e) state.images.set(im.key, e); }
    await loadModel(!!model && dicts.length === 0);
  }
  refreshDocument();
  if (preview) { preview.sessionChanged(); preview.linkChanged(); }
  const what = src && src.model ? src.model.name : link.file || link.texture;
  message(t('{1} was loaded again for {0}.', link.texture, what), 'ok');
}

// ---------------------------------------------------------------- opening a model
async function openModel() {
  const file = await fs.getFileForOpening({ types: [...MODEL_TYPES, 'ytd'] });
  if (!file) return;
  const kind = ext(file.name);
  if (kind === 'ytd') {
    // A dictionary alone, or with the model that has the same name next to it.
    const siblings = await folderEntries(file);
    const model = findIn(siblings, GTA_MODELS.flatMap(k => [`${stem(file.name)}.${k}`, `${stem(file.name)}_hi.${k}`]));
    state.model = model; state.kind = model ? ext(model.name) : 'ytd'; state.dicts = [file];
  } else { state.model = file; state.kind = kind; state.dicts = []; }
  state.images = new Map();
  await loadModel(true);
}

async function pickModel() {
  const file = await fs.getFileForOpening({ types: MODEL_TYPES });
  if (!file) return;
  state.model = file; state.kind = ext(file.name); state.dicts = []; state.images = new Map();
  await loadModel(true);
}
async function pickTextures() {
  if (state.kind === 'obj') {
    const files = await fs.getFileForOpening({ types: IMAGE_TYPES, allowMultiple: true });
    const list = Array.isArray(files) ? files : files ? [files] : [];
    if (!list.length) return;
    // Assign chosen images to materials by name, or to the only material.
    const materials = state.session ? state.session.textures().map(t => t.name) : [];
    for (const f of list) {
      const m = materials.find(n => stem(f.name).toLowerCase().includes(n.toLowerCase())) || (materials.length === 1 ? materials[0] : null);
      if (m) state.images.set(m.toLowerCase(), f);
    }
    renderFiles(); renderList();
    return;
  }
  const file = await fs.getFileForOpening({ types: ['ytd'] });
  if (!file) return;
  state.dicts = [file];
  await loadModel(false);
}

async function loadModel(discover) {
  renderFiles();
  if (!state.model && !state.dicts.length) return;
  await run(t('Reading the model'), async () => {
    progress(0.1, t('Reading files'));
    if (state.kind === 'obj') return loadObj();
    const modelBytes = state.model ? await readBytes(state.model) : null;
    const model = modelBytes ? { kind: state.kind, bytes: modelBytes } : null;
    state.parsed = null;
    if (discover && state.model) state.dicts = await discoverDictionaries(model);
    progress(0.5, t('Reading textures'));
    const dictionaries = [];
    for (const d of state.dicts) dictionaries.push({ name: d.name, bytes: await readBytes(d) });
    await sleep(0);
    // The model was already parsed while looking for its .ytd files: reuse it.
    state.session = new engine.ModelSession({ model, dictionaries, parsed: state.parsed });
    state.parsed = null;
    afterLoad();
  });
}

// Finds the .ytd files of a GTA model: same name, one per texture name (clothing),
// or — when nothing matches — the few .ytd files in the same folder.
async function discoverDictionaries(model) {
  const siblings = await folderEntries(state.model);
  const ytds = siblings.filter(e => ext(e.name) === 'ytd');
  const base = stem(state.model.name).replace(/_hi$/i, '');
  const found = [];
  const add = e => { if (e && !found.some(f => f.name === e.name)) found.push(e); };
  add(findIn(ytds, [`${base}.ytd`, `${stem(state.model.name)}.ytd`, `${base}+hi.ytd`]));
  try {
    const probe = new engine.ModelSession({ model });
    state.parsed = probe.model;
    for (const name of probe.missingNames()) add(findIn(ytds, [`${name}.ytd`]));
  } catch { /* the full load reports model errors */ }
  if (!found.length && ytds.length && ytds.length <= 4) ytds.forEach(add);
  return found;
}

async function loadObj() {
  const text = await readText(state.model);
  const siblings = await folderEntries(state.model);
  const mtlNames = [...text.matchAll(/^mtllib\s+(.+)$/gm)].map(m => baseName(m[1].trim()));
  const mtl = [];
  for (const n of mtlNames.length ? mtlNames : [`${stem(state.model.name)}.mtl`]) {
    const e = findIn(siblings, [n]); if (e) mtl.push(await readText(e));
  }
  progress(0.5, t('Reading UVs'));
  await sleep(0);
  state.session = new engine.ModelSession({ model: { kind: 'obj', text, mtl } });
  for (const t of state.session.textures()) {
    if (state.images.has(t.name.toLowerCase())) continue;
    const img = t.image ? findIn(siblings, [baseName(t.image)]) : findIn(siblings, IMAGE_TYPES.map(x => `${t.name}.${x}`));
    if (img) state.images.set(t.name.toLowerCase(), img);
  }
  // Decode the images for the 3D preview (PNG/JPG/TGA, own decoders).
  for (const [key, img] of state.images) {
    try { const px = engine.decodeImage(await readBytes(img), img.name); state.session.setImage(key, px.width * px.height > 4194304 ? { ...px, rgba: engine.resize(px.rgba, px.width, px.height, 2048, Math.round(2048 * px.height / px.width)), width: 2048, height: Math.round(2048 * px.height / px.width) } : px); } catch { /* preview stays untextured */ }
  }
  afterLoad();
}

function afterLoad() {
  const list = state.session.textures();
  const liveries = list.filter(t => t.livery).length;
  const own = list.filter(t => ['ytd', 'embedded', 'image'].includes(t.origin)).length;
  const info = [];
  const m = state.session.model;
  if (m) info.push(state.kind === 'obj' ? plural(m.triangles, '{0} triangle', '{0} triangles') : plural(m.geometries, '{0} part', '{0} parts'));
  info.push(plural(own, '{0} texture', '{0} textures'));
  if (liveries) info.push(plural(liveries, '{0} livery', '{0} liveries'));
  let note = '';
  if (state.kind !== 'obj' && !state.dicts.length) note = state.session.model ? ' ' + t('Also open the .ytd to be able to save.') : '';
  $('vehicleInfo').textContent = info.join(', ') + '.' + note;
  renderFiles();
  show($('step2'), true);
  renderList();
  message(liveries ? t('The livery is at the top of the list.') : t('Choose the texture you want to paint.'), 'ok');
  if (preview) preview.sessionChanged();
}

const KIND_LABEL = { yft: 'Vehicle', ydr: 'Prop', ydd: 'Clothing', obj: 'OBJ model', ytd: 'Model' };
function renderFiles() {
  const loaded = !!(state.model || state.dicts.length);
  show($('vehicleEmpty'), !loaded);
  show($('vehicleLoaded'), loaded);
  $('modelKind').textContent = t(KIND_LABEL[state.kind] || 'Model');
  $('yftName').textContent = state.model ? state.model.name : t('not open');
  $('yftName').title = state.model ? state.model.nativePath || '' : '';
  let textures;
  if (state.kind === 'obj') textures = state.images.size ? [...state.images.values()].map(e => e.name).join(', ') : t('no image found');
  else textures = state.dicts.length ? state.dicts.map(d => d.name).join(', ') : t('no .ytd found');
  $('ytdName').textContent = textures;
  $('ytdName').title = textures;
}

// ---------------------------------------------------------------- texture list
function originOf(t) {
  if (state.kind === 'obj') return state.images.has(t.name.toLowerCase()) ? 'image' : 'new-image';
  return t.origin;
}
function describe(tex) {
  const parts = [];
  if (tex.livery) parts.push(t('Livery'));
  const origin = originOf(tex);
  if (origin === 'embedded') parts.push(t('inside the model'));
  else if (origin === 'missing') parts.push(t('not in the YTD yet'));
  else if (origin === 'game') parts.push(t('from the game, not in this file'));
  else if (origin === 'image') parts.push(state.images.get(tex.name.toLowerCase()).name);
  else if (origin === 'new-image') parts.push(t('no image, starts blank'));
  if (tex.width) parts.push(`${tex.width}×${tex.height}`);
  if (tex.uvs.length && state.kind !== 'obj') parts.push(plural(tex.uvs[0].geometries, '{0} part', '{0} parts'));
  return parts.join(', ');
}

function renderList() {
  if (!state.session) return;
  const q = $('filter').value.trim().toLowerCase();
  const showAll = $('showAll').checked || !state.session.model;
  const items = state.session.textures().filter(t => {
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (showAll) return true;
    return t.livery || (t.uvs.length > 0 && t.origin !== 'game');
  });
  $('count').textContent = String(items.length);
  const list = $('list');
  list.innerHTML = '';
  const groups = [[t('Liveries'), items.filter(x => x.livery)], [state.kind === 'obj' ? t('Materials') : t('Model textures'), items.filter(x => !x.livery && x.origin !== 'game')], [t('From the game'), items.filter(x => !x.livery && x.origin === 'game')]];
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = q ? t('No texture with that name.') : t('No textures to show. Check "{0}".', t('Show all textures'));
    list.appendChild(empty);
  }
  for (const [title, group] of groups) {
    if (!group.length) continue;
    const head = document.createElement('div');
    head.className = 'group'; head.textContent = title;
    list.appendChild(head);
    // Paintable textures first, read-only ones (inside the model) after.
    group.sort((a, b) => (a.origin === 'embedded') - (b.origin === 'embedded') || (b.livery - a.livery));
    for (const tex of group) {
      const row = document.createElement('div');
      row.className = 'item' + (tex.livery ? ' livery' : '');
      const info = document.createElement('div'); info.className = 'info';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = tex.name;
      const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = describe(tex);
      info.appendChild(name); info.appendChild(meta);
      const open = asButton(document.createElement('div'));
      open.className = 'btn small'; open.textContent = t('Open');
      open.disabled = tex.origin === 'game';
      open.addEventListener('click', () => openTexture(tex.name));
      row.appendChild(info); row.appendChild(open);
      list.appendChild(row);
    }
  }
  renderLinkTargets();
}

function canvasSize(name) {
  const choice = $('workSize').value;
  const t = state.session.textures().find(x => x.name === name);
  if (choice === 'auto') return state.session.workSize(name);
  let w = t.width || 2048, h = t.height || 2048;
  if (choice === 'original') return { width: Math.max(4, Math.round(w / 4) * 4), height: Math.max(4, Math.round(h / 4) * 4) };
  const target = Number(choice), k = target / Math.max(w, h);
  return { width: Math.max(4, Math.round(w * k / 4) * 4), height: Math.max(4, Math.round(h * k / 4) * 4) };
}

// ---------------------------------------------------------------- Photoshop
const enumValue = (group, key, fallback) => (constants && constants[group] && constants[group][key] !== undefined ? constants[group][key] : fallback);

async function putLayerPixels(doc, layer, rgba, width, height) {
  const imageData = await imaging.createImageDataFromBuffer(rgba, { width, height, components: 4, chunky: true, colorSpace: 'RGB', colorProfile: PROFILE });
  try { await imaging.putPixels({ documentID: doc.id, layerID: layer.id, imageData, replace: true, targetBounds: { left: 0, top: 0 } }); }
  finally { try { imageData.dispose(); } catch {} }
}
const isGuide = layer => typeof layer.name === 'string' && guideRest(layer.name) !== null;

async function newDocument(name, width, height) {
  return app.documents.add({
    width, height, resolution: 72, name,
    mode: enumValue('NewDocumentMode', 'RGB', 'RGBColorMode'),
    fill: enumValue('DocumentFill', 'TRANSPARENT', 'transparent'),
  });
}

// Adds the "Paint" layer and the UV guides on top of whatever the document holds.
async function addWorkLayers(doc, tex, width, height, guides) {
  const paint = await doc.createPixelLayer({ name: t('Paint') });
  // Optional overlays like Photoshop 2020's 3D "Create UV Overlays" (hidden; turn on in Layers).
  const channel = tex.recommendedChannel === null ? 0 : tex.recommendedChannel;
  for (const [id, kind, label] of [['ovShaded', 'shaded', t('shaded')], ['ovNormal', 'normal', t('normal map')]]) {
    if (!$(id).checked || !state.session || !state.session.model || !tex.uvs.length) continue;
    try {
      const o = state.session.overlay(tex.name, channel, kind, width, height);
      const layer = await doc.createPixelLayer({ name: guideName(label) });
      await putLayerPixels(doc, layer, o.rgba, width, height);
      layer.visible = false;
      try { layer.allLocked = true; } catch {}
    } catch (e) { console.warn('overlay', e); }
  }
  for (const g of guides) {
    const layer = await doc.createPixelLayer({ name: guideName(g.channel), opacity: 90 });
    await putLayerPixels(doc, layer, g.rgba, width, height);
    layer.visible = g.channel === tex.recommendedChannel;
    try { layer.allLocked = true; } catch {}
  }
  try { paint.selected = true; } catch {}
}

async function drawGuides(name, tex, width, height) {
  const guides = [];
  for (const u of tex.uvs) {
    progress(0.2 + 0.2 * guides.length, t('Drawing the UV{0} guide', u.channel));
    await sleep(0);
    guides.push({ channel: u.channel, ...state.session.guide(name, u.channel, width, height) });
  }
  return guides;
}

async function openTexture(name) {
  const tex = state.session.textures().find(x => x.name === name);
  if (state.kind === 'obj') return openImageTexture(tex);
  await run(t('Opening {0}', name), async () => {
    const { width, height } = canvasSize(name);
    progress(0.1, t('Reading pixels'));
    await sleep(0);
    const px = state.session.pixels(name);
    const base = px ? engine.resize(px.rgba, px.width, px.height, width, height) : null;
    const guides = await drawGuides(name, tex, width, height);
    let docId = null;
    await core.executeAsModal(async () => {
      progress(0.6, t('Creating the document'));
      const doc = await newDocument(`${name} (RPForge)`, width, height);
      const original = doc.layers[0];
      original.name = t('Original texture');
      if (base) await putLayerPixels(doc, original, base, width, height);
      progress(0.75, t('Creating layers'));
      await addWorkLayers(doc, tex, width, height, guides);
      docId = doc.id;
    }, { commandName: t('Open texture (RPForge)') });
    // Save target: the .ytd the texture came from, or the first one for new textures.
    if (tex.origin === 'embedded' && state.model) {
      await setLink(docId, {
        kind: 'model', modelKind: state.kind, texture: name, path: state.model.nativePath, token: await tokenFor(state.model), file: state.model.name,
        editable: true, origin: 'embedded', guideChannel: tex.recommendedChannel, size: `${tex.width}×${tex.height}`,
      });
      finishOpen(tex, width, height, guides, !base);
      if (preview) preview.linkChanged();
      return;
    }
    const target = state.dicts.find(d => d.name === tex.source) || state.dicts[0] || null;
    await setLink(docId, {
      kind: 'ytd', texture: name, path: target ? target.nativePath : null, token: await tokenFor(target), file: target ? target.name : null,
      editable: tex.editable && !!target, origin: tex.origin, guideChannel: tex.recommendedChannel,
    });
    finishOpen(tex, width, height, guides, !base);
    if (preview) preview.linkChanged();
  });
}

async function openImageTexture(tex) {
  const image = state.images.get(tex.name.toLowerCase()) || null;
  await run(t('Opening {0}', tex.name), async () => {
    let docId = null, width = 0, height = 0, guides = [];
    if (image && /\.(png|jpe?g)$/i.test(image.name)) {
      await core.executeAsModal(async () => {
        progress(0.2, t('Opening the image'));
        const doc = await app.open(image);
        width = Math.round(Number(doc.width)); height = Math.round(Number(doc.height));
        try { doc.layers[doc.layers.length - 1].name = t('Original texture'); } catch {}
        guides = await drawGuides(tex.name, tex, width, height);
        progress(0.75, t('Creating layers'));
        await addWorkLayers(doc, tex, width, height, guides);
        docId = doc.id;
      }, { commandName: t('Open texture (RPForge)') });
    } else {
      ({ width, height } = canvasSize(tex.name));
      guides = await drawGuides(tex.name, tex, width, height);
      await core.executeAsModal(async () => {
        const doc = await newDocument(`${tex.name} (RPForge)`, width, height);
        doc.layers[0].name = t('Background');
        await addWorkLayers(doc, tex, width, height, guides);
        docId = doc.id;
      }, { commandName: t('Open texture (RPForge)') });
    }
    await setLink(docId, {
      kind: 'image', texture: tex.name, path: image ? image.nativePath : null, token: await tokenFor(image), file: image ? image.name : null,
      folder: state.model ? state.model.nativePath : null, editable: true, origin: image ? 'image' : 'new-image', guideChannel: 0,
    });
    finishOpen(tex, width, height, guides, !image);
    if (preview) preview.linkChanged();
  });
}

function finishOpen(tex, width, height, guides, empty) {
  const skipped = guides.reduce((n, g) => n + g.skipped, 0);
  const notes = [t('{0} opened at {1}×{2}.', tex.name, width, height)];
  if (tex.livery) notes.push(t('The guide already follows the livery layout.'));
  if (skipped) notes.push(t('{0} triangles of a repeated material were left out of the guide.', skipped));
  if (empty) notes.push(t('This texture had no image. The document starts blank.'));
  message(notes.join(' '), 'ok');
}

// Hides the UV guides while fn runs (guides are locked: unlock, hide, relock).
async function withoutGuides(doc, fn) {
  const hidden = [];
  for (const layer of Array.from(doc.layers)) {
    if (!isGuide(layer) || !layer.visible) continue;
    const locked = layer.allLocked;
    try { if (locked) layer.allLocked = false; layer.visible = false; } finally { if (locked) try { layer.allLocked = true; } catch {} }
    hidden.push(layer);
  }
  try { return await fn(); }
  finally {
    for (const layer of hidden) {
      const locked = layer.allLocked;
      try { if (locked) layer.allLocked = false; layer.visible = true; } finally { if (locked) try { layer.allLocked = true; } catch {} }
    }
  }
}

// Reads the visible composite (guides hidden) as RGBA8 at document size.
async function readComposite(doc) {
  const width = Math.round(Number(doc.width)), height = Math.round(Number(doc.height));
  return withoutGuides(doc, async () => {
    const result = await imaging.getPixels({ documentID: doc.id, componentSize: 8, applyAlpha: false, colorSpace: 'RGB', colorProfile: PROFILE });
    const img = result.imageData;
    try {
      const data = await img.getData({ chunky: true });
      const comps = img.components, iw = img.width, ih = img.height;
      const b = result.sourceBounds || { left: 0, top: 0 };
      const out = new Uint8Array(width * height * 4);
      for (let y = 0; y < ih; y++) {
        const ty = y + (b.top || 0); if (ty < 0 || ty >= height) continue;
        for (let x = 0; x < iw; x++) {
          const tx = x + (b.left || 0); if (tx < 0 || tx >= width) continue;
          const s = (y * iw + x) * comps, o = (ty * width + tx) * 4;
          out[o] = data[s]; out[o + 1] = data[s + 1]; out[o + 2] = data[s + 2]; out[o + 3] = comps >= 4 ? data[s + 3] : 255;
        }
      }
      return { rgba: out, width, height };
    } finally { try { img.dispose(); } catch {} }
  });
}

async function backupOnce(entry, bytes) {
  if (!$('backup').checked || state.backedUp.has(entry.nativePath)) return null;
  progress(0.9, t('Keeping a copy of the original'));
  let name = `${stem(entry.name)}.backup-${timestamp()}.${ext(entry.name)}`;
  try {
    const folder = await parentFolder(entry);
    if (!folder) throw new Error('folder unavailable');
    await writeBytes(await folder.createFile(name, { overwrite: false }), bytes);
  } catch {
    const backup = await fs.getFileForSaving(name, { types: [ext(entry.name)] });
    if (!backup) throw new Error(t('Save cancelled: the copy of the original was not created.'));
    await writeBytes(backup, bytes); name = backup.name;
  }
  state.backedUp.add(entry.nativePath);
  return name;
}

async function saveDocument(asCopy) {
  const doc = app.activeDocument, link = linkOf(doc);
  if (!doc || !link) return;
  if (link.kind === 'image') return saveImage(doc, link, asCopy);
  if (link.kind === 'model') return saveEmbedded(doc, link, asCopy);
  await run(t('Saving to the YTD'), async () => {
    if (!link.editable) throw new Error(link.origin === 'embedded' ? t('This texture is inside the model. Only textures in a .ytd can be saved here.') : t('Open the model\'s .ytd to be able to save.'));
    const entry = await entryFrom(link.path, link.token) || state.dicts.find(d => d.nativePath === link.path);
    if (!entry) throw new Error(t('Could not find the .ytd of this document. Open the model again in the panel.'));
    progress(0.05, t('Reading the YTD'));
    const original = await readBytes(entry);
    let pixels;
    await core.executeAsModal(async () => { pixels = await readComposite(doc); }, { commandName: t('Read pixels (RPForge)') });
    let { rgba, width, height } = pixels;
    if (width % 4 || height % 4) {
      const nw = Math.max(4, Math.round(width / 4) * 4), nh = Math.max(4, Math.round(height / 4) * 4);
      rgba = engine.resize(rgba, width, height, nw, nh); width = nw; height = nh;
    }
    const format = $('format').value;
    savePrefs({ format });
    const result = await engine.replaceTexture(original, link.texture, rgba, width, height, {
      format, onProgress: (v, text) => progress(0.1 + v * 0.75, text),
    });
    let target = entry, backupName = null;
    if (asCopy) {
      target = await fs.getFileForSaving(`${stem(entry.name)}.ytd`, { types: ['ytd'] });
      if (!target) return;
    } else backupName = await backupOnce(entry, original);
    progress(0.95, t('Writing'));
    await writeBytes(target, result.bytes);
    if (!asCopy) await refreshSession();
    const notes = [t('Saved to {0}: {1} {2}×{3}, {4}.', target.name, link.texture, width, height, engine.FORMATS[result.format].label)];
    if (result.added) notes.push(t('The texture was added to the file.'));
    if (format === 'DXT1' && result.format !== 'DXT1') notes.push(t('There was partial transparency, so DXT5 was used.'));
    if (backupName) notes.push(t('Copy of the original: {0}.', backupName));
    message(notes.join(' '), 'ok');
  });
}

// Texture inside the model file (.ydd/.ydr/.yft): written in place, same size and format.
async function saveEmbedded(doc, link, asCopy) {
  await run(t('Saving to the model'), async () => {
    const entry = await entryFrom(link.path, link.token) || (state.model && state.model.nativePath === link.path ? state.model : null);
    if (!entry) throw new Error(t('Could not find the model file. Open it again in the panel.'));
    progress(0.05, t('Reading the model'));
    const original = await readBytes(entry);
    let pixels;
    await core.executeAsModal(async () => { pixels = await readComposite(doc); }, { commandName: t('Read pixels (RPForge)') });
    const result = await engine.replaceEmbeddedTexture(original, link.modelKind, link.texture, pixels.rgba, pixels.width, pixels.height, { onProgress: (v, text) => progress(v * 0.85, text) });
    let target = entry, backupName = null;
    if (asCopy) {
      target = await fs.getFileForSaving(entry.name, { types: [ext(entry.name)] });
      if (!target) return;
    } else backupName = await backupOnce(entry, original);
    progress(0.95, t('Writing'));
    await writeBytes(target, result.bytes);
    if (!asCopy) await refreshSession();
    const notes = [t('Saved to {0}: {1} {2}×{3}, {4}.', target.name, link.texture, result.width, result.height, engine.FORMATS[result.format].label)];
    if (result.resized) notes.push(t('Textures inside the model keep their original size, so the image was resized.'));
    if (backupName) notes.push(t('Copy of the original: {0}.', backupName));
    message(notes.join(' '), 'ok');
  });
}

async function saveImage(doc, link, asCopy) {
  await run(t('Saving the image'), async () => {
    let target = asCopy ? null : await entryFrom(link.path, link.token);
    if (target && !/\.(png|jpe?g)$/i.test(target.name)) target = null;
    if (!target) {
      target = await fs.getFileForSaving(`${link.file ? stem(link.file) : link.texture}.png`, { types: ['png', 'jpg'] });
      if (!target) return;
    }
    let backupName = null;
    if (!asCopy && link.path && target.nativePath === link.path) backupName = await backupOnce(target, await readBytes(target));
    progress(0.6, t('Writing'));
    await core.executeAsModal(async () => {
      const copy = await doc.duplicate(t('{0} (save)', link.texture));
      try {
        for (const layer of Array.from(copy.layers)) if (isGuide(layer)) { try { layer.allLocked = false; } catch {} await layer.delete(); }
        await copy.flatten();
        if (/\.jpe?g$/i.test(target.name)) await copy.saveAs.jpg(target, { quality: 12 }, true);
        else await copy.saveAs.png(target, { compression: 6 }, true);
      } finally { await copy.closeWithoutSaving(); app.activeDocument = doc; }
    }, { commandName: t('Save texture (RPForge)') });
    if (!link.path) await setLink(doc.id, { ...link, path: target.nativePath, token: await tokenFor(target), file: target.name, origin: 'image' });
    message(t('Saved to {0}.', target.name) + (backupName ? ' ' + t('Copy of the original: {0}.', backupName) : ''), 'ok');
  });
}

// Keeps the open model in sync with what is now on disk.
async function refreshSession() {
  if (!state.session || state.kind === 'obj') return;
  try {
    const model = state.model ? { kind: state.kind, bytes: await readBytes(state.model) } : null;
    const dictionaries = [];
    for (const d of state.dicts) dictionaries.push({ name: d.name, bytes: await readBytes(d) });
    state.session = new engine.ModelSession({ model, dictionaries });
    renderList();
    if (preview) preview.sessionChanged();
  } catch {}
}

async function toggleGuide() {
  const doc = app.activeDocument;
  if (!doc) return;
  const guides = Array.from(doc.layers).filter(isGuide);
  if (!guides.length) return message(t('This document has no UV guide.'), 'error');
  const link = linkOf(doc);
  const preferred = guides.find(g => link && (guideRest(g.name) || '').startsWith(`${link.guideChannel} `)) || guides[0];
  await core.executeAsModal(async () => {
    const anyVisible = guides.some(g => g.visible);
    for (const g of guides) {
      const locked = g.allLocked;
      if (locked) g.allLocked = false;
      g.visible = !anyVisible && g === preferred;
      if (locked) g.allLocked = true;
    }
  }, { commandName: t('UV guide (RPForge)') });
}

// ---------------------------------------------------------------- step 3 card
function refreshDocument() {
  let doc = null;
  try { doc = app.activeDocument; } catch {}
  const link = linkOf(doc);
  if (doc && !link) restoreFromDocument(doc);
  if (doc && link) rememberPath(doc, link);
  show($('docCard'), !!link);
  show($('linkCard'), !!doc && !link && !!state.session && (state.dicts.length > 0 || state.kind === 'obj'));
  if (!link) return;
  const where = link.file || (link.kind === 'image' ? t('a new image') : t('not open'));
  const parts = [t('Saves <b>{0}</b> to <b>{1}</b>', escapeHtml(link.texture), escapeHtml(where))];
  if (!link.editable) parts.push(escapeHtml(t('Open the model\'s .ytd to be able to save.')));
  if (link.kind === 'model') parts.push(escapeHtml(t('Saved inside the model, at the same size ({0}) and format.', link.size || '')));
  $('docInfo').innerHTML = parts.join('<br/>');
  $('saveBtn').textContent = link.kind === 'image' ? t('Save image') : link.kind === 'model' ? t('Save to model') : t('Save to YTD');
  $('saveBtn').disabled = !link.editable || state.busy;
  $('saveCopyBtn').disabled = !link.editable || state.busy;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function renderLinkTargets() {
  const select = $('linkTarget');
  select.innerHTML = '';
  if (!state.session) return;
  for (const t of state.session.textures().filter(x => x.editable)) {
    const o = document.createElement('option');
    o.value = t.name; o.textContent = `${t.name}${t.width ? ` (${t.width}×${t.height})` : ''}`;
    select.appendChild(o);
  }
}
async function linkActive() {
  const doc = app.activeDocument, name = $('linkTarget').value;
  if (!doc || !name || !state.session) return;
  const tex = state.session.textures().find(x => x.name === name);
  if (state.kind === 'obj') {
    const image = state.images.get(name.toLowerCase()) || null;
    await setLink(doc.id, { kind: 'image', texture: name, path: image ? image.nativePath : null, token: await tokenFor(image), file: image ? image.name : null, editable: true, origin: 'image', guideChannel: 0 });
  } else {
    const target = state.dicts.find(d => d.name === tex.source) || state.dicts[0];
    await setLink(doc.id, { kind: 'ytd', texture: name, path: target.nativePath, token: await tokenFor(target), file: target.name, editable: true, origin: tex.origin, guideChannel: tex.recommendedChannel });
  }
  refreshDocument();
  message(t('Document linked to {0}.', name), 'ok');
}

// ---------------------------------------------------------------- 3D preview
function activeDocument() { try { return app.activeDocument || null; } catch { return null; } }

// Visible layers bottom→top, skipping guides; groups are walked when visible.
function paintLayers(layers) {
  const out = [];
  for (const layer of Array.from(layers || []).reverse()) {
    if (!layer.visible || isGuide(layer)) continue;
    if (layer.layers && layer.layers.length) out.push(...paintLayers(layer.layers)); else out.push(layer);
  }
  return out;
}

// Reads the document as the 3D preview texture (guides excluded) without touching history.
async function readDocumentTexture(maxSize) {
  const doc = activeDocument();
  if (!doc || state.busy) return null;
  const W = Math.round(Number(doc.width)), H = Math.round(Number(doc.height));
  const k = Math.min(1, maxSize / Math.max(W, H)), tw = Math.max(1, Math.round(W * k)), th = Math.max(1, Math.round(H * k));
  const out = new Uint8Array(tw * th * 4);
  const read = async opts => {
    const get = () => imaging.getPixels({ documentID: doc.id, componentSize: 8, applyAlpha: false, colorSpace: 'RGB', colorProfile: PROFILE, targetSize: { width: tw, height: th }, ...opts });
    try { return await get(); }
    catch { let r; await core.executeAsModal(async () => { r = await get(); }, { commandName: t('3D preview (RPForge)') }); return r; }
  };
  const blit = async (res, opacity) => {
    const img = res.imageData;
    try {
      const data = await img.getData({ chunky: true }), comps = img.components, iw = img.width, ih = img.height;
      const b = res.sourceBounds || { left: 0, top: 0, right: W, bottom: H };
      const bw = (b.right - b.left) || W, bh = (b.bottom - b.top) || H;
      // With targetSize, Photoshop may report sourceBounds already in the reduced size (bounds as
      // wide as the image) or in document pixels; scale by k only in the second case.
      const kx = Math.abs(bw - iw) <= 2 ? 1 : k, ky = Math.abs(bh - ih) <= 2 ? 1 : k;
      for (let y = 0; y < ih; y++) {
        const ty = Math.floor((b.top + (y + 0.5) * bh / ih) * ky); if (ty < 0 || ty >= th) continue;
        for (let x = 0; x < iw; x++) {
          const tx = Math.floor((b.left + (x + 0.5) * bw / iw) * kx); if (tx < 0 || tx >= tw) continue;
          const s = (y * iw + x) * comps, o = (ty * tw + tx) * 4;
          const a = (comps >= 4 ? data[s + 3] / 255 : 1) * opacity;
          if (a <= 0) continue;
          const ba = out[o + 3] / 255, oa = a + ba * (1 - a);
          for (let c = 0; c < 3; c++) out[o + c] = (data[s + c] * a + out[o + c] * ba * (1 - a)) / oa;
          out[o + 3] = oa * 255;
        }
      }
    } finally { try { img.dispose(); } catch {} }
  };
  const guides = Array.from(doc.layers).filter(l => isGuide(l) && l.visible);
  if (!guides.length) { await blit(await read({}), 1); return { rgba: out, width: tw, height: th }; }
  // Photoshop's own composite (masks, blend modes, fill and adjustment layers, styles), read with
  // the guides hidden inside a suspended history that is rolled back: nothing reaches the history.
  let composite = null;
  try {
    await core.executeAsModal(async ctx => {
      const host = ctx && ctx.hostControl;
      if (!host || typeof host.suspendHistory !== 'function') return;
      const suspension = await host.suspendHistory({ documentID: doc.id, name: t('3D preview (RPForge)') });
      try {
        for (const g of guides) g.visible = false;
        composite = await imaging.getPixels({ documentID: doc.id, componentSize: 8, applyAlpha: false, colorSpace: 'RGB', colorProfile: PROFILE, targetSize: { width: tw, height: th } });
      } finally {
        for (const g of guides) { try { g.visible = true; } catch {} }
        await host.resumeHistory(suspension, false);
      }
    }, { commandName: t('3D preview (RPForge)') });
  } catch { composite = null; }
  if (composite) await blit(composite, 1);
  else for (const layer of paintLayers(doc.layers)) { // fallback: plain pixel layers only
    try { await blit(await read({ layerID: layer.id }), (layer.opacity === undefined ? 100 : layer.opacity) / 100); } catch { /* empty or non-pixel layer */ }
  }
  return { rgba: out, width: tw, height: th };
}

let markedGuides = [];
async function markOnTexture(u, v) {
  const doc = activeDocument();
  if (!doc) throw new Error(t('no document open'));
  const x = Math.round(u * Number(doc.width)), y = Math.round(v * Number(doc.height));
  await core.executeAsModal(async () => {
    for (const g of markedGuides) { try { await g.delete(); } catch {} }
    markedGuides = [];
    const V = enumValue('Direction', 'VERTICAL', 'vertical'), Hz = enumValue('Direction', 'HORIZONTAL', 'horizontal');
    markedGuides.push(await doc.guides.add(V, x), await doc.guides.add(Hz, y));
  }, { commandName: t('Mark point (RPForge)') });
  return `x ${x}, y ${y} px`;
}

let preview = null;
try {
  preview = require('./preview.js').createPreview({
    $, imaging, t, tr, numberLocale,
    getSession: () => state.session,
    getActiveLink: () => linkOf(activeDocument()),
    historyKey: () => { const d = activeDocument(); if (!d) return null; const h = d.activeHistoryState; return `${d.id}:${h && h.id !== undefined ? h.id : (d.historyStates ? d.historyStates.length : Date.now())}`; },
    readDocumentTexture, markOnTexture,
    // Photoshop tells the panel when the preview is shown or hidden; closed preview = no work.
    isVisible: () => { const v = typeof window !== 'undefined' ? window.rpforgeVisible : null; return !v || v.panelPreview === true; },
  });
} catch (e) { console.warn('preview', e); if (window.rpforgeReport) window.rpforgeReport(t('3D preview failed to load: {0}', e.message)); }

async function showPreviewPanel() {
  try {
    // Needs requiredPermissions.ipc.enablePluginCommunication in the manifest. The Marketplace build
    // has the ID Adobe's portal generated, so the ID comes from the running plugin.
    const plugins = uxp.pluginManager ? Array.from(uxp.pluginManager.plugins) : [];
    const own = window.rpforgePluginId || (uxp.entrypoints && uxp.entrypoints._pluginInfo && uxp.entrypoints._pluginInfo.id);
    const plugin = plugins.find(p => p.id === own) || plugins.find(p => p.id === 'dev.rpforge.texturestudio' || p.name === 'RPForge Texture Studio');
    if (plugin && plugin.showPanel) { await plugin.showPanel('texturestudio.preview'); if (preview) preview.redraw(); return; }
  } catch (e) { console.warn('showPanel', e); }
  message(t('Open it from Plugins › RPForge Texture Studio › 3D Preview.'), 'ok');
}

// ---------------------------------------------------------------- wiring
const safe = fn => () => fn().catch(e => message(friendly(e), 'error'));
$('openVehicle').addEventListener('click', safe(openModel));
$('openAnother').addEventListener('click', safe(openModel));
$('pickYft').addEventListener('click', safe(pickModel));
$('pickYtd').addEventListener('click', safe(pickTextures));
$('filter').addEventListener('input', renderList);
$('showAll').addEventListener('change', renderList);
$('saveBtn').addEventListener('click', () => saveDocument(false));
$('saveCopyBtn').addEventListener('click', () => saveDocument(true));
$('guideBtn').addEventListener('click', safe(toggleGuide));
$('previewBtn').addEventListener('click', safe(showPreviewPanel));
$('previewBtn2').addEventListener('click', safe(showPreviewPanel));
for (const id of ['ovShaded', 'ovNormal']) $(id).addEventListener('change', () => savePrefs({ [id]: $(id).checked }));
$('linkBtn').addEventListener('click', safe(linkActive));
$('optionsToggle').addEventListener('click', () => { const open = $('options').classList.contains('hidden'); show($('options'), open); $('optionsSign').textContent = open ? '−' : '+'; $('optionsToggle').classList.toggle('open', open); });
$('workSize').addEventListener('change', () => savePrefs({ workSize: $('workSize').value }));
$('backup').addEventListener('change', () => savePrefs({ backup: $('backup').checked }));

(function restorePrefs() {
  const p = loadPrefs();
  if (p.format) $('format').value = p.format;
  if (p.workSize) $('workSize').value = p.workSize;
  if (typeof p.backup === 'boolean') $('backup').checked = p.backup;
  for (const id of ['ovShaded', 'ovNormal']) if (typeof p[id] === 'boolean') $(id).checked = p[id];
})();

try { action.addNotificationListener(['select', 'open', 'close', 'make'], () => setTimeout(refreshDocument, 50)); } catch {}
setInterval(() => { if (!state.busy) refreshDocument(); }, 1500);
renderFiles();
refreshDocument();
