import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { corruptError } from './user-error.js';

// Desktop profile: limits of the local application.
export const LIMITS = { archiveBytes: 768 * 1024 * 1024, fileBytes: 256 * 1024 * 1024, totalBytes: 1024 * 1024 * 1024, entries: 100_000, depth: 16 };
// Remote Workers profile (128 MB per isolate, shared with runtime, copies and concurrent requests).
// Initial conservative proposal pending remote measurement; NOT a compatibility claim for larger archives.
export const WORKER_LIMITS = Object.freeze({ archiveBytes: 16 * 1024 * 1024, fileBytes: 16 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, entries: 20_000, depth: 4 });

export function safeName(name) {
  if (!name || name === '.' || name === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) {
    throw new Error(`Nome de arquivo inválido no RPF: ${JSON.stringify(name)}`);
  }
  return name;
}

/** RPF7 OPEN/NONE only. Resource payloads keep their compressed bytes and receive a canonical RSC7 header. */
export function* readRpf(buffer, prefix = '', state = { bytes: 0, entries: 0 }, depth = 0) {
  const limits = state.limits ?? LIMITS;
  if (depth > limits.depth) throw new Error('Limite de profundidade de RPF excedido.');
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 0x52504637) throw new Error('Arquivo inválido: esperado RPF7 GTA V Legacy.');
  if (buffer.length > limits.archiveBytes) throw new Error(`RPF acima do limite de ${limits.archiveBytes / 1048576} MiB.`);
  const count = buffer.readUInt32LE(4);
  const namesSize = buffer.readUInt32LE(8);
  const encryption = buffer.readUInt32LE(12);
  if (![0, 0x4e45504f].includes(encryption)) throw new Error('Este RPF está criptografado. O RPForge aceita somente RPFs abertos (não criptografados).');
  state.entries += count;
  if (!count) throw corruptError('Quantidade de entradas inválida.');
  if (state.entries > limits.entries) throw new Error('Quantidade de entradas acima do limite.');
  const namesStart = 16 + count * 16;
  const headerEnd = namesStart + namesSize;
  if (headerEnd > buffer.length) throw corruptError('Tabela do RPF truncada.');
  const names = buffer.subarray(namesStart, headerEnd);
  const visited = new Set();

  function nameAt(offset) {
    if (offset >= names.length) throw corruptError('Referência de nome fora da tabela.');
    const end = names.indexOf(0, offset);
    if (end === -1) throw corruptError('Nome sem terminador na tabela.');
    return names.toString('utf8', offset, end);
  }
  function* visit(index, folder, level) {
    if (level > limits.depth * 4 || index >= count || visited.has(index)) throw corruptError('Estrutura cíclica ou inválida no RPF.');
    visited.add(index);
    const at = 16 + index * 16;
    const directory = buffer.readUInt32LE(at + 4) === 0x7fffff00;
    const nameOffset = directory ? buffer.readUInt32LE(at) : buffer.readUInt16LE(at);
    const name = nameAt(nameOffset);
    if (index === 0 && !directory) throw corruptError('Raiz do RPF não é uma pasta.');
    const current = index === 0 ? folder : `${folder}${safeName(name)}`;
    if (directory) {
      const first = buffer.readUInt32LE(at + 8);
      const length = buffer.readUInt32LE(at + 12);
      if (first + length > count) throw corruptError('Pasta com intervalo inválido no RPF.');
      for (let child = first; child < first + length; child++) yield* visit(child, index === 0 ? folder : `${current}/`, level + 1);
      return;
    }
    const resource = (buffer[at + 7] & 0x80) !== 0;
    const offset = (buffer.readUIntLE(at + 5, 3) & 0x7fffff) * 512;
    let size = buffer.readUIntLE(at + 2, 3);
    if (resource && size === 0xffffff) {
      if (offset + 16 > buffer.length) throw corruptError('Cabeçalho de resource truncado.');
      size = buffer[offset + 7] + buffer[offset + 14] * 256 + buffer[offset + 5] * 65536 + buffer[offset + 2] * 16777216;
    }
    if (!resource && buffer.readUInt32LE(at + 12) !== 0) throw new Error(`Este RPF contém arquivos criptografados (${current}). O RPForge aceita somente RPFs abertos (não criptografados).`);
    const unpacked = resource ? size : buffer.readUInt32LE(at + 8);
    const stored = resource ? size : size || unpacked;
    const nestedArchive = name.toLowerCase().endsWith('.rpf');
    // A stored nested RPF is a view of its parent buffer.
    const storedNestedArchive = limits !== WORKER_LIMITS && nestedArchive && !resource && !size;
    const entryLimit = storedNestedArchive ? limits.archiveBytes : limits.fileBytes;
    if (stored > entryLimit || unpacked > entryLimit || offset < headerEnd || offset + stored > buffer.length) throw corruptError(`Tamanho ou offset inválido: ${current}`);
    let data = buffer.subarray(offset, offset + stored);
    if (resource) {
      if (size < 16) throw corruptError(`Resource sem cabeçalho: ${current}`);
      const system = buffer.readUInt32LE(at + 8);
      const graphics = buffer.readUInt32LE(at + 12);
      const header = Buffer.alloc(16);
      header.write('RSC7');
      header.writeUInt32LE(((system >>> 28) << 4) | (graphics >>> 28), 4);
      header.writeUInt32LE(system, 8);
      header.writeUInt32LE(graphics, 12);
      data = Buffer.concat([header, data.subarray(16)]);
    } else if (size) {
      // Bound output by the declared size of this entry (exact), not a blanket limit.
      try { data = inflateRawSync(data, { maxOutputLength: Math.max(1, unpacked) }); }
      catch (error) { throw corruptError(`Falha ao descompactar ${current}: ${error.message}`); }
      if (data.length !== unpacked) throw corruptError(`Tamanho descompactado divergente: ${current}`);
    }
    if (!storedNestedArchive) state.bytes += data.length;
    if (state.bytes > limits.totalBytes) throw new Error('Limite total de extração excedido.');
    // An inner archive that is empty or has no RPF7 header (e.g. a zeroed language pack)
    // carries nothing readable: skip it and report it instead of failing the whole package.
    // Encrypted or structurally broken inner RPFs still fail below.
    if (nestedArchive && (data.length < 16 || data.readUInt32LE(0) !== 0x52504637)) (state.ignoredArchives ??= []).push(current);
    else if (nestedArchive) {
      // A byte-identical copy of an inner archive already read adds nothing: skip and report it.
      const digest = createHash('sha256').update(data).digest('hex');
      state.innerArchives ??= new Map();
      if (state.innerArchives.has(digest)) (state.duplicateArchives ??= []).push({ path: current, original: state.innerArchives.get(digest) });
      else { state.innerArchives.set(digest, current); yield* readRpf(data, `${current}/`, state, depth + 1); }
    }
    else yield { path: current, data };
  }
  yield* visit(0, prefix, 0);
  if (visited.size !== count) throw corruptError('RPF contém entradas sem vínculo com a raiz.');
}
