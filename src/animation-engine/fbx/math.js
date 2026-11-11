// Small linear algebra for the FBX import. Column vectors; 3x3 matrices are 9 numbers
// in row-major order (m[r*3+c]); an affine transform is {m, t}: p' = m*p + t.
// Quaternions are x,y,z,w like the rest of the engine (quat.js).

export const IDENTITY3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
export function transpose3(a) { return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]; }
export function mulVec3(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
export function det3(m) { return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]); }
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length3 = a => Math.hypot(a[0], a[1], a[2]);
export function normalize3(a) { const l = length3(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }

export function affineMul(a, b) { return {m: mul3(a.m, b.m), t: add(mulVec3(a.m, b.t), a.t)}; }

/** Rotation about one axis (0 x, 1 y, 2 z) by `degrees`, right-handed. */
export function axisRotation(axis, degrees) {
  const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

// FBX rotation orders (enum value -> axis sequence). "XYZ" means: rotate about X first,
// then Y, then Z, all about the fixed parent axes, i.e. R = Rz * Ry * Rx for column vectors.
export const ROTATION_ORDERS = Object.freeze([[0, 1, 2], [0, 2, 1], [1, 2, 0], [1, 0, 2], [2, 0, 1], [2, 1, 0]]);
export const ROTATION_ORDER_NAMES = Object.freeze(['XYZ', 'XZY', 'YZX', 'YXZ', 'ZXY', 'ZYX']);

/** Euler angles in degrees (x, y, z) -> rotation matrix for an FBX rotation order index. */
export function eulerToMatrix(euler, order = 0) {
  const seq = ROTATION_ORDERS[order];
  let m = axisRotation(seq[0], euler[seq[0]]);
  m = mul3(axisRotation(seq[1], euler[seq[1]]), m);
  return mul3(axisRotation(seq[2], euler[seq[2]]), m);
}

/** Unit quaternion (x,y,z,w) of an orthonormal rotation matrix. */
export function quatFromMatrix(m) {
  const trace = m[0] + m[4] + m[8];
  let x, y, z, w;
  if (trace > 0) { const s = Math.sqrt(trace + 1) * 2; w = s / 4; x = (m[7] - m[5]) / s; y = (m[2] - m[6]) / s; z = (m[3] - m[1]) / s; }
  else if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; w = (m[7] - m[5]) / s; x = s / 4; y = (m[1] + m[3]) / s; z = (m[2] + m[6]) / s; }
  else if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; w = (m[2] - m[6]) / s; x = (m[1] + m[3]) / s; y = s / 4; z = (m[5] + m[7]) / s; }
  else { const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; w = (m[3] - m[1]) / s; x = (m[2] + m[6]) / s; y = (m[5] + m[7]) / s; z = s / 4; }
  const l = Math.hypot(x, y, z, w);
  return [x / l, y / l, z / l, w / l];
}

export function matrixFromQuat(q) {
  const [x, y, z, w] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
}

/**
 * Rotation part of a linear map with (possibly non-uniform) positive scale: Gram-Schmidt
 * on the columns. Returns {q, mirrored}; `mirrored` flags a negative determinant, which
 * no rotation can represent.
 */
export function rotationOf(m) {
  let c0 = normalize3([m[0], m[3], m[6]]);
  let c1 = [m[1], m[4], m[7]];
  c1 = normalize3(sub(c1, scale(c0, dot3(c0, c1))));
  const c2 = cross(c0, c1);
  const mirrored = dot3(c2, [m[2], m[5], m[8]]) < 0;
  return {q: quatFromMatrix([c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]]), mirrored};
}

export function conjugate(q) { return [-q[0], -q[1], -q[2], q[3]]; }

/** Shortest rotation taking unit vector `from` to unit vector `to`. */
export function shortestArc(from, to) {
  const d = dot3(from, to);
  if (d > 1 - 1e-12) return [0, 0, 0, 1];
  if (d < -1 + 1e-9) { // opposite: any perpendicular axis
    let axis = cross(from, [1, 0, 0]); if (length3(axis) < 1e-6) axis = cross(from, [0, 1, 0]);
    axis = normalize3(axis); return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(from, to), w = 1 + d, l = Math.hypot(c[0], c[1], c[2], w);
  return [c[0] / l, c[1] / l, c[2] / l, w / l];
}
