import { readFile, readdir, lstat, mkdtemp, writeFile, link, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { LIMITS, safeName } from './rpf.js';
import { isRsc7, rsc7DeclaredSize } from './rsc7.js';
import {publication,recoverPublications} from './publication.js';

// Empty schema fixture generated from our own archetypes; no game models or runtime DLLs.
const schema = JSON.parse(readFileSync(new URL('./ytyp-template.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const template = Buffer.from(schema.template, 'base64');
export function jenkHash(name) {
  let value = 0;
  for (const byte of Buffer.from(name.toLowerCase(), 'utf8')) { value = (value + byte) >>> 0; value = (value + (value << 10)) >>> 0; value ^= value >>> 6; }
  value = (value + (value << 3)) >>> 0; value ^= value >>> 11;
  return (value + (value << 15)) >>> 0;
}
export function readDrawable(data, name, limits = LIMITS) {
  if (!isRsc7(data, 165)) throw new Error(`YDR Legacy inválido ou versão não suportada: ${name}`);
  // Inflate at most what the header declares (bounded by the runtime profile), never a blanket 256 MiB.
  const declared = rsc7DeclaredSize(data);
  if (declared < 0xa8 || declared > limits.fileBytes) throw new Error(`Modelo ${name} declara tamanho inválido ou acima do limite de leitura.`);
  let raw;
  try { raw = inflateRawSync(data.subarray(16), { maxOutputLength: declared }); }
  catch { throw new Error(`Não foi possível descompactar o modelo ${name}. O arquivo pode estar corrompido ou acima do limite de leitura.`); }
  if (raw.length < 0xa8) throw new Error(`Drawable truncado: ${name}`);
  const vector = offset => [0, 4, 8].map(at => raw.readFloatLE(offset + at));
  const min = vector(0x30), max = vector(0x40), center = vector(0x20), radius = raw.readFloatLE(0x2c);
  if (![...min, ...max, ...center, radius].every(Number.isFinite) || radius <= 0 || radius > 1e7 || min.some((n, i) => n > max[i])) throw new Error(`Limites geométricos inválidos: ${name}`);
  return { name: path.basename(name, path.extname(name)), min, max, center, radius };
}
export function buildYtyp(models, name, siblings = new Set()) {
  if (!models.length || models.length > schema.capacity) throw new Error('Cada YTYP deve conter entre 1 e 256 modelos.');
  const raw = inflateRawSync(template.subarray(16));
  const hashes = new Set();
  for (let i = 0; i < models.length; i++) {
    const model = models[i], hash = jenkHash(model.name);
    if (hashes.has(hash)) throw new Error(`Modelos com hash repetido: ${model.name}`);
    hashes.add(hash);
    const slot = schema.slots[i], fields = schema.fields;
    const uint = (field, value) => raw.writeUInt32LE(value >>> 0, slot + fields[field]);
    const float = (field, value) => raw.writeFloatLE(value, slot + fields[field]);
    const vector = (field, values) => values.forEach((value, at) => raw.writeFloatLE(value, slot + fields[field] + at * 4));
    uint('name', hash); uint('assetName', hash); uint('assetType', 2); uint('flags', 32);
    uint('textureDictionary', siblings.has(model.name.toLowerCase() + '.ytd') ? hash : 0);
    uint('physicsDictionary', siblings.has(model.name.toLowerCase() + '.ybn') ? hash : 0);
    vector('bbMin', model.min); vector('bbMax', model.max); vector('bsCentre', model.center);
    float('bsRadius', model.radius); float('lodDist', 500); float('hdTextureDist', 5);
  }
  raw.writeUInt32LE(jenkHash(name), schema.mapName);
  // Array_StructurePointer consists of an encoded pointer, two ushort counts and padding.
  raw.writeUInt16LE(models.length, schema.array + 8); raw.writeUInt16LE(models.length, schema.array + 10);
  return Buffer.concat([template.subarray(0, 16), deflateRawSync(raw)]);
}

export async function generateFolderYtyp(folder, options = {}) {
  const root = path.resolve(folder), stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Selecione uma pasta real com modelos YDR.');
  await recoverPublications(root);
  const entries = await readdir(root, { withFileTypes: true });
  const sources = entries.filter(e => e.isFile() && /\.ydr$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!sources.length) throw new Error('Nenhum arquivo .ydr diretamente nesta pasta.');
  if (sources.length > 4096) throw new Error('Limite de 4096 modelos por operação excedido.');
  const siblings = new Set(entries.filter(e => e.isFile()).map(e => e.name.toLowerCase()));
  const models = [], hashes = new Set(); let total = 0;
  for (const source of sources) {
    safeName(source.name);
    if (!/^[a-z0-9_.+-]+\.ydr$/i.test(source.name)) throw new Error(`Nome de modelo incompatível: ${source.name}`);
    const full = path.join(root, source.name), info = await lstat(full);
    if (!info.isFile() || info.isSymbolicLink() || info.size > LIMITS.fileBytes) throw new Error(`Modelo inválido, link ou acima de 256 MiB: ${source.name}`);
    total += info.size; if (total > LIMITS.totalBytes) throw new Error('Limite total de leitura excedido.');
    options.onProgress?.({ phase: 'read', current: models.length + 1, total: sources.length, label: source.name });
    const model = readDrawable(await readFile(full), source.name), hash = jenkHash(model.name);
    if (hashes.has(hash)) throw new Error(`Nome ou hash de modelo repetido: ${source.name}`);
    hashes.add(hash); models.push(model);
  }
  // Parse every model before writing anything. Publish each completed file without overwriting.
  const stage = await mkdtemp(path.join(root, '.rpforge-ytyp-'));
  const generated = [], published = [], planned = [];
  let journal, preserve=false;
  try {
    for (let index = 0; index < models.length; index += schema.capacity) {
      const name = 'rpforge_props' + (index ? '_' + (index / schema.capacity + 1) : '');
      const temporary = path.join(stage, name + '.ytyp');
      let suffix = 0, target;
      while (true) {
        target = path.join(root, name + (suffix ? '_' + suffix : '') + '.ytyp');
        // Also avoid a case-only duplicate on case-sensitive development filesystems.
        if (siblings.has(path.basename(target).toLowerCase())) { suffix++; continue; }
        const bytes = buildYtyp(models.slice(index, index + schema.capacity), path.basename(target, '.ytyp'), siblings);
        await writeFile(temporary, bytes);
        break;
      }
      planned.push({source:temporary,target});
      siblings.add(path.basename(target).toLowerCase()); generated.push(target);

    }
    journal=await publication(root,stage,planned);
    for(const {source,target} of planned){
      await link(source,target);
      published.push({target,identity:await lstat(target),bytes:await readFile(source)});
      options.onProgress?.({phase:'write',current:published.length,total:planned.length,label:path.basename(target)});
    }
    await journal.commit();
  } catch (error) {
    // Roll back only files created by this operation; preserve replacements or edits.
    for (const { target, identity, bytes } of published.reverse()) {
      try {
        const current = await lstat(target);
        if (current.dev === identity.dev && current.ino === identity.ino && !current.isSymbolicLink() && bytes.equals(await readFile(target))) await rm(target);
      } catch (cleanupError) { if (cleanupError.code !== 'ENOENT') {preserve=true;error.message += ` Não foi possível limpar ${path.basename(target)}: ${cleanupError.message}`;} }
    }
    if(!preserve)await journal?.abort();
    throw error;
  } finally { if(!preserve)await rm(stage, { recursive: true, force: true }); }
  return [{ ok: true, kind: 'ytyp', archive: path.basename(root), output: root, generated, models: models.map(m => m.name), audit: { issues: [{ severity: 'warning', message: 'YTYP binário criado com os limites dos modelos. Texturas compartilhadas e configurações especiais de MLO não são inferidas; confira esses casos no jogo.' }] } }];
}
