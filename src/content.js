import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { outputName } from './output.js';
import { buildYtyp, readDrawable } from './ytyp.js';

const STREAM = new Set(['.ydr', '.ydd', '.ytd', '.ybn', '.ycd', '.ymap', '.ytyp', '.ymt', '.yld']);
const ADMIN = new Set(['content.xml', 'setup2.xml', 'dlctext.meta']);
const METAS = {
  'gtxd.meta': ['GTXD_PARENTING_DATA', 'CMapParentTxds'],
  'interiorproxies.meta': ['INTERIOR_PROXY_ORDER_FILE', 'SInteriorOrderData'],
  'pedalternatevariations.meta': ['ALTERNATE_VARIATIONS_FILE', 'CPedAlternateVariations'],
  'peds.meta': ['PED_METADATA_FILE', 'CPedModelInfo__InitDataList'],
  'weaponarchetypes.meta': ['WEAPON_METADATA_FILE', 'CWeaponModelInfo__InitDataList'],
  'weaponcomponents.meta': ['WEAPONCOMPONENTSINFO_FILE', 'CWeaponComponentInfoBlob'],
};
const collectionName = name => /^mp_[mf]_freemode_01(?:_[a-z0-9_]+)?$/i.test(name);
const componentName = name => /^(?:head|berd|hair|uppr|lowr|hand|feet|teef|accs|task|decl|jbib|p_head|p_eyes|p_ears|p_lwrist|p_rwrist)_/i.test(name);
function xml(data, label) {
  const source = data.toString('utf8').replace(/^\uFEFF/, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error(`XML externo não suportado: ${label}`);
  const errors = [];
  let doc;
  try { doc = new DOMParser({ onError: (level, message) => errors.push(message) }).parseFromString(source, 'application/xml'); }
  catch { throw new Error(`XML inválido: ${label}`); }
  if (errors.length || !doc?.documentElement) throw new Error(`XML inválido: ${label}`);
  return doc;
}

/** No binary model edits, invented collection identifiers, or drawable renumbering. */
export function prepareContent(entries, archive, options, sourceHash, sourceBytes) {
  const files = new Map(), registrations = [], skipped = [], types = new Set(), issues = [];
  const ymts = new Set(entries.filter(e => /\.ymt$/i.test(e.path)).map(e => path.posix.basename(e.path, path.posix.extname(e.path)).toLowerCase()));
  const collections = new Set();
  const peds = new Set();
  for (const entry of entries.filter(e => path.posix.basename(e.path).toLowerCase() === 'peds.meta')) {
    const doc = xml(entry.data, entry.path);
    for (const item of Array.from(doc.getElementsByTagName('InitDatas')).flatMap(n => Array.from(n.childNodes)).filter(n => n.nodeType === 1 && n.tagName === 'Item')) {
      const name = Array.from(item.childNodes).find(n => n.nodeType === 1 && n.tagName === 'Name')?.textContent.trim();
      if (!name || !/^[a-z0-9_]+$/i.test(name)) throw new Error('Nome de ped inválido em peds.meta.');
      peds.add(name.toLowerCase());
    }
    if (!peds.size) throw new Error('peds.meta não declara nenhum ped.');
  }
  let clothing = false;
  function add(destination, data) {
    if (!/^[a-z0-9_./+^ -]+$/i.test(destination)) throw new Error(`Nome incompatível com manifest: ${destination}`);
    const key = destination.toLowerCase(), prior = files.get(key);
    if (prior && !prior.data.equals(data)) throw new Error(`Arquivos diferentes usam o mesmo destino: ${destination}`);
    if (!data.length) throw new Error(`Arquivo vazio: ${destination}`);
    files.set(key, prior || { destination, data });
  }
  function register(type, destination) { registrations.push({ type, destination }); }
  for (const entry of entries) {
    const basename = path.posix.basename(entry.path), lower = basename.toLowerCase(), ext = path.posix.extname(lower);
    if (ADMIN.has(lower)) { skipped.push(entry.path); continue; }
    if (STREAM.has(ext)) {
      let name = basename;
      const stem = basename.slice(0, -ext.length);
      const ancestor = entry.path.split('/').slice(0, -1).reverse().map(p => p.replace(/\.rpf$/i, '')).find(collectionName);
      const qualified = basename.includes('^') ? basename.split('^')[0] : null;
      if (qualified && collectionName(qualified)) { clothing = true; collections.add(qualified.toLowerCase()); }
      else if (['.ydd', '.ytd'].includes(ext) && componentName(basename)) {
        if (!ancestor) throw new Error(`Coleção de roupa não identificada: ${entry.path}. Preserve a pasta/RPF da coleção ou use coleção^arquivo.`);
        const dictionary = /^p_/i.test(basename) && !/_freemode_01_p(?:_|$)/i.test(ancestor) ? ancestor.replace(/_freemode_01/i, '_freemode_01_p') : ancestor;
        name = dictionary + '^' + basename; clothing = true; collections.add(dictionary.toLowerCase());
      }
      if (ext === '.ymt') {
        if (!collectionName(stem) && !peds.has(stem.toLowerCase())) throw new Error(`YMT requer suporte específico: ${entry.path}`);
        if (collectionName(stem)) { clothing = true; collections.add(stem.toLowerCase()); }
      }
      if (ext === '.ymap' || ext === '.ytyp') types.add('map');
      if (ext === '.ycd') types.add('animation');
      add('stream/' + name, entry.data);
      if (ext === '.ytyp') register('DLC_ITYP_REQUEST', 'stream/' + name);
      continue;
    }
    if (ext === '.meta') {
      const doc = xml(entry.data, entry.path), root = doc.documentElement.tagName;
      let type;
      if (root === 'ShopPedApparel') { type = 'SHOP_PED_APPAREL_META_FILE'; clothing = true; }
      else if (root === 'CWeaponInfoBlob') { type = 'WEAPONINFO_FILE_PATCH'; types.add('weapon'); }
      else if (METAS[lower] && root === METAS[lower][1]) type = METAS[lower][0];
      if (!type) throw new Error(`Meta requer suporte específico: ${entry.path} (${root}).`);
      add('data/' + basename, entry.data); register(type, 'data/' + basename); continue;
    }
    if (ext === '.rel') {
      const type = lower.endsWith('.dat151.rel') ? 'AUDIO_GAMEDATA' : lower.endsWith('.dat54.rel') ? 'AUDIO_SOUNDDATA' : null;
      if (!type) throw new Error(`Tipo de áudio REL requer suporte específico: ${entry.path}`);
      add('audioconfig/' + basename, entry.data); register(type, 'audioconfig/' + basename.slice(0, -4)); types.add('audio'); continue;
    }
    if (ext === '.awc') {
      const parts = entry.path.split('/'), sfx = parts.findIndex(p => p.toLowerCase() === 'sfx');
      const group = sfx >= 0 && parts.length > sfx + 2 ? parts[sfx + 1] : parts.slice(0, -1).reverse().map(p => p.replace(/\.rpf$/i, '')).find(p => /^dlc_/i.test(p));
      if (!group) throw new Error(`Pasta do wavepack não identificada: ${entry.path}. Preserve a estrutura sfx/nome_do_pacote.`);
      const directory = 'sfx/' + group;
      add(directory + '/' + basename, entry.data);
      if (!registrations.some(r => r.type === 'AUDIO_WAVEPACK' && r.destination.toLowerCase() === directory.toLowerCase())) register('AUDIO_WAVEPACK', directory);
      types.add('audio'); continue;
    }
    if (/\.(txt|md|jpg|jpeg|png|pdf)$/i.test(lower)) { skipped.push(entry.path); continue; }
    throw new Error(`Conteúdo requer suporte adicional para FiveM: ${entry.path}`);
  }
  if (!files.size) throw new Error('Nenhum conteúdo compatível com FiveM foi encontrado.');
  for (const ped of peds) {
    if (!files.has('stream/' + ped + '.ydd')) throw new Error(`Modelo YDD ausente para o ped: ${ped}`);
    if (!files.has('stream/' + ped + '.ymt')) throw new Error(`YMT ausente para o ped: ${ped}`);
    types.add('ped');
  }
  if (registrations.some(r => /^WEAPON/.test(r.type))) types.add('weapon');
  if (clothing) {
    types.add('clothing');
    for (const collection of collections) {
      const canonical = collection.replace(/_freemode_01_p(?=_|$)/i, '_freemode_01');
      if (!['mp_m_freemode_01', 'mp_f_freemode_01'].includes(canonical) && !ymts.has(canonical)) throw new Error(`Coleção addon sem YMT correspondente: ${canonical}.`);
    }
  }
  const drawables = [...files.values()].filter(f => /\.ydr$/i.test(f.destination));
  if (drawables.length && ![...files.values()].some(f => /\.ytyp$/i.test(f.destination)) && !types.has('weapon') && !peds.size && !clothing) {
    const siblings = new Set([...files.values()].map(f => path.posix.basename(f.destination).toLowerCase()));
    const models = drawables.map(f => readDrawable(f.data, path.posix.basename(f.destination)));
    for (let at = 0; at < models.length; at += 256) {
      const name = 'rpforge_archetypes_' + (at / 256 + 1), destination = 'stream/' + name + '.ytyp';
      add(destination, buildYtyp(models.slice(at, at + 256), name, siblings)); register('DLC_ITYP_REQUEST', destination);
    }
    types.add('map');
    issues.push({ severity: 'warning', code: 'GENERATED_ARCHETYPES', message: 'YTYPs básicos foram gerados para os modelos YDR. Portais, salas e entidades de MLO precisam vir no YTYP original; não são inventados pelo conversor.' });
  }
  if (!types.size) types.add('stream');
  const kind = [...types].sort().join('+');
  const base = path.basename(archive, path.extname(archive)).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'addon';
  const name = outputName(options.spawns?.[base] || base);
  const manifest = ['-- Convertido com RPF Forge', "fx_version 'cerulean'", "game 'gta5'", '', ...(types.has('map') ? ["this_is_a_map 'yes'"] : []), ...(clothing ? ["dependency '/policy:subdir_file_mapping'"] : []), '', 'files {', ...[...files.values()].map(f => `    '${f.destination}',`), '}', '', ...registrations.map(r => `data_file '${r.type}' '${r.destination}'`), ''].join('\n');
  add('fxmanifest.lua', Buffer.from(manifest));
  issues.push({ severity: 'warning', code: 'GAME_VALIDATION', message: 'Estrutura preparada para FiveM. Teste no servidor para verificar dependências do jogo e referências internas dos arquivos binários.' });
  if (clothing) issues.push({ severity: 'warning', code: 'CLOTHING_COLLECTION', message: 'Coleções, IDs e texturas preservados. A disponibilidade das roupas depende da política de streaming e do menu de aparência do servidor.' });
  const assets = [...files.values()].filter(f => /^(stream|sfx|audioconfig)\//.test(f.destination)).map(f => ({ path: f.destination, diskBytes: f.data.length, kind: path.posix.extname(f.destination).slice(1) }));
  const audit = { ok: true, errors: 0, warnings: issues.length, issues, assets, diskBytes: assets.reduce((sum, f) => sum + f.diskBytes, 0) };
  return { archive, files, metas: registrations, kind, defaultName: name, models: [name], originalModels: [base], skipped, removedTuning: [], audit, sourceHash, sourceBytes, mergedSources: 0 };
}
