// Reference skeletons. A YCD stores bone *tags* only (u16 per track): hierarchy, rest
// pose and names always come from an external skeleton. This module parses the
// openFormats `.skel` text representation, validates it and evaluates poses.
//
// Parsing is pure text processing: no file access, no evaluation of content.
import {ErrorCode, EngineError, ensure, fail} from './errors.js';
import {boneTagFromName} from './hash.js';
import {multiply, rotate} from './quat.js';

const MAX_SKEL_BYTES = 1024 * 1024, MAX_BONES = 1024, MAX_DEPTH = 256;

/** Parse `.skel` text into {version, bones:[{name, tag, parent, rotation, translation, scale, flags}]}. */
export function parseSkel(text) {
  ensure(typeof text === 'string' && text.length <= MAX_SKEL_BYTES, ErrorCode.INVALID_INPUT, 'Skeleton text missing or too large');
  const tokens = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const next = () => { ensure(i < tokens.length, ErrorCode.SKELETON_INVALID, 'Unexpected end of skeleton'); return tokens[i++]; };
  const expectTok = t => { const v = next(); ensure(v === t, ErrorCode.SKELETON_INVALID, `Expected ${t}`, {found: v.slice(0, 32), at: i}); };
  const num = () => { const v = Number(next()); ensure(Number.isFinite(v), ErrorCode.SKELETON_INVALID, 'Invalid number', {at: i}); return v; };
  expectTok('Version');
  const version = [num(), num()];
  expectTok('{');
  const bones = [];
  let numBones = null;
  const readBone = (parent, depth) => {
    ensure(depth <= MAX_DEPTH, ErrorCode.SKELETON_INVALID, 'Skeleton nesting too deep');
    ensure(bones.length < MAX_BONES, ErrorCode.LIMIT_EXCEEDED, 'Too many bones');
    const name = next(), tag = num();
    const bone = {name, tag, parent, rotation: [0, 0, 0, 1], translation: [0, 0, 0], scale: [1, 1, 1], flags: []};
    const index = bones.push(bone) - 1;
    expectTok('{');
    for (;;) {
      const key = next();
      if (key === '}') break;
      if (key === 'Flags') { while (/^[A-Z_]+$/.test(tokens[i]) && !['RotationQuaternion', 'LocalOffset', 'Scale', 'Children', 'MirrorBoneId', 'Flags'].includes(tokens[i])) bone.flags.push(next()); }
      else if (key === 'MirrorBoneId') bone.mirror = num();
      else if (key === 'RotationQuaternion') bone.rotation = [num(), num(), num(), num()];
      else if (key === 'LocalOffset') bone.translation = [num(), num(), num()];
      else if (key === 'Scale') bone.scale = [num(), num(), num()];
      else if (key === 'Children') {
        const count = num(); expectTok('{');
        for (let c = 0; c < count; c++) { expectTok('Bone'); readBone(index, depth + 1); }
        expectTok('}');
      } else fail(ErrorCode.SKELETON_INVALID, 'Unknown skeleton key', {key: key.slice(0, 32)});
    }
  };
  for (;;) {
    const key = next();
    if (key === '}') break;
    if (key === 'DataCRC') num();
    else if (key === 'NumBones') numBones = num();
    else if (key === 'Bone') readBone(-1, 0);
    else fail(ErrorCode.SKELETON_INVALID, 'Unknown skeleton key', {key: key.slice(0, 32)});
  }
  ensure(i === tokens.length, ErrorCode.SKELETON_INVALID, 'Trailing skeleton data');
  ensure(numBones === null || numBones === bones.length, ErrorCode.SKELETON_INVALID, 'NumBones does not match bones', {declared: numBones, found: bones.length});
  return validateSkeleton({version, bones});
}

/**
 * Validate a skeleton given as explicit data (also used for parsed .skel):
 * unique tags and names, parents before children, no cycles, unit rotations.
 */
