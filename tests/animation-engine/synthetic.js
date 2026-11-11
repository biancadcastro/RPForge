// Deterministic synthetic animation data (no game assets). Shared by tests, fixture
// generation and benchmarks. The skeleton is a generic humanoid-like tree defined here.
import {boneTagFromName} from '../../src/animation-engine/hash.js';
import {fromAxisAngle, multiply} from '../../src/animation-engine/quat.js';

const NAMES = [
  ['SKEL_ROOT', -1], ['SKEL_Pelvis', 0], ['SKEL_Spine0', 1], ['SKEL_Spine1', 2], ['SKEL_Spine2', 3], ['SKEL_Neck_1', 4], ['SKEL_Head', 5],
  ['SKEL_L_Clavicle', 4], ['SKEL_L_UpperArm', 7], ['SKEL_L_Forearm', 8], ['SKEL_L_Hand', 9],
  ['SKEL_R_Clavicle', 4], ['SKEL_R_UpperArm', 11], ['SKEL_R_Forearm', 12], ['SKEL_R_Hand', 13],
  ['SKEL_L_Thigh', 1], ['SKEL_L_Calf', 15], ['SKEL_L_Foot', 16], ['SKEL_R_Thigh', 1], ['SKEL_R_Calf', 18], ['SKEL_R_Foot', 19],
];

/** Synthetic skeleton with `count` bones (extra bones form finger-like chains under the hands). */
export function syntheticSkeleton(count = NAMES.length) {
  const bones = NAMES.slice(0, count).map(([name, parent], i) => ({name, tag: i === 0 ? 0 : boneTagFromName(name), parent, rotation: [0, 0, 0, 1], translation: i === 0 ? [0, 0, 0] : [0.1, 0, 0], scale: [1, 1, 1], flags: []}));
  for (let i = bones.length; i < count; i++) {
    const name = `SYN_Extra_${i}`, parent = (i % 3 === 0) ? 10 : i - 1;
    bones.push({name, tag: boneTagFromName(name), parent: parent >= bones.length ? 10 : parent, rotation: [0, 0, 0, 1], translation: [0.02, 0, 0], scale: [1, 1, 1], flags: []});
  }
  return {version: [0, 0], bones};
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

/**
 * Emote-like animation over a skeleton: every non-root bone gets a rotation track
 * (smooth oscillation around a per-bone axis), the pelvis a position track; options add
 * constant tracks, a mover track, hemisphere crossings and near-180-degree rotations.
 */
export function syntheticAnimation({name = 'synthetic_emote', bones = 21, frames = 31, fps = 30, seed = 1, mover = false, constantBones = 0, spin = false, nearPi = false} = {}) {
  const skel = syntheticSkeleton(bones), r = rng(seed), tracks = [];
  skel.bones.forEach((b, i) => {
    if (i === 0) return;
    const axis = [r() - 0.5, r() - 0.5, r() - 0.5], amp = 0.2 + r() * 0.9, phase = r() * 6.28, speed = 0.5 + r() * 3;
    const values = [];
    for (let f = 0; f < frames; f++) {
      let angle = i <= constantBones ? amp : amp * Math.sin(phase + speed * f / fps);
      if (spin && i === 1) angle = 4 * Math.PI * f / (frames - 1);           // two full turns: every component changes sign
      if (nearPi && i === 2) angle = Math.PI - 1e-4;                           // static rotation with w ~ 5e-5
      let q = multiply(fromAxisAngle([0, 0, 1], 0.05 * i), fromAxisAngle(axis, angle));
      if (f % 7 === 3) q = q.map(v => -v);                                      // q and -q mixed in the input
      values.push(...q);
    }
    tracks.push({bone: b.tag, type: 'rotation', values});
  });
  tracks.push({bone: skel.bones[1].tag, type: 'position', values: Array.from({length: frames}, (_, f) => [0.01 * Math.sin(f / 4), 0.02 * Math.cos(f / 5), 0.95 + 0.03 * Math.sin(f / 3)]).flat()});
  if (mover) {
    tracks.push({bone: 0, type: 'moverPosition', values: Array.from({length: frames}, (_, f) => [0, 1.4 * f / fps, 0]).flat()});
    tracks.push({bone: 0, type: 'moverRotation', values: Array.from({length: frames}, (_, f) => fromAxisAngle([0, 0, 1], 0.6 * f / frames)).flat()});
  }
  return {animation: {name, fps, frames, tracks}, skeleton: skel};
}
