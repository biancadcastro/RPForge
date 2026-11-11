// Test helper: express a KNOWN animation of the GTA skeleton as an FBX file written in
// foreign conventions (other axes, units, bone orientations, pre-rotation, rotation
// orders, a transformed armature node). The math here is deliberately independent from
// src/animation-engine/fbx-*.js so the round trip is not a self-comparison.
import {buildFbx} from './fbx-builder.js';

// --- independent small math (row-major 3x3, quaternions x,y,z,w) --------------------
export const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
export const qconj = q => [-q[0], -q[1], -q[2], q[3]];
export const qaxis = (axis, degrees) => { const l = Math.hypot(...axis), h = degrees * Math.PI / 360, s = Math.sin(h) / l; return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)]; };
export const qrot = (q, v) => { const m = qmat(q); return mv(m, v); };
export function qmat([x, y, z, w]) {
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}
const mm = (a, b) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]); return o; };
const mt = a => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
function axisMatrix(axis, degrees) {
  const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return axis === 0 ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === 1 ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1];
}
const ORDERS = [[0, 1, 2], [0, 2, 1], [1, 2, 0], [1, 0, 2], [2, 0, 1], [2, 1, 0]];
/** FBX Euler (degrees, order index) -> matrix: first axis applied first, about fixed axes. */
export function eulerMatrix(e, order) { const [i, j, k] = ORDERS[order]; return mm(axisMatrix(k, e[k]), mm(axisMatrix(j, e[j]), axisMatrix(i, e[i]))); }
/** Inverse of eulerMatrix (away from gimbal lock). */
export function matrixEuler(m, order) {
  const [i, j, k] = ORDERS[order], s = ((j - i + 3) % 3 === 1) ? 1 : -1, deg = 180 / Math.PI, e = [0, 0, 0];
  e[j] = Math.asin(Math.max(-1, Math.min(1, -s * m[k * 3 + i]))) * deg;
  e[i] = Math.atan2(s * m[k * 3 + j], m[k * 3 + k]) * deg;
  e[k] = Math.atan2(s * m[j * 3 + i], m[i * 3 + i]) * deg;
  return e;
}
export function shortArc(from, to) {
  const n = v => { const l = Math.hypot(...v); return v.map(x => x / l); }, a = n(from), b = n(to);
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], w = 1 + a[0] * b[0] + a[1] * b[1] + a[2] * b[2], l = Math.hypot(...c, w);
  return [c[0] / l, c[1] / l, c[2] / l, w / l];
}
export function seeded(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
/** Angle between two rotations in degrees (q and -q are the same rotation; inputs need not be unit length). */
export const angleDegrees = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) / (Math.hypot(...a) * Math.hypot(...b)))) * 180 / Math.PI;

/**
 * Forward kinematics of a skeleton in the game's model space. `locals(i)` returns the
 * local rotation of bone i (the root's is relative to model space: identity = bind).
 */
export function fk(skel, locals, rootPosition) {
  const rotation = [], position = [];
  for (const i of skel.order) {
    const b = skel.bones[i];
    if (b.parent < 0) { rotation[i] = locals(i); position[i] = rootPosition ?? b.translation; continue; }
    rotation[i] = qmul(rotation[b.parent], locals(i));
    const o = qrot(rotation[b.parent], b.translation), p = position[b.parent];
    position[i] = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
  }
  return {rotation, position};
}
/** Rest local rotation used by animations: the skeleton's, with the root as identity. */
export const restLocal = skel => i => (skel.bones[i].parent < 0 ? [0, 0, 0, 1] : skel.bones[i].rotation);

// Basis presets: FBX world vector = basis * game vector * unitsPerMetre.
export const BASIS = {
  yUp: {matrix: [-1, 0, 0, 0, 0, 1, 0, 1, 0], settings: {upAxis: 1, frontAxis: 2, coordAxis: 0}},               // Maya/Mixamo: faces +Z, left is +X
  zUpFacingMinusY: {matrix: [-1, 0, 0, 0, -1, 0, 0, 0, 1], settings: {upAxis: 2, frontAxis: 1, frontAxisSign: -1, coordAxis: 0}}, // Blender scene
  zUpFacingPlusX: {matrix: [0, 1, 0, -1, 0, 0, 0, 0, 1], settings: {upAxis: 2, frontAxis: 0, coordAxis: 1}},   // quarter turn
};

/**
 * Build an FBX from world-space poses.
 *   bones: [{name, parent (index in this list or -1), target (bone index in skel)}]
 *   pose(frame) -> {rotation[], position[]} in game model space, indexed by skel bone index
 *   rest       -> same shape: the bind pose written to the file
 * options: {basis, unitsPerMetre, fps, frames, seed, version, ascii, compress, bindPose (true),
 *           armature ({rotation:[deg], scale}), takeName, extraTakes, defaultsFromFrame}
 */
