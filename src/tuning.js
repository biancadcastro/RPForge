import path from 'node:path';

/** Organize streamed tuning pieces by their filenames; do not change payloads or model references. */
export function organizeTuning(files, metas, models) {
  const bases = new Set(models.map(model => model.toLowerCase()));
  const main = new Set([...bases].flatMap(model => [model, `${model}_hi`]));
  const referenced = new Set();
  for (const meta of metas.filter(meta => meta.basename === 'carcols.meta')) {
    for (const node of Array.from(meta.doc.getElementsByTagName('modelName'))) referenced.add(node.textContent.trim().toLowerCase());
    for (const list of Array.from(meta.doc.getElementsByTagName('linkedModels'))) {
      for (const node of Array.from(list.getElementsByTagName('Item'))) referenced.add(node.textContent.trim().toLowerCase());
    }
  }
  const parts = new Set();
  for (const file of files.values()) {
    if (!file.destination.startsWith('stream/')) continue;
    const ext = path.posix.extname(file.destination).toLowerCase();
    const stem = path.posix.basename(file.destination, ext).toLowerCase();
    if (main.has(stem)) continue;
    const namedForVehicle = [...bases].some(model => stem.startsWith(`${model}_`));
    if (ext === '.yft' || (ext === '.ydr' && (referenced.has(stem) || namedForVehicle))) parts.add(stem);
  }
  const result = new Map();
  for (const file of files.values()) {
    let destination = file.destination;
    if (destination.startsWith('stream/')) {
      const ext = path.posix.extname(destination).toLowerCase();
      const stem = path.posix.basename(destination, ext).toLowerCase();
      const belongs = parts.has(stem) || parts.has(stem.replace(/\+hi$/, ''));
      if (belongs && ['.yft', '.ydr', '.ytd', '.ybn'].includes(ext)) destination = `stream/mods/${path.posix.basename(destination)}`;
    }
    const key = destination.toLowerCase();
    if (result.has(key)) throw new Error(`Conflito ao organizar tuning: ${destination}`);
    result.set(key, { ...file, destination });
  }
  return result;
}
