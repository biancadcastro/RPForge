import { lstat, realpath, mkdtemp, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { safeName } from './rpf.js';
import {publication,recoverPublications} from './publication.js';

async function exists(file) { try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
export function outputName(name) {
  safeName(name);
  if (!/^[a-z0-9_]{1,100}$/i.test(name)) throw new Error('O nome da pasta deve usar apenas letras, números e _, com até 100 caracteres.');
  return name;
}

export async function writePlan(plan, options = {}) {
  const root = await realpath(path.dirname(plan.archive));
  await recoverPublications(root);
  let output = path.join(root, outputName(options.outputName || plan.defaultName));
  let existing = await exists(output);
  let choice = { action: options.existing || 'error', name: options.outputName };
  if (existing && options.chooseOutput) choice = await options.chooseOutput({ output, name: path.basename(output) });
  if (!['error', 'cancel', 'rename', 'backup'].includes(choice?.action)) throw new Error('Escolha de destino inválida.');
  if (existing && choice.action === 'cancel') {
    const error = new Error('Conversão cancelada; a pasta existente foi preservada.'); error.code = 'CANCELLED'; throw error;
  }
  if (existing && choice.action === 'rename') {
    if (choice.name && choice.name !== path.basename(output)) output = path.join(root, outputName(choice.name));
    else {
      const name = path.basename(output);
      let index = 2;
      while (await exists(output)) output = path.join(root, outputName(`${name}_${index++}`));
    }
    existing = await exists(output);
    if (existing) throw new Error(`Destino já existe: ${output}`);
  }
  if (existing && choice.action === 'error') throw new Error(`Destino já existe: ${output}`);
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) throw new Error('O destino existente precisa ser uma pasta real para criar backup.');
  if (path.dirname(output) !== root) throw new Error('Destino fora da pasta do RPF.');
  const stage = await mkdtemp(path.join(root, '.rpforge-'));
  let backup = null;
  let published = false;
  let journal;
  try {
    const all = [...plan.files.values()];
    for (let index = 0; index < all.length; index++) {
      const file = all[index];
      const target = path.resolve(stage, file.destination);
      if (!target.startsWith(stage + path.sep)) throw new Error('Caminho de saída inválido.');
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.data, { flag: 'wx' });
      options.onProgress?.({ phase: 'write', current: index + 1, total: all.length, label: file.destination });
    }
    for (let index = 0; index < all.length; index++) {
      const file = all[index];
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path.join(stage, file.destination))) hash.update(chunk);
      if (hash.digest('hex') !== createHash('sha256').update(file.data).digest('hex')) throw new Error(`Falha na verificação do arquivo gravado: ${file.destination}`);
      options.onProgress?.({ phase: 'verify', current: index + 1, total: all.length, label: file.destination });
    }
    const current = await exists(output);
    if (current) {
      if (choice.action !== 'backup' || !current.isDirectory() || current.isSymbolicLink()) throw new Error(`Destino já existe: ${output}`);
      const actual = await realpath(output);
      if (path.dirname(actual).toLowerCase() !== root.toLowerCase()) throw new Error('A pasta existente foi redirecionada; backup recusado.');
      backup = `${output}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
      if (path.dirname(backup) !== root || await exists(backup)) throw new Error('Caminho de backup inválido.');
    }
    journal=await publication(root,stage,[],{output,backup,previous:current});
    if(backup)await rename(output, backup);
    try { await rename(stage, output); published = true; }
    catch (error) {
      if (backup && !await exists(output)) await rename(backup, output);
      throw error;
    }
    await journal.commit();journal=null;
  } finally {
    const recoverable=journal&&backup&&!await exists(output);
    if(!recoverable){
      if (!published && path.dirname(stage) === root && path.basename(stage).startsWith('.rpforge-')) await rm(stage, { recursive: true, force: true });
      if(journal)await journal.abort();
    }
  }
  return { output, resource: path.basename(output), backup };
}
