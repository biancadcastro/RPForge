import { deflateRawSync } from 'node:zlib';

// Synthetic archives only. No Rockstar or third-party game content.
export function makeRpf(files) {
  const names = [Buffer.from('\0')];
  let nameLength = 1;
  const entries = [];
  for (const file of files) {
    entries.push({ ...file, nameOffset: nameLength });
    const bytes = Buffer.from(file.name + '\0');
    names.push(bytes);
    nameLength += bytes.length;
  }
  const headerBytes = 16 + (entries.length + 1) * 16 + nameLength;
  let cursor = Math.ceil(headerBytes / 512) * 512;
  for (const entry of entries) {
    entry.payload = entry.compressed ? deflateRawSync(entry.data) : entry.data;
    entry.offset = cursor;
    cursor += Math.ceil(entry.payload.length / 512) * 512 || 512;
  }
  const archive = Buffer.alloc(cursor);
  archive.writeUInt32LE(0x52504637);
  archive.writeUInt32LE(entries.length + 1, 4);
  archive.writeUInt32LE(nameLength, 8);
  archive.writeUInt32LE(0x4e45504f, 12);
  archive.writeUInt32LE(0x7fffff00, 20);
  archive.writeUInt32LE(1, 24);
  archive.writeUInt32LE(entries.length, 28);
  Buffer.concat(names).copy(archive, 16 + (entries.length + 1) * 16);
  entries.forEach((entry, i) => {
    const at = 32 + i * 16;
    archive.writeUInt16LE(entry.nameOffset, at);
    archive.writeUIntLE(entry.resource || entry.compressed ? entry.payload.length : 0, at + 2, 3);
    archive.writeUIntLE(entry.offset / 512 + (entry.resource ? 0x800000 : 0), at + 5, 3);
    archive.writeUInt32LE(entry.resource ? 0x10000000 : entry.data.length, at + 8);
    archive.writeUInt32LE(entry.resource ? 0x20000000 : 0, at + 12);
    entry.payload.copy(archive, entry.offset);
  });
  return archive;
}

export function vehicleArchive() {
  const resource = Buffer.concat([Buffer.alloc(16), deflateRawSync(Buffer.from('synthetic geometry'))]);
  return makeRpf([
    { name: 'car.yft', data: resource, resource: true },
    { name: 'car.ytd', data: resource, resource: true },
    { name: 'vehicles.meta', data: Buffer.from('<CVehicleModelInfo__InitDataList><InitDatas><Item><modelName>car</modelName></Item></InitDatas></CVehicleModelInfo__InitDataList>'), compressed: true },
    { name: 'handling.meta', data: Buffer.from('<CHandlingDataMgr><HandlingData/></CHandlingDataMgr>'), compressed: true },
  ]);
}
