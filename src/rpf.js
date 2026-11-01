import { inflateRawSync } from 'node:zlib';

export const LIMITS = { archiveBytes: 512 * 1024 * 1024, fileBytes: 256 * 1024 * 1024, totalBytes: 1024 * 1024 * 1024, entries: 100_000, depth: 16 };

export function safeName(name) {
  if (!name || name === '.' || name === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) {
    throw new Error(`Nome de arquivo inválido no RPF: ${JSON.stringify(name)}`);
  }
  return name;
}

/** RPF7 OPEN/NONE only. Resource payloads keep their compressed bytes and receive a canonical RSC7 header. */
export function* readRpf(buffer, prefix = '', state = { bytes: 0, entries: 0 }, depth = 0) {
  if (depth > LIMITS.depth) throw new Error('Limite de profundidade de RPF excedido.');
  if (buffer.length < 16 || buffer.readUInt32LE(0) !== 0x52504637) throw new Error('Arquivo inválido: esperado RPF7 GTA V Legacy.');
  if (buffer.length > LIMITS.archiveBytes) throw new Error('RPF acima do limite de 512 MiB.');
  const count = buffer.readUInt32LE(4);
  const namesSize = buffer.readUInt32LE(8);
  const encryption = buffer.readUInt32LE(12);
  if (![0, 0x4e45504f].includes(encryption)) throw new Error('RPF criptografado: esta ferramenta aceita somente arquivos OPEN/NONE.');
  state.entries += count;
  if (!count || state.entries > LIMITS.entries) throw new Error('Quantidade de entradas inválida ou acima do limite.');
  const namesStart = 16 + count * 16;
  const headerEnd = namesStart + namesSize;
  if (headerEnd > buffer.length) throw new Error('Tabela do RPF truncada.');
  const names = buffer.subarray(namesStart, headerEnd);
  const visited = new Set();

  function nameAt(offset) {
    if (offset >= names.length) throw new Error('Referência de nome fora da tabela.');
    const end = names.indexOf(0, offset);
    if (end === -1) throw new Error('Nome sem terminador na tabela.');
    return names.toString('utf8', offset, end);
  }
  function* visit(index, folder, level) {
    if (level > LIMITS.depth * 4 || index >= count || visited.has(index)) throw new Error('Estrutura cíclica ou inválida no RPF.');
    visited.add(index);
    const at = 16 + index * 16;
    const directory = buffer.readUInt32LE(at + 4) === 0x7fffff00;
    const nameOffset = directory ? buffer.readUInt32LE(at) : buffer.readUInt16LE(at);
    const name = nameAt(nameOffset);
    if (index === 0 && !directory) throw new Error('Raiz do RPF não é uma pasta.');
    const current = index === 0 ? folder : `${folder}${safeName(name)}`;
    if (directory) {
      const first = buffer.readUInt32LE(at + 8);
      const length = buffer.readUInt32LE(at + 12);
      if (first + length > count) throw new Error('Pasta com intervalo inválido no RPF.');
      for (let child = first; child < first + length; child++) yield* visit(child, index === 0 ? folder : `${current}/`, level + 1);
      return;
    }
    const resource = (buffer[at + 7] & 0x80) !== 0;
    const offset = (buffer.readUIntLE(at + 5, 3) & 0x7fffff) * 512;
    let size = buffer.readUIntLE(at + 2, 3);
    if (resource && size === 0xffffff) {
      if (offset + 16 > buffer.length) throw new Error('Cabeçalho de resource truncado.');
      size = buffer[offset + 7] + buffer[offset + 14] * 256 + buffer[offset + 5] * 65536 + buffer[offset + 2] * 16777216;
    }
    if (!resource && buffer.readUInt32LE(at + 12) !== 0) throw new Error(`Entrada criptografada não suportada: ${current}`);
    const unpacked = resource ? size : buffer.readUInt32LE(at + 8);
    const stored = resource ? size : size || unpacked;
    if (stored > LIMITS.fileBytes || unpacked > LIMITS.fileBytes || offset < headerEnd || offset + stored > buffer.length) throw new Error(`Tamanho ou offset inválido: ${current}`);
    let data = buffer.subarray(offset, offset + stored);
    if (resource) {
      if (size < 16) throw new Error(`Resource sem cabeçalho: ${current}`);
      const system = buffer.readUInt32LE(at + 8);
      const graphics = buffer.readUInt32LE(at + 12);
      const header = Buffer.alloc(16);
      header.write('RSC7');
      header.writeUInt32LE(((system >>> 28) << 4) | (graphics >>> 28), 4);
      header.writeUInt32LE(system, 8);
      header.writeUInt32LE(graphics, 12);
      data = Buffer.concat([header, data.subarray(16)]);
    } else if (size) {
      data = inflateRawSync(data, { maxOutputLength: LIMITS.fileBytes });
      if (data.length !== unpacked) throw new Error(`Tamanho descompactado divergente: ${current}`);
    }
    state.bytes += data.length;
    if (state.bytes > LIMITS.totalBytes) throw new Error('Limite total de extração excedido.');
    if (name.toLowerCase().endsWith('.rpf')) yield* readRpf(data, `${current}/`, state, depth + 1);
    else yield { path: current, data };
  }
  yield* visit(0, prefix, 0);
  if (visited.size !== count) throw new Error('RPF contém entradas sem vínculo com a raiz.');
}
