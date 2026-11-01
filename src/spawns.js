import path from 'node:path';
import { XMLSerializer } from '@xmldom/xmldom';
import { safeName } from './rpf.js';

export function validateSpawn(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error('Use um spawn com 1 a 63 caracteres: letras minúsculas, números e _, começando com uma letra.');
  }
  return safeName(value);
}

const elements = (node, tag) => Array.from(node.getElementsByTagName(tag));
const direct = (node, tag) => Array.from(node.childNodes).find(n => n.nodeType === 1 && n.tagName === tag);
const text = node => node?.textContent.trim() ?? '';
const key = node => text(node).toLowerCase();

/** Rename only references with known semantics. Never patch binary texture/material names. */
export function renameSpawns(files, metas, models, requested = {}) {
  if (!requested || typeof requested !== 'object' || Array.isArray(requested)) throw new Error('Mapa de spawns inválido.');
  const renames = new Map();
  for (const [old, next] of Object.entries(requested)) {
    if (!models.has(old)) throw new Error(`Spawn de origem não encontrado: ${old}`);
    validateSpawn(next);
    if (old !== next) renames.set(old, next);
  }
  const finalModels = [...models].map(m => renames.get(m) ?? m);
  if (new Set(finalModels).size !== finalModels.length) throw new Error('Dois carros não podem usar o mesmo spawn.');
  if (!renames.size) return { files, models: finalModels.sort() };

  const records = metas.filter(m => m.basename === 'vehicles.meta').flatMap(m =>
    elements(m.doc, 'InitDatas').flatMap(list => Array.from(list.childNodes).filter(n => n.nodeType === 1 && n.tagName === 'Item')));
  const textures = new Map();
  const handling = new Map();
  function linked(map, tag, exists) {
    const groups = new Map();
    for (const record of records) {
      const name = key(direct(record, 'modelName'));
      const reference = key(direct(record, tag));
      if (!reference || !exists(reference)) continue;
      const owners = groups.get(reference) ?? [];
      owners.push(name); groups.set(reference, owners);
    }
    for (const [reference, owners] of groups) {
      // Shared dictionaries/handling stay shared when any owner keeps its name.
      if (owners.some(owner => !renames.has(owner))) continue;
      map.set(reference, renames.get(owners[0]));
    }
  }
  linked(textures, 'txdName', name => files.has(`stream/${name}.ytd`));
  const usedDictionaries = new Set(records.map(r => key(direct(r, 'txdName'))));
  const definedHandling = new Set(metas.filter(m => m.basename === 'handling.meta').flatMap(m => elements(m.doc, 'handlingName').map(key)));
  linked(handling, 'handlingId', name => definedHandling.has(name));

  const orderedModels = [...models].sort((a, b) => b.length - a.length);
  function modelStem(stem) {
    const owner = orderedModels.find(old => stem === old || stem.startsWith(`${old}_`) || stem.startsWith(`${old}+`));
    return owner && renames.has(owner) ? renames.get(owner) + stem.slice(owner.length) : stem;
  }
  function reference(value) {
    const lower = value.toLowerCase();
    // Modkit labels can have a numeric id before the model; keep that id unchanged.
    const match = /^(\d+_)(.*)$/.exec(lower);
    return match ? match[1] + modelStem(match[2]) : modelStem(lower);
  }
  const changed = new Map();
  const textureStem = stem => textures.get(stem) ?? (usedDictionaries.has(stem) ? stem : modelStem(stem));
  const assetStem = (stem, ext) => ext === '.ytd' ? textureStem(stem) : ['.yft', '.ydr'].includes(ext) ? modelStem(stem) : stem;
  function add(destination, data) {
    if (changed.has(destination.toLowerCase())) throw new Error(`A troca de spawn causaria conflito em ${destination}`);
    changed.set(destination.toLowerCase(), { destination, data });
  }
  for (const file of files.values()) {
    let destination = file.destination;
    if (destination.startsWith('stream/')) {
      const ext = path.posix.extname(destination);
      const stem = path.posix.basename(destination, ext);
      // Dedicated dictionaries may have a name different from the vehicle model.
      const renamed = assetStem(stem, ext);
      destination = `stream/${renamed}${ext}`;
    }
    add(destination, file.data);
  }
  const streamReferences = new Map();
  const dictionaryReferences = new Map();
  for (const file of files.values()) {
    if (!file.destination.startsWith('stream/')) continue;
    const ext = path.posix.extname(file.destination);
    const stem = path.posix.basename(file.destination, ext);
    if (ext === '.ytd') dictionaryReferences.set(stem, textureStem(stem));
    else streamReferences.set(stem, assetStem(stem, ext));
  }
  for (const meta of metas) {
    let dirty = false;
    const replace = (node, next) => {
      if (next && next !== key(node)) { node.textContent = next; dirty = true; }
    };
    for (const node of elements(meta.doc, 'modelName')) replace(node, renames.get(key(node)) ?? (meta.basename === 'carcols.meta' ? streamReferences.get(key(node)) : undefined));
    if (meta.basename === 'vehicles.meta') {
      for (const node of elements(meta.doc, 'txdName')) replace(node, dictionaryReferences.get(key(node)));
      for (const node of elements(meta.doc, 'handlingId')) replace(node, handling.get(key(node)));
      for (const node of elements(meta.doc, 'gameName')) replace(node, renames.get(key(node)));
      for (const node of elements(meta.doc, 'parent')) replace(node, dictionaryReferences.get(key(node)));
      for (const node of elements(meta.doc, 'child')) replace(node, dictionaryReferences.get(key(node)));
    }
    if (meta.basename === 'handling.meta') {
      for (const node of elements(meta.doc, 'handlingName')) replace(node, handling.get(key(node)));
    }
    if (['carcols.meta', 'carvariations.meta'].includes(meta.basename)) {
      for (const tag of ['kitName', 'visibleModName', 'linkedModels', 'kits']) {
        for (const node of elements(meta.doc, tag)) {
          // Only leaf values are replaced; nested XML and numeric kit ids are preserved.
          const leaves = node.childNodes.length && Array.from(node.childNodes).some(n => n.nodeType === 1)
            ? elements(node, 'Item').filter(n => !Array.from(n.childNodes).some(c => c.nodeType === 1)) : [node];
          for (const leaf of leaves) {
            const old = key(leaf);
            const next = streamReferences.get(old) ?? reference(old);
            replace(leaf, next);
          }
        }
      }
    }
    if (dirty) changed.set(meta.destination.toLowerCase(), { destination: meta.destination, data: Buffer.from(new XMLSerializer().serializeToString(meta.doc)) });
  }
  return { files: changed, models: finalModels.sort() };
}
