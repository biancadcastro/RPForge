// RPForge Texture Studio — Photoshop panel.
// Paints textures of GTA V models (vehicles .yft, clothing .ydd, props .ydr + .ytd) and of
// any .obj model (+ .mtl and its images), with a UV guide drawn from the model.
// Uses RPForge's own engine (./engine). Everything runs inside Photoshop: no server,
// no external program, nothing leaves the computer.
const { app, core, action, imaging, constants } = require('photoshop');
const uxp = require('uxp');
const fs = uxp.storage.localFileSystem;
const formats = uxp.storage.formats;
let engine;
try { engine = require('./engine/index.js'); }
catch (e) { if (window.rpforgeReport) window.rpforgeReport('motor não carregou: ' + (e && e.message)); throw e; }

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
    if (entrypoints && entrypoints.setup) entrypoints.setup({ panels: {
      'texturestudio.panel': { create: attach('panelMain'), show: attach('panelMain') },
      'texturestudio.preview': { create: attach('panelPreview'), show: attach('panelPreview', () => preview && preview.shown()), hide: () => { (window.rpforgeVisible = window.rpforgeVisible || {}).panelPreview = false; } },
    } });
  } catch (e) { console.warn('panels', e); }
})();

const PROFILE = 'sRGB IEC61966-2.1';
const GUIDE_PREFIX = 'Guia UV';
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
  el.textContent = text || '';
  el.className = 'message' + (kind ? ' ' + kind : '');
  show(el, !!text);
}
function progress(value, text) {
  show($('progress'), value !== null);
  if (value === null) return;
  $('progressBar').style.width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  $('progressText').textContent = text || '';
}
const baseName = p => (p || '').split(/[\\/]/).pop();
const stem = name => name.replace(/\.[^.]+$/, '');
const ext = name => (/\.([^.]+)$/.exec(name) || [, ''])[1].toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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
  if (/permission|denied|not allowed/i.test(text)) return 'O Photoshop não permitiu acessar o arquivo. Escolha o arquivo de novo pelo botão do painel.';
  return text;
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
  }, { commandName: 'Lembrar modelo (RPForge)' });
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
      message(`Este documento pinta ${link.texture} de ${src.model.name}, mas o modelo não está mais em ${src.model.path}. Abra-o pelo painel para continuar.`, 'error');
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
  message(`Documento de ${link.texture} reaberto: ${what} foi carregado de novo. É só continuar pintando e salvar.`, 'ok');
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
  await run('Lendo o modelo', async () => {
    progress(0.1, 'Lendo arquivos');
    if (state.kind === 'obj') return loadObj();
    const modelBytes = state.model ? await readBytes(state.model) : null;
    const model = modelBytes ? { kind: state.kind, bytes: modelBytes } : null;
    state.parsed = null;
    if (discover && state.model) state.dicts = await discoverDictionaries(model);
    progress(0.5, 'Lendo texturas');
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
  progress(0.5, 'Lendo UVs');
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
  if (m) info.push(state.kind === 'obj' ? plural(m.triangles, 'triângulo', 'triângulos') : plural(m.geometries, 'peça', 'peças'));
  info.push(plural(own, 'textura', 'texturas'));
  if (liveries) info.push(plural(liveries, 'livery', 'liveries'));
  let note = '';
  if (state.kind !== 'obj' && !state.dicts.length) note = state.session.model ? ' Abra também o .ytd para poder salvar.' : '';
  $('vehicleInfo').textContent = info.join(' · ') + '.' + note;
  renderFiles();
  show($('step2'), true);
  renderList();
  message(liveries ? 'Pronto. A livery está no topo da lista.' : 'Pronto. Escolha a textura que quer pintar.', 'ok');
  if (preview) preview.sessionChanged();
}

const KIND_LABEL = { yft: 'Veículo', ydr: 'Objeto', ydd: 'Roupa / peça', obj: 'Modelo OBJ', ytd: 'Modelo' };
function renderFiles() {
  const loaded = !!(state.model || state.dicts.length);
  show($('vehicleEmpty'), !loaded);
  show($('vehicleLoaded'), loaded);
  $('modelKind').textContent = KIND_LABEL[state.kind] || 'Modelo';
  $('yftName').textContent = state.model ? state.model.name : 'não aberto';
  $('yftName').title = state.model ? state.model.nativePath || '' : '';
  let textures;
  if (state.kind === 'obj') textures = state.images.size ? [...state.images.values()].map(e => e.name).join(', ') : 'nenhuma imagem encontrada';
  else textures = state.dicts.length ? state.dicts.map(d => d.name).join(', ') : 'nenhum .ytd encontrado';
  $('ytdName').textContent = textures;
  $('ytdName').title = textures;
}

// ---------------------------------------------------------------- texture list
function originOf(t) {
  if (state.kind === 'obj') return state.images.has(t.name.toLowerCase()) ? 'image' : 'new-image';
  return t.origin;
}
function describe(t) {
  const parts = [];
  if (t.livery) parts.push('Livery');
  const origin = originOf(t);
  if (origin === 'embedded') parts.push('dentro do modelo');
  else if (origin === 'missing') parts.push('ainda não existe no YTD');
  else if (origin === 'game') parts.push('do jogo (não fica neste arquivo)');
  else if (origin === 'image') parts.push(state.images.get(t.name.toLowerCase()).name);
  else if (origin === 'new-image') parts.push('sem imagem: começa em branco');
  if (t.width) parts.push(`${t.width}×${t.height}`);
  if (t.uvs.length && state.kind !== 'obj') parts.push(plural(t.uvs[0].geometries, 'peça', 'peças'));
  return parts.join(' · ');
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
  const groups = [['Liveries', items.filter(t => t.livery)], [state.kind === 'obj' ? 'Materiais' : 'Texturas do modelo', items.filter(t => !t.livery && t.origin !== 'game')], ['Do jogo', items.filter(t => !t.livery && t.origin === 'game')]];
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = q ? 'Nenhuma textura com esse nome.' : 'Nenhuma textura para mostrar. Marque "Mostrar todas as texturas".';
    list.appendChild(empty);
  }
  for (const [title, group] of groups) {
    if (!group.length) continue;
    const head = document.createElement('div');
    head.className = 'group'; head.textContent = title;
    list.appendChild(head);
    // Paintable textures first, read-only ones (inside the model) after.
    group.sort((a, b) => (a.origin === 'embedded') - (b.origin === 'embedded') || (b.livery - a.livery));
    for (const t of group) {
      const row = document.createElement('div');
      row.className = 'item' + (t.livery ? ' livery' : '');
      const info = document.createElement('div'); info.className = 'info';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = t.name;
      const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = describe(t);
      info.appendChild(name); info.appendChild(meta);
      const open = asButton(document.createElement('div'));
      open.className = 'btn small'; open.textContent = 'Abrir';
      open.disabled = t.origin === 'game';
      open.addEventListener('click', () => openTexture(t.name));
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
const isGuide = layer => typeof layer.name === 'string' && layer.name.startsWith(GUIDE_PREFIX);

async function newDocument(name, width, height) {
  return app.documents.add({
    width, height, resolution: 72, name,
    mode: enumValue('NewDocumentMode', 'RGB', 'RGBColorMode'),
    fill: enumValue('DocumentFill', 'TRANSPARENT', 'transparent'),
  });
}

// Adds the "Pintura" layer and the UV guides on top of whatever the document holds.
async function addWorkLayers(doc, t, width, height, guides) {
  const paint = await doc.createPixelLayer({ name: 'Pintura' });
  // Optional overlays like Photoshop 2020's 3D "Create UV Overlays" (hidden; turn on in Layers).
  const channel = t.recommendedChannel === null ? 0 : t.recommendedChannel;
  for (const [id, kind, label] of [['ovShaded', 'shaded', 'sombreado'], ['ovNormal', 'normal', 'mapa normal']]) {
    if (!$(id).checked || !state.session || !state.session.model || !t.uvs.length) continue;
    try {
      const o = state.session.overlay(t.name, channel, kind, width, height);
      const layer = await doc.createPixelLayer({ name: `${GUIDE_PREFIX} ${label} (não é salvo)` });
      await putLayerPixels(doc, layer, o.rgba, width, height);
      layer.visible = false;
      try { layer.allLocked = true; } catch {}
    } catch (e) { console.warn('overlay', e); }
  }
  for (const g of guides) {
    const layer = await doc.createPixelLayer({ name: `${GUIDE_PREFIX} ${g.channel} (não é salvo)`, opacity: 90 });
    await putLayerPixels(doc, layer, g.rgba, width, height);
    layer.visible = g.channel === t.recommendedChannel;
    try { layer.allLocked = true; } catch {}
  }
  try { paint.selected = true; } catch {}
}

async function drawGuides(name, t, width, height) {
  const guides = [];
  for (const u of t.uvs) {
    progress(0.2 + 0.2 * guides.length, `Desenhando guia UV${u.channel}`);
    await sleep(0);
    guides.push({ channel: u.channel, ...state.session.guide(name, u.channel, width, height) });
  }
  return guides;
}

async function openTexture(name) {
  const t = state.session.textures().find(x => x.name === name);
  if (state.kind === 'obj') return openImageTexture(t);
  await run(`Abrindo ${name}`, async () => {
    const { width, height } = canvasSize(name);
    progress(0.1, 'Lendo pixels');
    await sleep(0);
    const px = state.session.pixels(name);
    const base = px ? engine.resize(px.rgba, px.width, px.height, width, height) : null;
    const guides = await drawGuides(name, t, width, height);
    let docId = null;
    await core.executeAsModal(async () => {
      progress(0.6, 'Criando documento');
      const doc = await newDocument(`${name} (RPForge)`, width, height);
      const original = doc.layers[0];
      original.name = 'Textura original';
      if (base) await putLayerPixels(doc, original, base, width, height);
      progress(0.75, 'Criando camadas');
      await addWorkLayers(doc, t, width, height, guides);
      docId = doc.id;
    }, { commandName: 'Abrir textura (RPForge)' });
    // Save target: the .ytd the texture came from, or the first one for new textures.
    if (t.origin === 'embedded' && state.model) {
      await setLink(docId, {
        kind: 'model', modelKind: state.kind, texture: name, path: state.model.nativePath, token: await tokenFor(state.model), file: state.model.name,
        editable: true, origin: 'embedded', guideChannel: t.recommendedChannel, size: `${t.width}×${t.height}`,
      });
      finishOpen(t, width, height, guides, !base);
      if (preview) preview.linkChanged();
      return;
    }
    const target = state.dicts.find(d => d.name === t.source) || state.dicts[0] || null;
    await setLink(docId, {
      kind: 'ytd', texture: name, path: target ? target.nativePath : null, token: await tokenFor(target), file: target ? target.name : null,
      editable: t.editable && !!target, origin: t.origin, guideChannel: t.recommendedChannel,
    });
    finishOpen(t, width, height, guides, !base);
    if (preview) preview.linkChanged();
  });
}

async function openImageTexture(t) {
  const image = state.images.get(t.name.toLowerCase()) || null;
  await run(`Abrindo ${t.name}`, async () => {
    let docId = null, width = 0, height = 0, guides = [];
    if (image && /\.(png|jpe?g)$/i.test(image.name)) {
      await core.executeAsModal(async () => {
        progress(0.2, 'Abrindo a imagem');
        const doc = await app.open(image);
        width = Math.round(Number(doc.width)); height = Math.round(Number(doc.height));
        try { doc.layers[doc.layers.length - 1].name = 'Textura original'; } catch {}
        guides = await drawGuides(t.name, t, width, height);
        progress(0.75, 'Criando camadas');
        await addWorkLayers(doc, t, width, height, guides);
        docId = doc.id;
      }, { commandName: 'Abrir textura (RPForge)' });
    } else {
      ({ width, height } = canvasSize(t.name));
      guides = await drawGuides(t.name, t, width, height);
      await core.executeAsModal(async () => {
        const doc = await newDocument(`${t.name} (RPForge)`, width, height);
        doc.layers[0].name = 'Fundo';
        await addWorkLayers(doc, t, width, height, guides);
        docId = doc.id;
      }, { commandName: 'Abrir textura (RPForge)' });
    }
    await setLink(docId, {
      kind: 'image', texture: t.name, path: image ? image.nativePath : null, token: await tokenFor(image), file: image ? image.name : null,
      folder: state.model ? state.model.nativePath : null, editable: true, origin: image ? 'image' : 'new-image', guideChannel: 0,
    });
    finishOpen(t, width, height, guides, !image);
    if (preview) preview.linkChanged();
  });
}

function finishOpen(t, width, height, guides, empty) {
  const skipped = guides.reduce((n, g) => n + g.skipped, 0);
  const notes = [`${t.name} aberta em ${width}×${height}.`];
  if (t.livery) notes.push('O guia já está no layout da livery.');
  if (skipped) notes.push(`${skipped} triângulos de material repetido ficaram fora do guia.`);
  if (empty) notes.push('Não havia imagem para esta textura, então o documento começa em branco.');
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
  progress(0.9, 'Guardando cópia do original');
  let name = `${stem(entry.name)}.backup-${timestamp()}.${ext(entry.name)}`;
  try {
    const folder = await parentFolder(entry);
    if (!folder) throw new Error('pasta indisponível');
    await writeBytes(await folder.createFile(name, { overwrite: false }), bytes);
  } catch {
    const backup = await fs.getFileForSaving(name, { types: [ext(entry.name)] });
    if (!backup) throw new Error('Salvamento cancelado: a cópia do original não foi criada.');
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
  await run('Salvando no YTD', async () => {
    if (!link.editable) throw new Error(link.origin === 'embedded' ? 'Esta textura fica dentro do modelo. Por enquanto só texturas de um .ytd podem ser salvas.' : 'Abra o .ytd do modelo para poder salvar.');
    const entry = await entryFrom(link.path, link.token) || state.dicts.find(d => d.nativePath === link.path);
    if (!entry) throw new Error('Não encontrei o .ytd deste documento. Abra o modelo de novo no painel.');
    progress(0.05, 'Lendo o YTD');
    const original = await readBytes(entry);
    let pixels;
    await core.executeAsModal(async () => { pixels = await readComposite(doc); }, { commandName: 'Ler pixels (RPForge)' });
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
    progress(0.95, 'Gravando');
    await writeBytes(target, result.bytes);
    if (!asCopy) await refreshSession();
    const notes = [`Salvo em ${target.name}: ${link.texture} ${width}×${height}, ${engine.FORMATS[result.format].label}.`];
    if (result.added) notes.push('A textura foi adicionada ao arquivo.');
    if (format === 'DXT1' && result.format !== 'DXT1') notes.push('Havia transparência parcial, então foi usado DXT5.');
    if (backupName) notes.push(`Cópia do original: ${backupName}.`);
    message(notes.join(' '), 'ok');
  });
}

// Texture inside the model file (.ydd/.ydr/.yft): written in place, same size and format.
async function saveEmbedded(doc, link, asCopy) {
  await run('Salvando no modelo', async () => {
    const entry = await entryFrom(link.path, link.token) || (state.model && state.model.nativePath === link.path ? state.model : null);
    if (!entry) throw new Error('Não encontrei o arquivo do modelo. Abra-o de novo no painel.');
    progress(0.05, 'Lendo o modelo');
    const original = await readBytes(entry);
    let pixels;
    await core.executeAsModal(async () => { pixels = await readComposite(doc); }, { commandName: 'Ler pixels (RPForge)' });
    const result = await engine.replaceEmbeddedTexture(original, link.modelKind, link.texture, pixels.rgba, pixels.width, pixels.height, { onProgress: (v, text) => progress(v * 0.85, text) });
    let target = entry, backupName = null;
    if (asCopy) {
      target = await fs.getFileForSaving(entry.name, { types: [ext(entry.name)] });
      if (!target) return;
    } else backupName = await backupOnce(entry, original);
    progress(0.95, 'Gravando');
    await writeBytes(target, result.bytes);
    if (!asCopy) await refreshSession();
    const notes = [`Salvo em ${target.name}: ${link.texture} ${result.width}×${result.height}, ${engine.FORMATS[result.format].label}.`];
    if (result.resized) notes.push('Texturas dentro do modelo mantêm o tamanho original, então a imagem foi ajustada.');
    if (backupName) notes.push(`Cópia do original: ${backupName}.`);
    message(notes.join(' '), 'ok');
  });
}

async function saveImage(doc, link, asCopy) {
  await run('Salvando a imagem', async () => {
    let target = asCopy ? null : await entryFrom(link.path, link.token);
    if (target && !/\.(png|jpe?g)$/i.test(target.name)) target = null;
    if (!target) {
      target = await fs.getFileForSaving(`${link.file ? stem(link.file) : link.texture}.png`, { types: ['png', 'jpg'] });
      if (!target) return;
    }
    let backupName = null;
    if (!asCopy && link.path && target.nativePath === link.path) backupName = await backupOnce(target, await readBytes(target));
    progress(0.6, 'Gravando');
    await core.executeAsModal(async () => {
      const copy = await doc.duplicate(`${link.texture} (salvar)`);
      try {
        for (const layer of Array.from(copy.layers)) if (isGuide(layer)) { try { layer.allLocked = false; } catch {} await layer.delete(); }
        await copy.flatten();
        if (/\.jpe?g$/i.test(target.name)) await copy.saveAs.jpg(target, { quality: 12 }, true);
        else await copy.saveAs.png(target, { compression: 6 }, true);
      } finally { await copy.closeWithoutSaving(); app.activeDocument = doc; }
    }, { commandName: 'Salvar textura (RPForge)' });
    if (!link.path) await setLink(doc.id, { ...link, path: target.nativePath, token: await tokenFor(target), file: target.name, origin: 'image' });
    message(`Salvo em ${target.name}.` + (backupName ? ` Cópia do original: ${backupName}.` : ''), 'ok');
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
  if (!guides.length) return message('Este documento não tem guia de UV.', 'error');
  const link = linkOf(doc);
  const preferred = guides.find(g => link && g.name.startsWith(`${GUIDE_PREFIX} ${link.guideChannel} `)) || guides[0];
  await core.executeAsModal(async () => {
    const anyVisible = guides.some(g => g.visible);
    for (const g of guides) {
      const locked = g.allLocked;
      if (locked) g.allLocked = false;
      g.visible = !anyVisible && g === preferred;
      if (locked) g.allLocked = true;
    }
  }, { commandName: 'Guia de UV (RPForge)' });
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
  const where = link.file || (link.kind === 'image' ? 'uma imagem nova (você escolhe onde)' : '—');
  const parts = [`Salva <b>${escapeHtml(link.texture)}</b> em <b>${escapeHtml(where)}</b>`];
  if (!link.editable) parts.push('Abra o .ytd do modelo para poder salvar.');
  if (link.kind === 'model') parts.push(`Fica dentro do modelo: salva no mesmo tamanho (${escapeHtml(link.size || '')}) e formato.`);
  $('docInfo').innerHTML = parts.join('<br/>');
  $('saveBtn').textContent = link.kind === 'image' ? 'Salvar imagem' : link.kind === 'model' ? 'Salvar no modelo' : 'Salvar no YTD';
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
  const t = state.session.textures().find(x => x.name === name);
  if (state.kind === 'obj') {
    const image = state.images.get(name.toLowerCase()) || null;
    await setLink(doc.id, { kind: 'image', texture: name, path: image ? image.nativePath : null, token: await tokenFor(image), file: image ? image.name : null, editable: true, origin: 'image', guideChannel: 0 });
  } else {
    const target = state.dicts.find(d => d.name === t.source) || state.dicts[0];
    await setLink(doc.id, { kind: 'ytd', texture: name, path: target.nativePath, token: await tokenFor(target), file: target.name, editable: true, origin: t.origin, guideChannel: t.recommendedChannel });
  }
  refreshDocument();
  message(`Documento ligado a ${name}. Agora é só salvar.`, 'ok');
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
    catch { let r; await core.executeAsModal(async () => { r = await get(); }, { commandName: 'Prévia 3D (RPForge)' }); return r; }
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
      const suspension = await host.suspendHistory({ documentID: doc.id, name: 'Prévia 3D (RPForge)' });
      try {
        for (const g of guides) g.visible = false;
        composite = await imaging.getPixels({ documentID: doc.id, componentSize: 8, applyAlpha: false, colorSpace: 'RGB', colorProfile: PROFILE, targetSize: { width: tw, height: th } });
      } finally {
        for (const g of guides) { try { g.visible = true; } catch {} }
        await host.resumeHistory(suspension, false);
      }
    }, { commandName: 'Prévia 3D (RPForge)' });
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
  if (!doc) throw new Error('nenhum documento aberto');
  const x = Math.round(u * Number(doc.width)), y = Math.round(v * Number(doc.height));
  await core.executeAsModal(async () => {
    for (const g of markedGuides) { try { await g.delete(); } catch {} }
    markedGuides = [];
    const V = enumValue('Direction', 'VERTICAL', 'vertical'), Hz = enumValue('Direction', 'HORIZONTAL', 'horizontal');
    markedGuides.push(await doc.guides.add(V, x), await doc.guides.add(Hz, y));
  }, { commandName: 'Marcar ponto (RPForge)' });
  return `x ${x}, y ${y} px`;
}

let preview = null;
try {
  preview = require('./preview.js').createPreview({
    $, imaging,
    getSession: () => state.session,
    getActiveLink: () => linkOf(activeDocument()),
    historyKey: () => { const d = activeDocument(); if (!d) return null; const h = d.activeHistoryState; return `${d.id}:${h && h.id !== undefined ? h.id : (d.historyStates ? d.historyStates.length : Date.now())}`; },
    readDocumentTexture, markOnTexture,
    // Photoshop tells the panel when the preview is shown or hidden; closed preview = no work.
    isVisible: () => { const v = typeof window !== 'undefined' ? window.rpforgeVisible : null; return !v || v.panelPreview === true; },
  });
} catch (e) { console.warn('preview', e); if (window.rpforgeReport) window.rpforgeReport('prévia 3D não carregou: ' + e.message); }

async function showPreviewPanel() {
  try {
    const plugin = uxp.pluginManager && Array.from(uxp.pluginManager.plugins).find(p => p.id === 'dev.rpforge.texturestudio');
    if (plugin && plugin.showPanel) { await plugin.showPanel('texturestudio.preview'); if (preview) preview.redraw(); return; }
  } catch {}
  message('Abra pelo menu Plugins › RPForge Texture Studio › Prévia 3D. Depois arraste a aba para o outro monitor.', 'ok');
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
$('optionsToggle').addEventListener('click', () => { const open = $('options').classList.contains('hidden'); show($('options'), open); $('optionsToggle').textContent = (open ? '▾' : '▸') + ' Opções'; });
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
