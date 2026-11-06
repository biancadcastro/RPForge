// Quaternion conventions for the engine (documented in docs/animation-engine/PROFILE.md):
//  - storage order x, y, z, w (same as YCD channels and the .skel reference);
//  - unit quaternions represent rotations; q and -q are the same rotation;
//  - comparisons use the rotation angle of q1^-1 * q2, i.e. 2*acos(|q1.q2|);
//  - interpolation between samples is normalized lerp after hemisphere alignment.
// Euler angles are never accepted as quaternions; a conversion must be explicit.
import {ErrorCode, ensure} from './errors.js';

// Quantized quaternions in real files deviate up to ~0.27% from unit length (survey);
// inputs within 0.5% are normalized, anything further is refused.
export const UNIT_TOLERANCE = 5e-3;

export function dot(a, ai, b, bi) { return a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2] + a[ai + 3] * b[bi + 3]; }

/** Normalize in place; refuses NaN/Infinity, near-zero and clearly non-unit input. */
export function normalizeChecked(q, i, what, tolerance = UNIT_TOLERANCE) {
  const x = q[i], y = q[i + 1], z = q[i + 2], w = q[i + 3];
  ensure(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && Number.isFinite(w), ErrorCode.NONFINITE_VALUE, `Non-finite quaternion in ${what}`);
  const len = Math.hypot(x, y, z, w);
  ensure(len > 1e-6 && Math.abs(len - 1) <= tolerance, ErrorCode.INVALID_QUATERNION, `Quaternion is not unit length in ${what}`, {length: len});
  q[i] = x / len; q[i + 1] = y / len; q[i + 2] = z / len; q[i + 3] = w / len;
}

/** Flip samples so consecutive quaternions lie in the same hemisphere (no long-way interpolation). */
export function alignHemispheres(q, count) {
  let flips = 0;
  for (let f = 1; f < count; f++) {
    if (dot(q, (f - 1) * 4, q, f * 4) < 0) { for (let k = 0; k < 4; k++) q[f * 4 + k] = -q[f * 4 + k]; flips++; }
  }
  return flips;
}

/** Angle (radians) between the rotations of two quaternions; q/-q equivalent; inputs need not be unit. */
export function angleBetween(a, ai, b, bi) {
  const la = Math.hypot(a[ai], a[ai + 1], a[ai + 2], a[ai + 3]), lb = Math.hypot(b[bi], b[bi + 1], b[bi + 2], b[bi + 3]);
  if (!(la > 0 && lb > 0)) return Math.PI;
  const d = Math.min(1, Math.abs(dot(a, ai, b, bi)) / (la * lb));
  return 2 * Math.acos(d);
}

/** Normalized lerp with hemisphere alignment, writing into out[oi..oi+3]. */
export function nlerp(a, ai, b, bi, t, out, oi) {
  const s = dot(a, ai, b, bi) < 0 ? -1 : 1;
  let x = a[ai] + (s * b[bi] - a[ai]) * t, y = a[ai + 1] + (s * b[bi + 1] - a[ai + 1]) * t;
  let z = a[ai + 2] + (s * b[bi + 2] - a[ai + 2]) * t, w = a[ai + 3] + (s * b[bi + 3] - a[ai + 3]) * t;
  const len = Math.hypot(x, y, z, w) || 1;
  out[oi] = x / len; out[oi + 1] = y / len; out[oi + 2] = z / len; out[oi + 3] = w / len;
}

/** Hamilton product a*b for (x,y,z,w) quaternions. */
export function multiply(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
export function fromAxisAngle(axis, angle) {
  const n = Math.hypot(...axis), s = Math.sin(angle / 2) / n;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}
/** Rotate vector v by unit quaternion q. */
export function rotate(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
