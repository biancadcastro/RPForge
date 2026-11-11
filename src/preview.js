import { readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { prepareArchive, convertArchive } from './convert.js';
import { outputName } from './output.js';
import { formatUserError } from './user-error.js';

export async function listArchives(folder) {
  const root = path.resolve(folder);
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Selecione uma pasta real contendo os RPFs.');
  const entries = await readdir(root, { withFileTypes: true });
  const archives = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.rpf')).map(e => e.name).sort();
  if (!archives.length) throw new Error('Nenhum arquivo .rpf diretamente nesta pasta.');
  return { root, archives };
}
async function exists(file) { try { return !!await lstat(file); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }

/** No extracted files or JSON reports are written while preparing a preview. */
export async function inspectFolder(folder, options = {}) {
  const { root, archives } = await listArchives(folder);
  const results = [];
  for (let index = 0; index < archives.length; index++) {
    const archive = archives[index];
    const selected = options.archives?.[archive] ?? {};
    options.onProgress?.({ phase: 'preview', current: index + 1, total: archives.length, label: archive });
    try {
      const plan = await prepareArchive(path.join(root, archive), { ...selected, onProgress: options.onProgress });
      const name = outputName(selected.outputName || plan.defaultName);
      const output = path.join(root, name);
      results.push({ archive, selected: selected.selected !== false, ok: true, kind: plan.kind, models: plan.originalModels, finalModels: plan.models, defaultName: plan.defaultName, outputName: name, output, exists: await exists(output), sourceHash: plan.sourceHash, sourceBytes: plan.sourceBytes, mergedSources: plan.mergedSources, removedTuning: plan.removedTuning, skipped: plan.skipped, audit: plan.audit, files: [...plan.files.values()].map(f => ({ path: f.destination, diskBytes: f.data.length })) });
    } catch (error) { results.push({ archive, ok: false, error: formatUserError(error) }); }
  }
  return results;
}

export async function convertSelected(folder, options = {}) {
  const { root, archives } = await listArchives(folder);
  const results = [];
  for (let index = 0; index < archives.length; index++) {
    const archive = archives[index];
    const selected = options.archives?.[archive];
    if (!selected || selected.selected === false) continue;
    options.onProgress?.({ phase: 'convert', current: index + 1, total: archives.length, label: archive });
    try {
      if (!selected.expectedSource) throw new Error('Analise o RPF antes de converter.');
      results.push({ archive, ok: true, ...await convertArchive(path.join(root, archive), { ...selected, onProgress: options.onProgress }) });
    } catch (error) { results.push({ archive, ok: false, cancelled: error.code === 'CANCELLED', error: formatUserError(error) }); }
  }
  if (!results.length) throw new Error('Selecione pelo menos um RPF para converter.');
  return results;
}
