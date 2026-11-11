// Shared by scripts/animation-engine/fbx-interop.mjs and tests/animation-fbx-interop.test.js:
// compare a YCD produced by the FBX import with what Blender itself evaluated for the same
// animation (oracle.json written by make-fbx-fixture.py). Offline tooling, not product code.
import {decodeYcd} from '../../src/animation-engine/index.js';
import {resolveSkeleton, targetRest} from '../../src/animation-engine/fbx-convert.js';
import {multiply, rotate, angleBetween} from '../../src/animation-engine/quat.js';
import {quatFromMatrix} from '../../src/animation-engine/fbx-math.js';

/** Reference skeleton as rest positions and axes in model space, for the Blender script. */
export function skeletonForBlender(skeleton = 'male') {
  const {skel} = resolveSkeleton(skeleton), rest = targetRest(skel);
  return {bones: skel.bones.map((b, i) => ({name: b.name, parent: b.parent, head: rest.position[i], x: rotate(rest.rotation[i], [1, 0, 0]), y: rotate(rest.rotation[i], [0, 1, 0]), z: rotate(rest.rotation[i], [0, 0, 1])}))};
}

/**
 * Forward kinematics of a converted YCD, frame by frame, against the oracle take.
 * Returns {frames, maxPositionError (m), maxAngleError (degrees), worst}.
 */
export function compareWithOracle(ycd, oracle, take, skeleton = 'male') {
  const {skel} = resolveSkeleton(skeleton), rest = targetRest(skel);
  const decoded = decodeYcd(ycd, {strict: true});
  if (!decoded.ok) throw new Error(`YCD does not decode: ${decoded.error.code}`);
  const animation = decoded.animations[0], rotation = new Map(), position = new Map();
  for (const t of animation.tracks) { if (t.track === 1) rotation.set(t.boneTag, t.samples); else if (t.track === 0) position.set(t.boneTag, t.samples); }
  const order = oracle.bones.map(name => skel.byName.get(name));
  const result = {frames: animation.frames, oracleFrames: take.frames.length, maxPositionError: 0, maxAngleError: 0, worst: null};
  const count = Math.min(animation.frames, take.frames.length), worldRotation = [], worldPosition = [];
  for (let f = 0; f < count; f++) {
    for (const i of skel.order) {
      const b = skel.bones[i], samples = rotation.get(b.tag);
      const local = samples ? [...samples.slice(f * 4, f * 4 + 4)] : (b.parent < 0 ? [0, 0, 0, 1] : b.rotation);
      if (b.parent < 0) { worldRotation[i] = local; const p = position.get(b.tag); worldPosition[i] = p ? [...p.slice(f * 3, f * 3 + 3)] : b.translation; continue; }
      worldRotation[i] = multiply(worldRotation[b.parent], local);
      const o = rotate(worldRotation[b.parent], b.translation), p = worldPosition[b.parent];
      worldPosition[i] = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
    }
    const frame = take.frames[f];
    order.forEach((i, k) => {
      const expected = frame.positions[k], got = worldPosition[i];
      const distance = Math.hypot(got[0] - expected[0], got[1] - expected[1], got[2] - expected[2]);
      const want = multiply(quatFromMatrix(frame.deltas[k]), rest.rotation[i]);
      const angle = angleBetween(worldRotation[i], 0, want, 0) * 180 / Math.PI;
      if (distance > result.maxPositionError) { result.maxPositionError = distance; result.worst = {bone: skel.bones[i].name, frame: f, kind: 'position', error: distance}; }
      if (angle > result.maxAngleError) result.maxAngleError = angle;
    });
  }
  return result;
}

/** World position of one bone over the frames of a converted YCD (for human-readable checks). */
export function bonePath(ycd, boneName, skeleton = 'male') {
  const {skel} = resolveSkeleton(skeleton);
  const decoded = decodeYcd(ycd, {strict: true}), animation = decoded.animations[0], rotation = new Map(), position = new Map();
  for (const t of animation.tracks) { if (t.track === 1) rotation.set(t.boneTag, t.samples); else if (t.track === 0) position.set(t.boneTag, t.samples); }
  const target = skel.byName.get(boneName), out = [];
  for (let f = 0; f < animation.frames; f++) {
    const wr = [], wp = [];
    for (const i of skel.order) {
      const b = skel.bones[i], samples = rotation.get(b.tag);
      const local = samples ? [...samples.slice(f * 4, f * 4 + 4)] : (b.parent < 0 ? [0, 0, 0, 1] : b.rotation);
      if (b.parent < 0) { wr[i] = local; const p = position.get(b.tag); wp[i] = p ? [...p.slice(f * 3, f * 3 + 3)] : b.translation; continue; }
      wr[i] = multiply(wr[b.parent], local);
      const o = rotate(wr[b.parent], b.translation), p = wp[b.parent];
      wp[i] = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
    }
    out.push(wp[target]);
  }
  return out;
}