export function fbxFromPoses(skel, bones, pose, rest, options = {}) {
  const {basis = BASIS.yUp, unitsPerMetre = 100, fps = 30, frames = 31, seed = 7, bindPose = true, armature = {rotation: [-90, 0, 0], scale: 100}, takeName = 'Take 001'} = options;
  const rnd = seeded(seed), B = basis.matrix, u = unitsPerMetre;
  const armRot = eulerMatrix(armature.rotation, 0), armScale = armature.scale, armPos = options.armaturePosition ?? [0, 0, 0];
  // Fixed per-bone conventions of the "other program".
  const conv = bones.map(() => ({
    frame: qmat(qaxis([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], rnd() * 360)),              // how that program orients the bone's own axes
    pre: rnd() < 0.6 ? [rnd() * 180 - 90, rnd() * 180 - 90, rnd() * 180 - 90] : null,       // PreRotation
    order: Math.floor(rnd() * 6),
  }));
  const world = p => bones.map((b, k) => ({m: mm(mm(B, qmat(p.rotation[b.target])), conv[k].frame), t: mv(B, p.position[b.target]).map(v => v * u)}));
  const local = (w, k, previous) => {
    const b = bones[k], parentM = b.parent >= 0 ? w[b.parent].m : armRot, parentT = b.parent >= 0 ? w[b.parent].t : armPos, s = armScale; // the armature's uniform scale reaches every bone below it
    const d = [w[k].t[0] - parentT[0], w[k].t[1] - parentT[1], w[k].t[2] - parentT[2]];
    const translation = mv(mt(parentM), d).map(v => v / s);
    let rot = mm(mt(parentM), w[k].m);
    if (conv[k].pre) rot = mm(mt(eulerMatrix(conv[k].pre, 0)), rot);
    const euler = matrixEuler(rot, conv[k].order);
    if (previous) for (let c = 0; c < 3; c++) while (euler[c] - previous[c] > 180) euler[c] -= 360;
    if (previous) for (let c = 0; c < 3; c++) while (euler[c] - previous[c] < -180) euler[c] += 360;
    return {translation, euler};
  };
  const times = Array.from({length: frames}, (_, f) => f / fps);
  const tracks = bones.map(() => ({T: [[], [], []], R: [[], [], []]}));
  const last = bones.map(() => null);
  for (let f = 0; f < frames; f++) {
    const w = world(pose(f));
    bones.forEach((_, k) => { const l = local(w, k, last[k]); last[k] = l.euler; for (let c = 0; c < 3; c++) { tracks[k].T[c].push(l.translation[c]); tracks[k].R[c].push(l.euler[c]); } });
  }
  const restWorld = world(rest), defaults = options.defaultsFromFrame !== undefined ? world(pose(options.defaultsFromFrame)) : restWorld;
  const models = [{name: 'Armature', type: 'Null', rotation: armature.rotation, scaling: [armScale, armScale, armScale], translation: armPos}];
  const curves = [];
  bones.forEach((b, k) => {
    const d = local(defaults, k, null);
    models.push({name: b.name, parent: b.parent >= 0 ? bones[b.parent].name : 'Armature', translation: d.translation, rotation: d.euler, preRotation: conv[k].pre ?? undefined, rotationOrder: conv[k].order, rotationActive: true});
    for (let c = 0; c < 3; c++) {
      curves.push({model: b.name, channel: 'R', axis: c, times, values: tracks[k].R[c]});
      if (b.parent < 0 || options.translationCurves) curves.push({model: b.name, channel: 'T', axis: c, times, values: tracks[k].T[c]});
    }
  });
  const pose4 = w => [w.m[0], w.m[3], w.m[6], 0, w.m[1], w.m[4], w.m[7], 0, w.m[2], w.m[5], w.m[8], 0, w.t[0], w.t[1], w.t[2], 1];
  const timeMode = {24: 11, 25: 10, 30: 6, 60: 3}[fps];
  return buildFbx({
    version: options.version, ascii: options.ascii, compress: options.compress,
    settings: {...basis.settings, unitScaleFactor: 100 / u, ...(timeMode ? {timeMode} : {timeMode: 14, customFrameRate: fps})},
    models: [...models, ...(options.extraModels ?? [])],
    bindPose: bindPose ? bones.map((b, k) => ({model: b.name, matrix: pose4(restWorld[k])})) : [],
    takes: [{name: takeName, start: 0, stop: (frames - 1) / fps, curves}, ...(options.extraTakes ?? [])],
  });
}

/** A deterministic, smooth, clearly non-trivial animation of every listed bone. */
export function knownAnimation(skel, animated, {frames = 31, seed = 3, amplitude = 35} = {}) {
  const rnd = seeded(seed), rest = restLocal(skel), set = new Map();
  for (const i of animated) set.set(i, {axis: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], amp: amplitude * (0.3 + 0.7 * rnd()), cycles: 1 + Math.floor(rnd() * 2), phase: rnd() * 6});
  const root = skel.order[0];
  const locals = f => i => {
    const a = set.get(i);
    if (!a) return rest(i);
    return qmul(rest(i), qaxis(a.axis, a.amp * Math.sin(2 * Math.PI * a.cycles * f / (frames - 1) + a.phase)));
  };
  const rootPosition = f => { const r = skel.bones[root].translation, p = 2 * Math.PI * f / (frames - 1); return [r[0] + 0.3 * Math.sin(p), r[1] + 0.5 * f / (frames - 1), r[2] - 0.1 * (1 - Math.cos(p))]; };
  return {frames, locals, rootPosition, pose: f => fk(skel, locals(f), rootPosition(f)), rest: fk(skel, rest)};
}
