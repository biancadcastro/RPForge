import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

// Suggest only adjacent texture dictionaries matching the selected drawable ID.
// Ambiguous variants require an explicit choice; never search the entire corpus.
export async function clothingLaunch(model) {
  model = path.resolve(model);
  const info = await lstat(model);
  if (info.isDirectory() && !info.isSymbolicLink()) {
    const models = (await readdir(model, {withFileTypes:true})).filter(e=>e.isFile() && /\.ydd$/i.test(e.name)).map(e=>path.join(model,e.name)).sort((a,b)=>a.localeCompare(b));
    if (models.length === 1) return { ...await clothingLaunch(models[0]), directory: model };
    return { model:'',texture:'',destination:model,candidates:[],directory:model };
  }
  if (!info.isFile() || info.isSymbolicLink() || path.extname(model).toLowerCase() !== '.ydd') throw Error('Selecione um arquivo YDD real.');
  const directory = path.dirname(model), stem = path.basename(model, path.extname(model));
  const match = stem.match(/^(.*?)([a-z]{4})_(\d{3})_[a-z]$/i);
  const prefix = match ? `${match[1]}${match[2]}_diff_${match[3]}_`.toLowerCase() : null;
  const candidates = prefix ? (await readdir(directory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.toLowerCase().startsWith(prefix) && /\.ytd$/i.test(entry.name))
    .map(entry => path.join(directory, entry.name)).sort((a, b) => a.localeCompare(b)) : [];
  return { model, texture: candidates.length === 1 ? candidates[0] : '', destination: directory, candidates };
}
