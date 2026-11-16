// New bones (seats, sirens, extras...). The skeleton arrays grow: bones, parent indices, local and
// inverse bind matrices, (child, parent) pairs, the tag lookup buckets and, when present with one
// entry per bone, the fragment FragBoneTransforms. Tags use the vehicle bone hash (ELF of the
// upper-case name), the same rule the existing vehicle bones follow.
// Like yft-grow.js: structures are appended to an extended region, the file is re-read to validate
// and the full writer lays everything out in valid pages.
import {readYftResource, SIZES} from './yft-read.js';
import {repackYft} from './yft-repack.js';
import {boneMatrix, invert} from './yft-write.js';
import {boneTagFromName} from '../animation-engine/hash.js';
import {ErrorCode, ensure} from '../animation-engine/errors.js';
import {Extender} from './yft-grow.js';

const SYS = 0x50000000;
export const MAX_VEHICLE_BONES = 128;

function mulAffine(a, b) {
  const r = a.r.map(row => [0, 1, 2].map(j => row[0] * b.r[0][j] + row[1] * b.r[1][j] + row[2] * b.r[2][j]));
  const t = [0, 1, 2].map(j => a.t[0] * b.r[0][j] + a.t[1] * b.r[1][j] + a.t[2] * b.r[2][j] + b.t[j]);
  return {r, t};
}

/**
 * Add bones to the skeleton. Each item:
 *   {name, parent: bone name (default chassis), translation: [x,y,z] relative to the parent (GTA space),
 *    rotation?: [x,y,z,w], template?: bone name whose flags are copied}
 * Returns {read, regions}: the grown file re-read (validated) and repacked regions.
 */
