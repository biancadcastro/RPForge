// FBX animation curve evaluation. A curve is a list of keys (time, value) with a
// per-key interpolation mode for the segment that STARTS at the key:
//   constant (0x2)  hold the key value (or the next key's with the "next" flag 0x100)
//   linear   (0x4)  straight line
//   cubic    (0x8)  Bezier segment defined by the key's right slope and the next key's left
//                   slope (value per second), optionally weighted (0x01000000/0x02000000).
// With the default weights (1/3) the Bezier segment is exactly a cubic Hermite spline in
// time, which is what is evaluated here; weighted segments solve the time polynomial
// numerically. TCB keys (0x200) store tension/continuity/bias instead of slopes: they are
// evaluated as straight lines and reported (`tcbKeys`) so the caller can warn.
// Outside the key range the curve holds its first/last value (no pre/post extrapolation).
// Evidence level: constant/linear are exercised against Blender-exported files; the cubic
// path follows the public description of the format and is covered by synthetic tests only.
import {ErrorCode, ensure} from './errors.js';

export const KTIME_PER_SECOND = 46186158000;
const CONSTANT = 0x2, LINEAR = 0x4, CUBIC = 0x8, TCB = 0x200, CONSTANT_NEXT = 0x100, WEIGHTED_RIGHT = 0x01000000, WEIGHTED_NEXT_LEFT = 0x02000000;
const DEFAULT_WEIGHT = 1 / 3;

/**
 * Validate raw curve arrays and expand the shared key attributes to one entry per key.
 * `raw` = {times (KTime), values, flags?, data?, refs?, asciiBits}.
 */
export function prepareCurve(raw, limits) {
  const count = raw.times.length;
  ensure(count === raw.values.length, ErrorCode.FBX_INVALID, 'FBX curve key arrays differ in length');
  ensure(count <= limits.maxKeysPerCurve, ErrorCode.LIMIT_EXCEEDED, 'Too many keys in an FBX curve', {keys: count});
  const times = new Float64Array(count), values = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const t = raw.times[i] / KTIME_PER_SECOND, v = raw.values[i];
    ensure(Number.isFinite(t) && Number.isFinite(v), ErrorCode.NONFINITE_VALUE, 'Non-finite FBX curve key');
    ensure(i === 0 || t >= times[i - 1], ErrorCode.FBX_INVALID, 'FBX curve keys are not in time order');
    times[i] = t; values[i] = v;
  }
  const curve = {times, values, flags: null, slopes: null, weights: null, cubicKeys: 0, tcbKeys: 0, constantKeys: 0};
  const {flags, data, refs} = raw;
  if (!flags || !data || !refs || flags.length !== refs.length || data.length !== flags.length * 4) return curve; // no attributes: linear
  let total = 0; for (const r of refs) total += r;
  if (total !== count) return curve;
  // Attribute data is four float32 slots per attribute; slot 2 packs the two weights as int16.
  const floats = new Float32Array(data.length), bits = new Int32Array(floats.buffer);
  if (raw.asciiBits) for (let i = 0; i < data.length; i++) bits[i] = data[i]; else floats.set(data);
  curve.flags = new Int32Array(count); curve.slopes = new Float64Array(count * 2); curve.weights = new Float64Array(count * 2);
  let key = 0;
  for (let a = 0; a < flags.length; a++) {
    const f = flags[a] | 0, packed = bits[a * 4 + 2];
    const wr = (f & WEIGHTED_RIGHT) ? (packed & 0xffff) / 9999 : DEFAULT_WEIGHT, wl = (f & WEIGHTED_NEXT_LEFT) ? ((packed >>> 16) & 0xffff) / 9999 : DEFAULT_WEIGHT;
    for (let r = 0; r < refs[a]; r++, key++) {
      curve.flags[key] = f;
      curve.slopes[key * 2] = floats[a * 4]; curve.slopes[key * 2 + 1] = floats[a * 4 + 1];
      curve.weights[key * 2] = wr; curve.weights[key * 2 + 1] = wl;
      if (f & CUBIC) { if (f & TCB) curve.tcbKeys++; else curve.cubicKeys++; } else if (f & CONSTANT) curve.constantKeys++;
    }
  }
  return curve;
}

/** Value of a prepared curve at time `t` (seconds). */
export function evaluateCurve(curve, t) {
  const {times, values} = curve, n = times.length;
  if (n === 0) return NaN;
  if (t <= times[0]) return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
  const t0 = times[lo], t1 = times[hi], v0 = values[lo], v1 = values[hi], dt = t1 - t0;
  if (!(dt > 0)) return v1;
  const flags = curve.flags ? curve.flags[lo] : LINEAR, u = (t - t0) / dt;
  if ((flags & CUBIC) && !(flags & TCB)) {
    const s0 = curve.slopes[lo * 2], s1 = curve.slopes[lo * 2 + 1], w0 = curve.weights[lo * 2], w1 = curve.weights[lo * 2 + 1];
    if (!Number.isFinite(s0) || !Number.isFinite(s1)) return v0 + (v1 - v0) * u;
    let s = u;
    if (Math.abs(w0 - DEFAULT_WEIGHT) > 1e-4 || Math.abs(w1 - DEFAULT_WEIGHT) > 1e-4) {
      // Weighted Bezier: time(s) = 3(1-s)^2 s w0 + 3(1-s) s^2 (1-w1) + s^3 is monotonic for weights in [0,1].
      const a = Math.min(Math.max(w0, 0), 1), b = 1 - Math.min(Math.max(w1, 0), 1);
      let low = 0, high = 1;
      for (let i = 0; i < 48; i++) { s = (low + high) / 2; const x = 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s; if (x < u) low = s; else high = s; }
      const p1 = v0 + w0 * dt * s0, p2 = v1 - w1 * dt * s1, r = 1 - s;
      return r * r * r * v0 + 3 * r * r * s * p1 + 3 * r * s * s * p2 + s * s * s * v1;
    }
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * dt * s0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * dt * s1;
  }
  if ((flags & CONSTANT) && !(flags & (LINEAR | CUBIC))) return (flags & CONSTANT_NEXT) ? v1 : v0;
  return v0 + (v1 - v0) * u;
}
