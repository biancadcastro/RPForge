import {Arena, View, encodeResource, decodeResource, fileHeader, pagesInfo, proofName, nameHash, requireThat, checkedInteger} from './resource.js';

// One clip, one animation, one root-position track, three uncompressed float channels.
// No FBX import, retarget, rotations, quantized channels or production rig claim.
export function writeYcd({name, fps, translations}) {
  proofName(name); checkedInteger(fps, 1, 120, 'fps');
  requireThat(Array.isArray(translations) && translations.length % 3 === 0, 'Invalid translations');
  const frames = checkedInteger(translations.length / 3, 2, 256, 'frame count');
  requireThat(translations.every(n => Number.isFinite(n) && Math.abs(n) <= 1e5), 'Invalid translation');
  const a = new Arena(), root = a.allocate(64), pages = pagesInfo(a, false), amap = a.allocate(48);
  const cbucket = a.allocate(8), abucket = a.allocate(8), centry = a.allocate(32), aentry = a.allocate(32);
  const clip = a.allocate(112), animation = a.allocate(96), pointers = a.allocate(8), bone = a.allocate(4);
  const dataLength = frames * 12 + 18 + 8, sequence = a.allocate(32 + dataLength), fullName = 'pack:/' + name;
  const text = a.allocate(fullName.length + 1), hash = nameHash(name), duration = (frames - 1) / fps;
  fileHeader(a, root, pages); a.pointer(24, amap); a.u32(32, 0x101); a.pointer(40, cbucket); a.u16(48, 1); a.u16(50, 1); a.u32(52, 0x1000000);
  a.u32(amap + 4, 1); a.pointer(amap + 24, abucket); a.u16(amap + 32, 1); a.u16(amap + 34, 1); a.u32(amap + 36, 0x1000000); a.u32(amap + 40, 1);
  a.pointer(cbucket, centry); a.pointer(abucket, aentry); a.u32(centry, hash); a.pointer(centry + 8, clip); a.u32(aentry, hash); a.pointer(aentry + 8, animation);
  a.u32(clip + 4, 1); a.u32(clip + 16, 1); a.pointer(clip + 24, text); a.u16(clip + 32, fullName.length); a.u16(clip + 34, fullName.length + 1); a.pointer(clip + 40, 0); a.u32(clip + 72, 1);
  a.pointer(clip + 80, animation); a.float(clip + 88, 0); a.float(clip + 92, duration); a.float(clip + 96, 1); a.bytes.write(fullName, text, 'ascii');
  a.u32(animation + 4, 1); a.bytes[animation + 17] = 1; a.u16(animation + 20, frames); a.u16(animation + 22, 255); a.float(animation + 24, duration); a.u32(animation + 56, 32 + dataLength); a.u32(animation + 60, 1);
  a.pointer(animation + 64, pointers); a.u16(animation + 72, 1); a.u16(animation + 74, 1); a.pointer(pointers, sequence);
  a.pointer(animation + 80, bone); a.u16(animation + 88, 1); a.u16(animation + 90, 1); // Bone 0, track 0 (position).
  a.u32(sequence + 4, dataLength); a.u32(sequence + 12, 0); a.u32(sequence + 16, 32 + dataLength); a.u16(sequence + 22, frames); a.u16(sequence + 24, 12); a.bytes[sequence + 30] = 255;
  const data = sequence + 32, counts = data + frames * 12, ids = counts + 18;
  translations.forEach((n, i) => a.float(data + i * 4, n));
  a.u16(counts + 6, 3); // Channel type 3 (RawFloat), three components of sequence 0.
  for (let i = 0; i < 4; i++) a.u16(ids + i * 2, i < 3 ? i : 4);
  return encodeResource(46, a.finish());
}
export function readYcd(bytes) {
  const v = new View(decodeResource(bytes, 46)); requireThat(v.graphics.length === 0, 'Unsupported graphics data');
  // Every byte of each structure is either a validated field or must be zero.
  v.known(0, 64, [[4, 4], [8, 8], [24, 8], [32, 4], [40, 8], [48, 2], [50, 2], [52, 4]]);
  requireThat(v.u32(4) === 1 && v.u32(32) === 0x101 && v.u32(52) === 0x1000000, 'Unsupported clip dictionary header');
  requireThat(v.u16(48) === 1 && v.u16(50) === 1, 'Unsupported clip count');
  const pages = v.pagesInfo(8), cbucket = v.ptr(40, 8), centry = v.ptr(cbucket, 32);
  requireThat(pages.system === v.systemPages && pages.graphics === v.graphicsPages, 'Page info mismatch');
  v.known(centry, 32, [[0, 4], [8, 8]]);
  const clip = v.ptr(centry + 8, 112);
  v.known(clip, 112, [[4, 4], [16, 4], [24, 8], [32, 2], [34, 2], [40, 8], [72, 4], [80, 8], [88, 4], [92, 4], [96, 4]]);
  requireThat(v.u32(clip + 4) === 1 && v.u32(clip + 72) === 1 && v.system.readBigUInt64LE(clip + 40) === 0x50000000n, 'Unsupported clip header');
  const nameAt = v.ptr(clip + 24, 1), fullName = v.string(clip + 24);
  requireThat(fullName.startsWith('pack:/'), 'Unsupported clip name'); const name = proofName(fullName.slice(6));
  requireThat(v.u32(centry) === nameHash(name) && v.u32(clip + 16) === 1, 'Clip identity mismatch');
  requireThat(v.u16(clip + 32) === fullName.length && v.u16(clip + 34) === fullName.length + 1, 'Clip name length mismatch');
  const animation = v.ptr(clip + 80, 96), amap = v.ptr(24, 48);
  v.known(amap, 48, [[4, 4], [24, 8], [32, 2], [34, 2], [36, 4], [40, 4]]);
  requireThat(v.u32(amap + 4) === 1 && v.u32(amap + 36) === 0x1000000 && v.u32(amap + 40) === 1, 'Unsupported animation map header');
  requireThat(v.u16(amap + 32) === 1 && v.u16(amap + 34) === 1, 'Unsupported animation count');
  const abucket = v.ptr(amap + 24, 8), aentry = v.ptr(abucket, 32);
  v.known(aentry, 32, [[0, 4], [8, 8]]);
  requireThat(v.u32(aentry) === nameHash(name) && v.ptr(aentry + 8, 96) === animation, 'Animation reference mismatch');
  v.known(animation, 96, [[4, 4], [17, 1], [20, 2], [22, 2], [24, 4], [56, 4], [60, 4], [64, 8], [72, 2], [74, 2], [80, 8], [88, 2], [90, 2]]);
  requireThat(v.u32(animation + 4) === 1 && v.system[animation + 17] === 1 && v.u32(animation + 60) === 1, 'Unsupported animation header');
  const frames = checkedInteger(v.u16(animation + 20), 2, 256, 'frame count'), duration = v.float(animation + 24);
  requireThat(duration > 0, 'Unsupported timing');
  const fps = Math.round((frames - 1) / duration); checkedInteger(fps, 1, 120, 'fps');
  requireThat(duration === Math.fround((frames - 1) / fps) && v.float(clip + 88) === 0 && v.float(clip + 96) === 1 && v.float(clip + 92) === duration, 'Unsupported timing');
  requireThat(v.u16(animation + 22) === 255 && v.u16(animation + 72) === 1 && v.u16(animation + 74) === 1 && v.u16(animation + 88) === 1 && v.u16(animation + 90) === 1, 'Unsupported animation layout');
  const bone = v.ptr(animation + 80, 4); v.zero(bone, 4);
  const seqList = v.ptr(animation + 64, 8), seq = v.ptr(seqList, 32), length = frames * 12 + 26;
  v.known(seq, 32, [[4, 4], [16, 4], [22, 2], [24, 2], [30, 1]]);
  requireThat(v.u32(seq + 4) === length && v.u32(animation + 56) === length + 32 && v.u32(seq + 16) === length + 32 && v.u16(seq + 22) === frames && v.u16(seq + 24) === 12, 'Unsupported sequence layout');
  requireThat(v.system[seq + 30] === 255, 'Unsupported sequence codec');
  v.range('system', seq + 32, length); const counts = seq + 32 + frames * 12, ids = counts + 18;
  v.exclusive([['system', 0, 64], ['system', pages.off, pages.length], ['system', cbucket, 8], ['system', centry, 32], ['system', clip, 112], ['system', nameAt, fullName.length + 1],
    ['system', amap, 48], ['system', abucket, 8], ['system', aentry, 32], ['system', animation, 96], ['system', bone, 4], ['system', seqList, 8], ['system', seq, 32 + length]]);
  for (let type = 0; type < 9; type++) requireThat(v.u16(counts + type * 2) === (type === 3 ? 3 : 0), 'Unsupported animation channel');
  for (let i = 0; i < 4; i++) requireThat(v.u16(ids + i * 2) === (i < 3 ? i : 4), 'Channel association mismatch');
  const translations = Array.from({length: frames * 3}, (_, i) => v.float(seq + 32 + i * 4));
  requireThat(translations.every(n => Math.abs(n) <= 1e5), 'Invalid translation');
  return {name, fps, translations};
}
