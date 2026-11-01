import { createHash } from 'node:crypto';

// Compare the original PE image with its signed copy. Only the checksum,
// certificate table entry, end padding and appended certificate may change.
export function imageDigest(input) {
  const data = Buffer.from(input);
  const fail = () => { throw new Error('Invalid or unsupported PE image'); };
  if (data.length < 64 || data.readUInt16LE(0) !== 0x5a4d) fail();
  const pe = data.readUInt32LE(60);
  if (pe + 24 > data.length || data.readUInt32LE(pe) !== 0x4550) fail();
  const optional = pe + 24;
  const size = data.readUInt16LE(pe + 20);
  if (optional + size > data.length || size < 152) fail();
  const magic = data.readUInt16LE(optional);
  if (magic !== 0x20b && magic !== 0x10b) fail();
  const directories = optional + (magic === 0x20b ? 112 : 96);
  const count = data.readUInt32LE(directories - 4);
  const security = directories + 32;
  if (count < 5 || security + 8 > optional + size) fail();
  const offset = data.readUInt32LE(security);
  const length = data.readUInt32LE(security + 4);
  if (!!offset !== !!length) fail();
  if (length && (offset % 8 || offset < optional + size || length < 8 || offset + length !== data.length)) fail();
  const image = data.subarray(0, length ? offset : data.length);
  image.fill(0, optional + 64, optional + 68);
  image.fill(0, security, security + 8);
  const aligned = Buffer.alloc(Math.ceil(image.length / 8) * 8);
  image.copy(aligned);
  return createHash('sha256').update(aligned).digest('hex');
}