export function validateSkeleton(skel) {
  ensure(skel && Array.isArray(skel.bones) && skel.bones.length >= 1 && skel.bones.length <= MAX_BONES, ErrorCode.SKELETON_INVALID, 'Skeleton must list bones');
  const byTag = new Map(), byName = new Map();
  skel.bones.forEach((b, i) => {
    ensure(Number.isInteger(b.tag) && b.tag >= 0 && b.tag <= 0xffff, ErrorCode.SKELETON_INVALID, 'Invalid bone tag', {bone: i});
    ensure(typeof b.name === 'string' && b.name.length > 0 && b.name.length <= 64, ErrorCode.SKELETON_INVALID, 'Invalid bone name', {bone: i});
    ensure(!byTag.has(b.tag), ErrorCode.SKELETON_INVALID, 'Duplicate bone tag', {tag: b.tag, bones: [byTag.get(b.tag), i]});
    ensure(!byName.has(b.name), ErrorCode.SKELETON_INVALID, 'Duplicate bone name', {name: b.name});
    byTag.set(b.tag, i); byName.set(b.name, i);
    ensure(Number.isInteger(b.parent) && b.parent >= -1 && b.parent < skel.bones.length && b.parent !== i, ErrorCode.SKELETON_INVALID, 'Invalid parent', {bone: i});
    for (const v of [...b.rotation, ...b.translation]) ensure(Number.isFinite(v), ErrorCode.NONFINITE_VALUE, 'Non-finite rest transform', {bone: i});
    ensure(Math.abs(Math.hypot(...b.rotation) - 1) < 1e-3, ErrorCode.INVALID_QUATERNION, 'Rest rotation is not unit', {bone: i});
  });
  // Cycle check: walk up from every bone with a step bound.
  skel.bones.forEach((b, i) => {
    let p = b.parent, steps = 0;
    while (p !== -1) { ensure(++steps <= skel.bones.length && p !== i, ErrorCode.CYCLE, 'Skeleton hierarchy loops', {bone: i}); p = skel.bones[p].parent; }
  });
  ensure(skel.bones.filter(b => b.parent === -1).length === 1, ErrorCode.SKELETON_INVALID, 'Skeleton needs exactly one root');
  // Topological order (parents first) for FK.
  const order = [], placed = new Uint8Array(skel.bones.length);
  const place = i => { if (placed[i]) return; const p = skel.bones[i].parent; if (p >= 0) place(p); placed[i] = 1; order.push(i); };
  skel.bones.forEach((_, i) => place(i));
  return {...skel, byTag, byName, order};
}

/** Tags whose stored value differs from the name-derived tag (informational; tags in data are authoritative). */
export function tagNameMismatches(skel) {
  return skel.bones.filter(b => b.tag !== 0 && boneTagFromName(b.name) !== b.tag).map(b => ({name: b.name, tag: b.tag, fromName: boneTagFromName(b.name)}));
}

/**
 * Check that every bone track of an animation names a bone of the skeleton.
 * Mover tracks (5/6) are not skeleton bones. Returns a report; throws SKELETON_MISMATCH
 * when `require` is set and something is missing.
 */
export function matchAnimation(skel, animation, {require = false} = {}) {
  const missing = [], matched = [];
  for (const t of animation.tracks) {
    if (t.track === 5 || t.track === 6) continue;
    (skel.byTag.has(t.boneTag) ? matched : missing).push({boneTag: t.boneTag, track: t.track});
  }
  if (require && missing.length) throw new EngineError(ErrorCode.SKELETON_MISMATCH, 'Animation references bones absent from the skeleton', {missing: missing.slice(0, 32), count: missing.length});
  return {matched: matched.length, missing};
}

/**
 * Forward kinematics for one frame. Animated local rotation/translation replace the
 * rest values of that bone (absolute local transforms; see PROFILE.md for the evidence
 * and the open question); bones without a track keep their rest transform. Scale is
 * ignored (the profile has no scale tracks). Returns world positions [x,y,z] per bone.
 */
export function worldPositions(skel, local) {
  const n = skel.bones.length, wr = new Array(n), wt = new Array(n);
  for (const i of skel.order) {
    const b = skel.bones[i], r = local?.rotation?.get(b.tag) ?? b.rotation, t = local?.translation?.get(b.tag) ?? b.translation;
    if (b.parent < 0) { wr[i] = r; wt[i] = t; continue; }
    const pr = wr[b.parent], pt = wt[b.parent], o = rotate(pr, t);
    wr[i] = multiply(pr, r); wt[i] = [pt[0] + o[0], pt[1] + o[1], pt[2] + o[2]];
  }
  return wt;
}