export function addBones(read, items) {
  const sk = read.model.skeleton;
  ensure(sk, ErrorCode.UNSUPPORTED_STRUCTURE, 'The model has no skeleton');
  ensure(items.length > 0, ErrorCode.INVALID_INPUT, 'No bones to add');
  const total = sk.count + items.length;
  ensure(total <= MAX_VEHICLE_BONES, ErrorCode.LIMIT_EXCEEDED, 'A vehicle skeleton cannot pass 128 bones', {total});
  const names = new Set(sk.bones.map(b => b.name.toLowerCase())), tags = new Set(sk.bones.map(b => b.tag));
  const ext = new Extender(read.resource);
  const src = read.resource.system, dv0 = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const bonesAt = ext.alloc(total * SIZES.bone);
  ext.bytes.copyWithin(bonesAt, sk.bones[0].at, sk.bones[0].at + sk.count * SIZES.bone);
  const all = sk.bones.map(b => ({...b, rotation: [...b.rotation], translation: [...b.translation], scale: [...b.scale]}));
  items.forEach((it, k) => {
    const name = String(it.name);
    ensure(/^[A-Za-z0-9_]{1,63}$/.test(name), ErrorCode.INVALID_INPUT, 'Invalid bone name', {name});
    ensure(!names.has(name.toLowerCase()), ErrorCode.INVALID_INPUT, 'A bone with this name already exists', {name});
    names.add(name.toLowerCase());
    const parent = all.findIndex(b => b.name.toLowerCase() === String(it.parent ?? 'chassis').toLowerCase());
    ensure(parent >= 0, ErrorCode.INVALID_INPUT, 'Parent bone not found', {parent: it.parent});
    const template = sk.bones.find(b => b.name.toLowerCase() === String(it.template ?? '').toLowerCase()) ?? sk.bones[parent];
    let tag = boneTagFromName(name); while (tags.has(tag)) tag = (tag + 1) & 0xffff; tags.add(tag);
    const index = sk.count + k;
    ext.bytes.copyWithin(bonesAt + index * SIZES.bone, template.at, template.at + SIZES.bone);
    // Sibling chain: the parent's last child now points to the new bone.
    const last = all.findLastIndex(b => b.parent === parent && b.sibling === -1);
    if (last >= 0) all[last].sibling = index;
    all.push({index, name, tag, flags: template.flags, parent, sibling: -1, rotation: it.rotation ?? [0, 0, 0, 1], translation: [...it.translation], scale: [1, 1, 1]});
  });
  const nameAt = items.map(it => {
    const s = String(it.name), at = ext.alloc(s.length + 1);
    for (let i = 0; i < s.length; i++) ext.bytes[at + i] = s.charCodeAt(i);
    ext.bytes[at + s.length] = 0; return at;
  });
  let dv = ext.dv;
  all.forEach((b, i) => {
    const at = bonesAt + i * SIZES.bone;
    if (i >= sk.count) {
      b.rotation.forEach((x, k) => dv.setFloat32(at + k * 4, x, true));
      b.translation.forEach((x, k) => dv.setFloat32(at + 0x10 + k * 4, x, true));
      b.scale.forEach((x, k) => dv.setFloat32(at + 0x20 + k * 4, x, true));
      dv.setInt16(at + 0x32, b.parent, true); dv.setUint16(at + 0x40, b.flags, true); dv.setInt16(at + 0x42, i, true);
      dv.setUint16(at + 0x44, b.tag, true); dv.setInt16(at + 0x46, i, true);
      ext.ptr(at + 0x38, nameAt[i - sk.count]); dv = ext.dv;
    }
    dv.setInt16(at + 0x30, b.sibling, true);
  });
  const parentsAt = ext.alloc(total * 2); dv = ext.dv;
  all.forEach((b, i) => dv.setInt16(parentsAt + i * 2, b.parent, true));
  const globals = [];
  for (const b of all) { const local = boneMatrix(b); globals[b.index] = b.parent >= 0 ? mulAffine(local, globals[b.parent]) : local; }
  const matrices = (oldAt, value) => {
    const at = ext.alloc(total * 64), d = ext.dv;
    if (oldAt !== null) ext.bytes.copyWithin(at, oldAt, oldAt + sk.count * 64);
    for (let i = sk.count; i < total; i++) {
      const m = value(i);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) d.setFloat32(at + i * 64 + (r * 4 + c) * 4, m.r[r][c], true);
      for (let c = 0; c < 3; c++) d.setFloat32(at + i * 64 + (12 + c) * 4, m.t[c], true);
    }
    return at;
  };
  const transformsAt = matrices(sk.transformsAt, i => boneMatrix(all[i]));
  const inverseAt = matrices(sk.inverseBindAt, i => invert(globals[i]));
  // (child, parent) pairs, padded to a multiple of 8 values by repeating the last pair.
  const pairs = [];
  if (sk.childIndicesAt !== null) for (let i = 0; i + 1 < sk.childIndexCount; i += 2) pairs.push([dv0.getInt16(sk.childIndicesAt + i * 2, true), dv0.getInt16(sk.childIndicesAt + i * 2 + 2, true)]);
  while (pairs.length > 1 && pairs.at(-1)[0] === pairs.at(-2)[0] && pairs.at(-1)[1] === pairs.at(-2)[1]) pairs.pop();
  for (let i = sk.count; i < total; i++) pairs.push([i, all[i].parent]);
  const values = pairs.flat(); while (values.length % 8) values.push(...pairs.at(-1));
  const childAt = ext.alloc(values.length * 2); dv = ext.dv;
  values.forEach((v, i) => dv.setInt16(childAt + i * 2, v, true));
  // Tag lookup: prepend a node {tag, index, next} to bucket (tag % capacity); the bucket array is edited in place.
  // Some exporters write no tag table at all (pointer 0, capacity 0): then there is nothing to register.
  const bucketsPtr = dv0.getUint32(sk.at + 0x10, true), buckets = bucketsPtr - SYS, cap = dv0.getUint16(sk.at + 0x18, true);
  const hasTable = bucketsPtr !== 0 && cap > 0;
  for (let i = sk.count; i < total && hasTable; i++) {
    const node = ext.alloc(16); dv = ext.dv;
    const slot = buckets + (all[i].tag % cap) * 8;
    dv.setUint32(node, all[i].tag, true); dv.setUint32(node + 4, i, true);
    dv.setUint32(node + 8, dv.getUint32(slot, true), true); dv.setUint32(node + 12, dv.getUint32(slot + 4, true), true);
    ext.ptr(slot, node);
  }
  // The old arrays are dead now: zero them so no stale pointer survives inside a larger block.
  for (const [at, len] of [[sk.bones[0].at, sk.count * SIZES.bone], [sk.parentsAt, sk.count * 2], [sk.childIndicesAt, sk.childIndexCount * 2], [sk.transformsAt, sk.count * 64], [sk.inverseBindAt, sk.count * 64]]) if (at !== null) ext.bytes.fill(0, at, at + len);
  ext.ptr(sk.at + 0x20, bonesAt); ext.ptr(sk.at + 0x38, parentsAt); ext.ptr(sk.at + 0x30, transformsAt); ext.ptr(sk.at + 0x28, inverseAt); ext.ptr(sk.at + 0x40, childAt);
  dv = ext.dv;
  if (hasTable) dv.setUint16(sk.at + 0x1A, dv.getUint16(sk.at + 0x1A, true) + items.length, true);
  dv.setUint16(sk.at + 0x5E, total, true); dv.setUint16(sk.at + 0x60, values.length, true);
  // Fragment bone transforms (one identity 3x4 per bone), when the file has one entry per bone.
  const bt = dv0.getUint32(0xA8, true);
  if (bt) {
    const old = bt - SYS, count = src[old + 0x10];
    if (count === sk.count) {
      const at = ext.alloc(0x20 + total * 48); ext.bytes.copyWithin(at, old, old + 0x20 + count * 48); dv = ext.dv;
      for (let i = count; i < total; i++) for (let r = 0; r < 3; r++) dv.setFloat32(at + 0x20 + i * 48 + (r * 4 + r) * 4, 1, true);
      ext.bytes[at + 0x10] = total; ext.bytes[at + 0x11] = total; ext.ptr(0xA8, at); ext.bytes.fill(0, old, old + 0x20 + count * 48);
    }
  }
  const grown = readYftResource(ext.finish());
  return {read: grown, get regions() { return repackYft(grown); }}; // repack only when asked (chains of operations repack once)
}
