import path from 'node:path';
import { META, parseMeta, records, child, children, value, normalized } from './metadata.js';

/** Structural validation only. Built-in/external dependencies are warnings, never fabricated missing files. */
export function auditAddon(files) {
  const issues = [];
  const issue = (severity, code, file, message) => issues.push({ severity, code, file, message });
  const inventory = new Map();
  const docs = new Map();
  const streamed = new Map();
  for (const file of files.values()) {
    const key = file.destination.toLowerCase();
    if (inventory.has(key)) issue('error', 'DUPLICATE_PATH', file.destination, 'Dois arquivos usam o mesmo caminho.');
    inventory.set(key, file);
    if (!file.data.length) issue('error', 'EMPTY_FILE', file.destination, 'Arquivo vazio.');
    const basename = path.posix.basename(key);
    if (META[basename]) {
      try { docs.set(basename, parseMeta(file.data, basename)); }
      catch (error) { issue('error', 'INVALID_XML', file.destination, error.message); }
      if (key !== `data/${basename}`) issue('error', 'META_LAYOUT', file.destination, 'O meta deve ficar diretamente em data.');
    }
    if (key.startsWith('stream/')) {
      if (streamed.has(basename)) issue('error', 'STREAM_COLLISION', file.destination, `Nome de streaming repetido: ${basename}`);
      streamed.set(basename, file);
    }
  }
  function index(entries, field, label, filename) {
    const result = new Map();
    for (const entry of entries) {
      const name = normalized(child(entry, field));
      if (!name) { issue('error', 'EMPTY_IDENTIFIER', `data/${filename}`, `${label} sem ${field}.`); continue; }
      if (result.has(name)) issue('error', 'DUPLICATE_IDENTIFIER', `data/${filename}`, `${label} duplicado: ${name}`);
      result.set(name, entry);
    }
    return result;
  }
  const vehicles = index(records(docs.get('vehicles.meta'), 'InitDatas'), 'modelName', 'Veículo', 'vehicles.meta');
  const handling = index(records(docs.get('handling.meta'), 'HandlingData'), 'handlingName', 'Handling', 'handling.meta');
  const kits = index(records(docs.get('carcols.meta'), 'Kits'), 'kitName', 'Modkit', 'carcols.meta');
  const layouts = index(records(docs.get('vehiclelayouts.meta'), 'VehicleLayouts'), 'Name', 'Layout', 'vehiclelayouts.meta');
  index(records(docs.get('carvariations.meta'), 'variationData'), 'modelName', 'Variação', 'carvariations.meta');
  const kitIds = new Map();
  for (const [name, kit] of kits) {
    const id = child(kit, 'id')?.getAttribute('value');
    if (id) {
      if (!/^\d+$/.test(id)) issue('error', 'INVALID_KIT_ID', 'data/carcols.meta', `ID de modkit inválido em ${name}: ${id}`);
      if (kitIds.has(id) && kitIds.get(id) !== name) issue('error', 'KIT_ID_COLLISION', 'data/carcols.meta', `Os modkits ${kitIds.get(id)} e ${name} usam o mesmo ID ${id}.`);
      kitIds.set(id, name);
      if (/^\d+$/.test(id) && BigInt(id) > 65535n) issue('warning', 'LARGE_KIT_ID', 'data/carcols.meta', `O modkit ${name} usa um ID elevado (${id}); confira a compatibilidade no jogo.`);
    }
  }
  if (!vehicles.size) issue('error', 'NO_VEHICLES', 'data/vehicles.meta', 'Nenhum veículo declarado para converter.');
  for (const [model, entry] of vehicles) {
    if (!streamed.has(`${model}.yft`)) issue('error', 'MISSING_MODEL', 'data/vehicles.meta', `YFT base ausente: ${value(child(entry, 'modelName'))}`);
    const id = normalized(child(entry, 'handlingId'));
    if (id && !handling.has(id)) issue('warning', 'EXTERNAL_HANDLING', 'data/vehicles.meta', `${model}: handling ${id} não está no pacote; confirme a dependência do jogo ou de outro recurso.`);
    const txd = normalized(child(entry, 'txdName'));
    if (txd && !streamed.has(`${txd}.ytd`)) issue('warning', 'EXTERNAL_TEXTURES', 'data/vehicles.meta', `${model}: dicionário ${txd} sem YTD próprio; pode usar texturas embutidas ou compartilhadas.`);
    const layout = normalized(child(entry, 'layout'));
    if (layout && layouts.size && !layouts.has(layout)) issue('warning', 'EXTERNAL_LAYOUT', 'data/vehicles.meta', `${model}: layout ${layout} não está nas definições locais; confirme se é fornecido pelo jogo ou por outro recurso.`);
  }
  for (const item of records(docs.get('carvariations.meta'), 'variationData')) {
    const model = normalized(child(item, 'modelName'));
    if (!vehicles.has(model)) issue('error', 'VARIATION_MODEL_MISSING', 'data/carvariations.meta', `Variação aponta para veículo não declarado: ${model}`);
    for (const list of Array.from(item.getElementsByTagName('kits'))) {
      for (const kit of children(list).filter(n => n.tagName === 'Item')) {
        const name = normalized(kit);
        if (name && name !== '0_default_modkit' && !kits.has(name)) issue('error', 'MISSING_MODKIT', 'data/carvariations.meta', `${model}: modkit não encontrado no carcols: ${name}`);
      }
    }
  }
  const geometry = new Set([...streamed.keys()].filter(n => /\.(yft|ydr)$/.test(n)).map(n => n.slice(0, -4)));
  for (const tag of ['visibleMods', 'linkMods']) {
    for (const item of records(docs.get('carcols.meta'), tag)) {
      const model = normalized(child(item, 'modelName'));
      if (model && !geometry.has(model)) issue('error', 'MISSING_TUNING', 'data/carcols.meta', `Peça de tuning sem geometria: ${model}`);
    }
  }
  for (const list of Array.from(docs.get('carcols.meta')?.getElementsByTagName('linkedModels') ?? [])) {
    for (const node of Array.from(list.childNodes).filter(n => n.nodeType === 1 && n.tagName === 'Item')) {
      const model = normalized(child(node, 'modelName')) || normalized(node);
      if (model && !geometry.has(model)) issue('error', 'MISSING_LINKED_MODEL', 'data/carcols.meta', `Modelo vinculado sem geometria: ${model}`);
    }
  }
  const manifestFile = inventory.get('fxmanifest.lua');
  if (!manifestFile) issue('error', 'MISSING_MANIFEST', 'fxmanifest.lua', 'Manifest ausente.');
  else {
    const manifest = manifestFile.data.toString('utf8').replace(/--[^\r\n]*/g, '');
    if (!/fx_version\s+['"]cerulean['"]/.test(manifest) || !/game\s+['"]gta5['"]/.test(manifest)) issue('error', 'INVALID_MANIFEST', 'fxmanifest.lua', 'Manifest sem fx_version cerulean ou game gta5.');
    const declarations = [...manifest.matchAll(/data_file\s+['"]([^'"]+)['"]\s+['"]([^'"]+)['"]/g)].map(m => ({ type: m[1], path: m[2].toLowerCase() }));
    const listed = new Set([...manifest.matchAll(/files\s*\{([^}]*)\}/g)].flatMap(m => [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1].toLowerCase())));
    for (const declaration of declarations) {
      if (!inventory.has(declaration.path)) issue('error', 'MANIFEST_MISSING_FILE', 'fxmanifest.lua', `Manifest aponta para arquivo ausente: ${declaration.path}`);
      if (!listed.has(declaration.path)) issue('error', 'MANIFEST_UNLISTED_FILE', 'fxmanifest.lua', `Meta fora da lista files: ${declaration.path}`);
    }
    for (const listedPath of listed) {
      if (!inventory.has(listedPath)) issue('error', 'MANIFEST_MISSING_FILE', 'fxmanifest.lua', `A lista files aponta para arquivo ausente: ${listedPath}`);
    }
    for (const [basename] of docs) {
      const expected = `data/${basename}`;
      if (!declarations.some(d => d.path === expected && d.type === META[basename][0])) issue('error', 'META_NOT_REGISTERED', 'fxmanifest.lua', `Meta sem registro correto: ${expected}`);
    }
  }
  const assets = [...inventory.values()].filter(f => f.destination.toLowerCase().startsWith('stream/')).map(file => ({ path: file.destination, diskBytes: file.data.length, kind: /\.ytd$/i.test(file.destination) ? 'Textura' : /\.(yft|ydr)$/i.test(file.destination) ? 'Modelo' : 'Outro' })).sort((a, b) => b.diskBytes - a.diskBytes || a.path.localeCompare(b.path));
  return { ok: !issues.some(i => i.severity === 'error'), errors: issues.filter(i => i.severity === 'error').length, warnings: issues.filter(i => i.severity === 'warning').length, issues, models: [...vehicles.keys()], diskBytes: assets.reduce((n, f) => n + f.diskBytes, 0), assets };
}
