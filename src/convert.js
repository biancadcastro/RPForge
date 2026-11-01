import { readFile, readdir, lstat, mkdir, writeFile, rename, rm, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { readRpf, LIMITS, safeName } from './rpf.js';
import { renameSpawns } from './spawns.js';

const META = {
  'handling.meta': ['HANDLING_FILE', 'CHandlingDataMgr'],
  'vehicles.meta': ['VEHICLE_METADATA_FILE', 'CVehicleModelInfo__InitDataList'],
  'carcols.meta': ['CARCOLS_FILE', 'CVehicleModelInfoVarGlobal'],
  'carvariations.meta': ['VEHICLE_VARIATION_FILE', 'CVehicleModelInfoVariation'],
  'vehiclelayouts.meta': ['VEHICLE_LAYOUTS_FILE', 'CVehicleMetadataMgr'],
  'dlctext.meta': ['TEXTFILE_METAFILE', 'CExtraTextMetaFile'],
  'caraddoncontentunlocks.meta': ['CONTENT_UNLOCKING_META_FILE', 'SContentUnlocks'],
};
const STREAM = new Set(['.yft', '.ytd', '.ydr', '.ydd', '.ybn', '.ycd']);
const ADMIN = new Set(['content.xml', 'setup2.xml']);

export function resourceName(input) {
  return input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'vehicle_addon';
}

export async function convertArchive(archive, options = {}) {
  const stat = await lstat(archive);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMITS.archiveBytes) throw new Error('RPF inválido, link ou maior que 512 MiB.');
  let files = new Map();
  const metas = [];
  const skipped = [];
  const models = new Set();
  const declaredModels = new Set();
  function add(destination, data) {
    const key = destination.toLowerCase();
    if (files.has(key)) {
      if (!files.get(key).data.equals(data)) throw new Error(`Arquivos diferentes usam o mesmo destino: ${destination}`);
      return;
    }
    files.set(key, { destination, data });
  }
  for (const entry of readRpf(await readFile(archive))) {
    const basename = path.posix.basename(entry.path).toLowerCase();
    const ext = path.posix.extname(basename);
    if (STREAM.has(ext)) {
      if (!entry.data.length) throw new Error(`Asset vazio: ${entry.path}`);
      add(`stream/${basename}`, entry.data);
      if (ext === '.yft' && !basename.endsWith('_hi.yft')) models.add(basename.slice(0, -4));
    } else if (META[basename]) {
      const [type, expectedRoot] = META[basename];
      const errors = [];
      const xml = entry.data.toString('utf8').replace(/^\uFEFF/, '');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(`Declaração XML externa não suportada: ${entry.path}`);
      let doc;
      try { doc = new DOMParser({ onError: (level, message) => errors.push(message) }).parseFromString(xml, 'text/xml'); }
      catch { throw new Error(`XML inválido: ${entry.path}`); }
      if (errors.length || doc.documentElement?.tagName !== expectedRoot) throw new Error(`XML inválido ou raiz inesperada: ${entry.path}`);
      if (basename === 'vehicles.meta') {
        for (const element of Array.from(doc.getElementsByTagName('modelName'))) {
          const model = element.textContent.trim().toLowerCase();
          if (!/^[a-z0-9_]+$/.test(model)) throw new Error(`Nome de modelo inválido em ${entry.path}`);
          if (declaredModels.has(model)) throw new Error(`Modelo declarado mais de uma vez: ${model}`);
          declaredModels.add(model);
        }
      }
      const destination = `data/${basename}`;
      add(destination, entry.data);
      metas.push({ type, destination, basename, doc });
    } else if (!ADMIN.has(basename)) {
      skipped.push(entry.path);
    }
  }
  if (!models.size || !metas.some(m => m.type === 'VEHICLE_METADATA_FILE')) throw new Error('Não foi encontrado um addon de veículo com YFT base e vehicles.meta.');
  if (!declaredModels.size) throw new Error('vehicles.meta não declara nenhum modelName.');
  for (const model of declaredModels) {
    if (!models.has(model)) throw new Error(`YFT base ausente para o modelo declarado: ${model}`);
  }
  // Unknown game data may require extra manifest declarations: never silently call that ready.
  const blocking = skipped.filter(p => /\.(meta|ymt|rel|awc|ymap|ytyp)$/i.test(p));
  if (blocking.length) throw new Error(`Pacote requer suporte adicional para: ${blocking.join(', ')}`);
  const requested = options.chooseSpawns ? await options.chooseSpawns({ archive: path.basename(archive), models: [...declaredModels].sort() }) : options.spawns;
  const renamed = renameSpawns(files, metas, declaredModels, requested);
  files = renamed.files;
  const finalModels = renamed.models;
  const name = safeName(finalModels.length === 1 ? finalModels[0] : `${finalModels[0]}_pack`);
  const output = path.join(path.dirname(archive), name);
  try { await lstat(output); throw new Error(`Destino já existe: ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const manifest = ['-- Convertido com RPF Forge', "fx_version 'cerulean'", "game 'gta5'", '', 'files {', ...metas.map(m => `    '${m.destination}',`), '}', '', ...metas.map(m => `data_file '${m.type}' '${m.destination}'`), ''].join('\n');
  add('fxmanifest.lua', Buffer.from(manifest));
  const stage = await mkdtemp(path.join(path.dirname(archive), '.rpf-to-fivem-'));
  try {
    for (const { destination, data } of files.values()) {
      const target = path.join(stage, destination);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data, { flag: 'wx' });
    }
    // A second existence check also avoids accidental replacement of an empty output directory.
    try { await lstat(output); throw new Error(`Destino já existe: ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rename(stage, output);
  } catch (error) {
    // Only remove this invocation's staging directory, never the source or a previous addon.
    if (path.dirname(stage) !== path.dirname(archive) || !path.basename(stage).startsWith('.rpf-to-fivem-')) throw error;
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
  return { output, resource: path.basename(output), models: finalModels, skipped };
}

export async function convertFolder(folder, options = {}) {
  const root = path.resolve(folder);
  if (!(await lstat(root)).isDirectory()) throw new Error('Selecione uma pasta real, sem link.');
  const archives = (await readdir(root, { withFileTypes: true })).filter(e => e.isFile() && e.name.toLowerCase().endsWith('.rpf')).sort((a, b) => a.name.localeCompare(b.name));
  if (!archives.length) throw new Error('Nenhum .rpf diretamente nesta pasta.');
  const results = [];
  for (const archive of archives) {
    try { results.push({ archive: archive.name, ok: true, ...await convertArchive(path.join(root, archive.name), options) }); }
    catch (error) { results.push({ archive: archive.name, ok: false, error: error.message }); }
  }
  return results;
}
