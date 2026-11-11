import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { META, parseMeta, mergeMetadata, serializeXml, records, child, normalized } from './metadata.js';
import { auditAddon } from './audit.js';
import { writePlan } from './output.js';
import { readRpf, LIMITS, safeName } from './rpf.js';
import { renameSpawns } from './spawns.js';
import { organizeTuning, cleanMissingTuning } from './tuning.js';
import { prepareContent } from './content.js';
import { formatUserError } from './user-error.js';

const STREAM = new Set(['.yft', '.ytd', '.ydr', '.ydd', '.ybn', '.ycd']);
const ADMIN = new Set(['content.xml', 'setup2.xml']);
const IGNORED = new Set(['dlctext.meta', 'shopdata.meta', 'shop_vehicle.meta']);

export function resourceName(input) {
  return input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'vehicle_addon';
}

export async function prepareArchive(archive, options = {}) {
  const stat = await lstat(archive);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Selecione um arquivo RPF regular.');
  if (stat.size > LIMITS.archiveBytes) throw new Error(`RPF de ${(stat.size / 1048576).toFixed(1)} MiB acima do limite de ${LIMITS.archiveBytes / 1048576} MiB.`);
  let files = new Map();
  const metas = [];
  const skipped = [];
  const models = new Set();
  const declaredModels = new Set();
  let mergedSources = 0;
  const source = await readFile(archive);
  const sourceHash = createHash('sha256').update(source).digest('hex');
  if (options.expectedSource && options.expectedSource !== sourceHash) throw new Error('O RPF mudou desde a prévia. Analise novamente antes de converter.');
  const readState = { bytes: 0, entries: 0 };
  const entries = [...readRpf(source, '', readState)];
  const ignoredArchives = readState.ignoredArchives ?? [];
  const ignoredWarnings = [
    ...ignoredArchives.map(file => ({ severity: 'warning', code: 'IGNORED_INNER_ARCHIVE', file, message: `O pacote interno ${path.posix.basename(file)} está vazio ou ilegível e foi ignorado.` })),
    ...(readState.duplicateArchives ?? []).map(item => ({ severity: 'warning', code: 'DUPLICATE_INNER_ARCHIVE', file: item.path, message: `O pacote interno ${item.path} é uma cópia idêntica de ${item.original} e foi lido uma vez só.` })),
  ];
  // When nothing usable is found, say that an ignored inner package may have been the source.
  const ignoredNote = ignoredArchives.length ? ` ${ignoredArchives.length === 1 ? 'O pacote interno ' + path.posix.basename(ignoredArchives[0]) + ' estava vazio ou ilegível e foi ignorado' : 'Os pacotes internos ' + ignoredArchives.map(file => path.posix.basename(file)).join(', ') + ' estavam vazios ou ilegíveis e foram ignorados'}; se o conteúdo estava nele, o RPF de origem está danificado.` : '';
  if (!entries.some(e => path.posix.basename(e.path).toLowerCase() === 'vehicles.meta')) {
    let plan;
    try { plan = prepareContent(entries, archive, options, sourceHash, stat.size); }
    catch (error) { if (ignoredNote && !error.code) error.message += ignoredNote; throw error; }
    plan.audit.issues.push(...ignoredWarnings);
    plan.audit.warnings += ignoredWarnings.length;
    return plan;
  }
  function add(destination, data) {
    const key = destination.toLowerCase();
    if (files.has(key)) {
      if (!files.get(key).data.equals(data)) throw new Error(`Arquivos diferentes usam o mesmo destino: ${destination}`);
      return;
    }
    files.set(key, { destination, data });
  }
  options.onProgress?.({ phase: 'read', label: path.basename(archive), current: 0, total: 1 });
  for (const entry of entries) {
    const basename = path.posix.basename(entry.path).toLowerCase();
    const ext = path.posix.extname(basename);
    if (IGNORED.has(basename)) { skipped.push(entry.path); continue; }
    if (STREAM.has(ext)) {
      if (!entry.data.length) throw new Error(`Asset vazio: ${entry.path}`);
      add(`stream/${basename}`, entry.data);
      if (ext === '.yft' && !basename.endsWith('_hi.yft')) models.add(basename.slice(0, -4));
    } else if (META[basename]) {
      const [type] = META[basename];
      const doc = parseMeta(entry.data, basename);
      const destination = `data/${basename}`;
      const previous = metas.find(meta => meta.basename === basename);
      if (previous) {
        mergeMetadata(previous.doc, doc, basename);
        files.set(destination, { destination, data: serializeXml(previous.doc) });
        mergedSources++;
      } else {
        add(destination, entry.data);
        metas.push({ type, destination, basename, doc });
      }
    } else if (!ADMIN.has(basename)) {
      skipped.push(entry.path);
    }
  }
  for (const item of records(metas.find(m => m.basename === 'vehicles.meta')?.doc, 'InitDatas')) {
    const model = normalized(child(item, 'modelName'));
    if (!/^[a-z0-9_]+$/.test(model)) throw new Error(`Nome de modelo inválido: ${model}`);
    if (declaredModels.has(model)) throw new Error(`Modelo declarado mais de uma vez: ${model}`);
    declaredModels.add(model);
  }
  if (!models.size || !metas.some(m => m.type === 'VEHICLE_METADATA_FILE')) throw new Error('Não foi encontrado um recurso de veículo com YFT base e vehicles.meta.' + ignoredNote);
  if (!declaredModels.size) throw new Error('vehicles.meta não declara nenhum modelName.');
  for (const model of declaredModels) {
    if (!models.has(model)) throw new Error(`YFT base ausente para o modelo declarado: ${model}`);
  }
  // Unknown game data may require extra manifest declarations: never silently call that ready.
  const blocking = skipped.filter(p => !IGNORED.has(path.posix.basename(p).toLowerCase()) && /\.(meta|ymt|rel|awc|ymap|ytyp)$/i.test(p));
  if (blocking.length) throw new Error(`Pacote requer suporte adicional para: ${blocking.join(', ')}`);
  const requested = options.chooseSpawns ? await options.chooseSpawns({ archive: path.basename(archive), models: [...declaredModels].sort() }) : options.spawns;
  const renamed = renameSpawns(files, metas, declaredModels, requested);
  const finalModels = renamed.models;
  files = organizeTuning(renamed.files, metas, finalModels);
  const cleaned = cleanMissingTuning(files, metas);
  files = cleaned.files;
  const name = safeName(finalModels.length === 1 ? finalModels[0] : `${finalModels[0]}_pack`);
  const manifest = ['-- Convertido com RPForge', "fx_version 'cerulean'", "game 'gta5'", '', 'files {', ...metas.map(m => `    '${m.destination}',`), '}', '', ...metas.map(m => `data_file '${m.type}' '${m.destination}'`), ''].join('\n');
  add('fxmanifest.lua', Buffer.from(manifest));
  const audit = auditAddon(files);
  audit.issues.push(...ignoredWarnings);
  audit.warnings += ignoredWarnings.length;
  options.onProgress?.({ phase: 'audit', current: 1, total: 1, label: path.basename(archive) });
  return { archive, files, metas, kind: 'vehicle', defaultName: name, models: finalModels, originalModels: [...declaredModels].sort(), skipped, removedTuning: cleaned.removed, audit, sourceHash, sourceBytes: stat.size, mergedSources };
}

export async function convertArchive(archive, options = {}) {
  const plan = await prepareArchive(archive, options);
  if (!plan.audit.ok) throw new Error(`Validação final reprovada: ${plan.audit.issues.filter(i => i.severity === 'error').map(i => i.message).join(' ')}`);
  const destination = await writePlan(plan, options);
  return { ...destination, kind: plan.kind, models: plan.models, skipped: plan.skipped, removedTuning: plan.removedTuning, audit: plan.audit, mergedSources: plan.mergedSources };
}

export async function convertFolder(folder, options = {}) {
  const root = path.resolve(folder);
  if (!(await lstat(root)).isDirectory()) throw new Error('Selecione uma pasta real, sem link.');
  const archives = (await readdir(root, { withFileTypes: true })).filter(e => e.isFile() && e.name.toLowerCase().endsWith('.rpf')).sort((a, b) => a.name.localeCompare(b.name));
  if (!archives.length) throw new Error('Nenhum .rpf diretamente nesta pasta.');
  const results = [];
  for (const archive of archives) {
    try { results.push({ archive: archive.name, ok: true, ...await convertArchive(path.join(root, archive.name), options) }); }
    catch (error) { results.push({ archive: archive.name, ok: false, cancelled: error.code === 'CANCELLED', error: formatUserError(error) }); }
  }
  return results;
}
