// Writer for the skeletal YCD profile `ycd-skel-v1` (see docs/animation-engine/PROFILE.md).
// One clip, one animation, one Sequence block, bone position/rotation tracks and
// optional mover (root motion) tracks. Every structural choice below mirrors a
// convention observed in the local real-file survey or in the reference layout;
// none of it has been verified in GTA V/FiveM yet.
import {ErrorCode, ensure, fail} from './errors.js';
import {encodeEnvelope, YCD_RESOURCE_VERSION, SYSTEM_BASE} from './envelope.js';
import {resolveLimits} from './limits.js';
import {ChannelType} from './channels.js';
import {BitWriter, floatBits} from './bits.js';
import {joaat} from './hash.js';
import {normalizeChecked, alignHemispheres, angleBetween} from './quat.js';

export const PROFILE_ID = 'ycd-skel-v1';
export const PROFILE_LIMITS = Object.freeze({minFrames: 2, maxFrames: 1800, maxFps: 120, maxTracks: 512, maxAbsPosition: 10000});
export const TRACK_TYPES = Object.freeze({position: {id: 0, dataType: 0, size: 3}, rotation: {id: 1, dataType: 1, size: 4}, moverPosition: {id: 5, dataType: 0, size: 3}, moverRotation: {id: 6, dataType: 1, size: 4}});
export const DEFAULT_ENCODING = Object.freeze({mode: 'quantized', positionTolerance: 1e-4, rotationComponentTolerance: 5e-5, staticRotationAngleTolerance: 1e-4});
const fr = Math.fround;

class Arena {
  constructor() { this.bytes = new Uint8Array(4096); this.dv = new DataView(this.bytes.buffer); this.cursor = 0; }
  allocate(size) {
    const at = (this.cursor + 15) & ~15;
    if (at + size > this.bytes.length) {
      let cap = this.bytes.length; while (cap < at + size) cap *= 2;
      const next = new Uint8Array(cap); next.set(this.bytes); this.bytes = next; this.dv = new DataView(next.buffer);
    }
    this.cursor = at + size; return at;
  }
  ptr(at, target) { this.dv.setUint32(at, SYSTEM_BASE + target, true); this.dv.setUint32(at + 4, 0, true); }
  u8(at, v) { this.bytes[at] = v; }
  u16(at, v) { this.dv.setUint16(at, v, true); }
  u32(at, v) { this.dv.setUint32(at, v >>> 0, true); }
  f32(at, v) { this.dv.setFloat32(at, v, true); }
  finish() { return this.bytes.slice(0, this.cursor); }
}

function validateInput(input) {
  ensure(input && typeof input === 'object', ErrorCode.INVALID_INPUT, 'Animation must be an object');
  const {name, fps, frames, tracks} = input;
  // Lower-case, no path or extension separators; '@' and '-' occur in real clip names.
  ensure(typeof name === 'string' && /^[a-z0-9][a-z0-9_@-]{0,63}$/.test(name), ErrorCode.INVALID_INPUT, 'Invalid clip name');
  // Timing: integer fps (duration = (frames - 1) / fps) or an explicit duration, e.g. when
  // re-encoding a file whose duration follows another convention (frames / fps).
  if (input.duration === undefined) ensure(Number.isInteger(fps) && fps >= 1 && fps <= PROFILE_LIMITS.maxFps, ErrorCode.INVALID_INPUT, 'Invalid fps');
  else ensure(fps === undefined && Number.isFinite(input.duration) && input.duration > 0 && (frames - 1) / input.duration <= PROFILE_LIMITS.maxFps && (frames - 1) / input.duration >= 1 / 60, ErrorCode.INVALID_INPUT, 'Invalid duration');
  ensure(Number.isInteger(frames) && frames >= PROFILE_LIMITS.minFrames && frames <= PROFILE_LIMITS.maxFrames, ErrorCode.LIMIT_EXCEEDED, 'Frame count outside profile', {frames, max: PROFILE_LIMITS.maxFrames});
  ensure(Array.isArray(tracks) && tracks.length >= 1 && tracks.length <= PROFILE_LIMITS.maxTracks, ErrorCode.LIMIT_EXCEEDED, 'Track count outside profile', {tracks: tracks?.length});
  const seen = new Set();
  return tracks.map((t, i) => {
    const spec = TRACK_TYPES[t?.type];
    ensure(spec !== undefined, ErrorCode.INVALID_INPUT, 'Unknown track type', {track: i, type: t?.type});
    ensure(Number.isInteger(t.bone) && t.bone >= 0 && t.bone <= 0xffff, ErrorCode.INVALID_INPUT, 'Invalid bone tag', {track: i});
    ensure(!(spec.id >= 5) || t.bone === 0, ErrorCode.INVALID_INPUT, 'Mover tracks use bone tag 0', {track: i});
    const key = `${t.bone}:${spec.id}`;
    ensure(!seen.has(key), ErrorCode.INVALID_INPUT, 'Duplicate bone/track pair', {track: i, bone: t.bone, type: t.type});
    seen.add(key);
    const v = t.values;
    ensure(v && typeof v.length === 'number' && v.length === frames * spec.size, ErrorCode.INVALID_INPUT, 'Track sample count does not match frames', {track: i});
    const values = Float64Array.from(v);
    if (spec.size === 3) {
      for (let k = 0; k < values.length; k++) {
        ensure(Number.isFinite(values[k]), ErrorCode.NONFINITE_VALUE, 'Non-finite position sample', {track: i, sample: k});
        ensure(Math.abs(values[k]) <= PROFILE_LIMITS.maxAbsPosition, ErrorCode.INVALID_INPUT, 'Position outside profile range', {track: i, sample: k});
      }
    } else {
      for (let f = 0; f < frames; f++) normalizeChecked(values, f * 4, `track ${i} frame ${f}`);
    }
    return {index: i, bone: t.bone, type: t.type, spec, values};
  });
}

/** Choose and verify the encoding of one component series. Returns channel descriptors. */
function encodeComponent(series, mode, tolerance) {
  const f32 = Float32Array.from(series);
  let min = Infinity, max = -Infinity;
  for (const v of f32) { if (v < min) min = v; if (v > max) max = v; }
  if (min === max) return {type: ChannelType.StaticFloat, value: f32[0], decoded: f32, maxError: maxAbsDiff(series, f32)};
  if (mode === 'raw') return {type: ChannelType.RawFloat, values: f32, decoded: f32, maxError: maxAbsDiff(series, f32)};
  const offset = fr(min), range = max - min;
  for (let bits = Math.max(1, Math.ceil(Math.log2(range / (2 * tolerance) + 1))); bits <= 24; bits++) {
    const quantum = fr(range / (2 ** bits - 1));
    if (!(quantum > 0)) continue;
    const top = 2 ** bits - 1, codes = new Uint32Array(f32.length), decoded = new Float32Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const q = Math.min(top, Math.max(0, Math.round((f32[i] - offset) / quantum)));
      codes[i] = q; decoded[i] = fr(fr(fr(q) * quantum) + offset);
    }
    const err = maxAbsDiff(series, decoded);
    if (err <= tolerance) return {type: ChannelType.QuantizeFloat, bits, quantum, offset, codes, decoded, maxError: err};
  }
  return {type: ChannelType.RawFloat, values: f32, decoded: f32, maxError: maxAbsDiff(series, f32)};
}
function maxAbsDiff(a, b) { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; }

function planTrack(t, frames, enc) {
  const n = t.spec.size, comps = [];
  for (let c = 0; c < n; c++) comps.push(Float64Array.from({length: frames}, (_, f) => t.values[f * n + c]));
  const report = {bone: t.bone, type: t.type};
  if (n === 4) {
    report.hemisphereFlips = alignHemispheres(t.values, frames);
    for (let c = 0; c < 4; c++) for (let f = 0; f < frames; f++) comps[c][f] = t.values[f * 4 + c];
  }
  const constant = comps.every(s => { const a = fr(s[0]); return s.every(v => fr(v) === a); });
  if (constant && n === 3) {
    const value = comps.map(s => fr(s[0]));
    report.encoding = 'StaticVector3'; report.maxPositionError = Math.max(...comps.map((s, c) => Math.abs(s[0] - value[c])));
    return {channels: [{type: ChannelType.StaticVector3, index: 0, value}], report};
  }
  if (constant && n === 4) {
    // Static quaternion stores x, y, z; the reader rebuilds w >= 0, so canonicalize to w >= 0.
    const q = comps.map(s => s[0]); if (q[3] < 0) for (let k = 0; k < 4; k++) q[k] = -q[k];
    const xyz = q.slice(0, 3).map(fr);
    const w = fr(Math.sqrt(Math.max(fr(1 - fr(fr(fr(xyz[0] * xyz[0]) + fr(xyz[1] * xyz[1])) + fr(xyz[2] * xyz[2]))), 0)));
    const err = angleBetween(q, 0, [...xyz, w], 0);
    if (err <= enc.staticRotationAngleTolerance) {
      report.encoding = 'StaticQuaternion'; report.maxAngleError = err;
      return {channels: [{type: ChannelType.StaticQuaternion, index: 0, value: xyz}], report};
    }
    // Near 180 degrees the rebuilt w loses precision: keep four exact static components.
  }
  const tol = n === 3 ? enc.positionTolerance : enc.rotationComponentTolerance;
  const channels = comps.map((s, c) => ({...encodeComponent(s, enc.mode, tol), index: c}));
  report.encoding = channels.map(c => ['', '', 'StaticFloat', 'RawFloat', 'QuantizeFloat'][c.type]).join('+');
  if (n === 3) report.maxPositionError = Math.max(...channels.map(c => c.maxError));
  else {
    let worst = 0; const dq = new Float64Array(4), sq = new Float64Array(4);
    for (let f = 0; f < frames; f++) {
      for (let c = 0; c < 4; c++) { dq[c] = channels[c].decoded[f]; sq[c] = comps[c][f]; }
      worst = Math.max(worst, angleBetween(sq, 0, dq, 0));
    }
    report.maxAngleError = worst; report.maxComponentError = Math.max(...channels.map(c => c.maxError));
  }
  return {channels, report};
}

/**
 * Encode an animation into YCD bytes. Returns {bytes, report}. Never returns partial
 * output: any violation throws an EngineError before bytes exist.
 */
export function writeSkeletalYcd(input, options = {}) {
  const limits = resolveLimits(options.limits);
  const enc = {...DEFAULT_ENCODING, ...(options.encoding ?? {})};
  ensure(enc.mode === 'quantized' || enc.mode === 'raw', ErrorCode.INVALID_INPUT, 'Unknown encoding mode');
  for (const k of ['positionTolerance', 'rotationComponentTolerance', 'staticRotationAngleTolerance']) ensure(Number.isFinite(enc[k]) && enc[k] > 0 && enc[k] < 0.1, ErrorCode.INVALID_INPUT, `Invalid ${k}`);
  const {name, fps, frames} = input ?? {};
  const tracks = validateInput(input);
  // File order: (track id, bone tag) ascending, the dominant order in surveyed files.
  tracks.sort((a, b) => a.spec.id - b.spec.id || a.bone - b.bone);
  const plans = tracks.map(t => planTrack(t, frames, enc));

  // Channel lists per type, in track order then component index.
  const lists = Array.from({length: 9}, () => []);
  plans.forEach((p, seq) => { for (const ch of p.channels) lists[ch.type].push({...ch, sequence: seq, mover: tracks[seq].spec.id >= 5}); });
  let main = 0, bit = 0;
  const mainParts = [];
  for (let type = 0; type < 9; type++) for (const ch of lists[type]) {
    ch.dataIntOffset = main / 4;
    if (type === ChannelType.StaticQuaternion || type === ChannelType.StaticVector3) { mainParts.push(['f', ch.value[0]], ['f', ch.value[1]], ['f', ch.value[2]]); main += 12; }
    else if (type === ChannelType.StaticFloat) { mainParts.push(['f', ch.value]); main += 4; }
    else if (type === ChannelType.QuantizeFloat) { mainParts.push(['i', ch.bits], ['f', ch.quantum], ['f', ch.offset]); main += 12; }
    ch.frameBitOffset = bit;
    if (type === ChannelType.RawFloat) { ch.frameBits = 32; bit += 32; }
    else if (type === ChannelType.QuantizeFloat) { ch.frameBits = ch.bits; bit += ch.bits; }
  }
  ensure(bit <= limits.maxFrameBits, ErrorCode.LIMIT_EXCEEDED, 'Frame bits above budget', {bits: bit});
  const frameLength = Math.ceil(bit / 32) * 4;
  const refs = {position: [], rotation: []};
  for (let type = 0; type < 9; type++) for (const ch of lists[type]) if (ch.mover) {
    (tracks[ch.sequence].spec.id === 5 ? refs.position : refs.rotation).push([type, ch.index, ch.dataIntOffset, ch.frameBitOffset]);
  }
  for (const list of [refs.position, refs.rotation]) list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  ensure(refs.position.length <= 15 && refs.rotation.length <= 15, ErrorCode.UNSUPPORTED_STRUCTURE, 'Too many root motion refs');
  const itemCount = lists.reduce((n, l) => n + l.length + (l.length % 4 ? 4 - (l.length % 4) : 0), 0);
  const refBytes = 6 * (refs.position.length + refs.rotation.length);
  const dataLength = main + frameLength * frames + 18 + itemCount * 2 + refBytes;
  ensure(32 + dataLength <= limits.maxRegionBytes, ErrorCode.OUTPUT_TOO_LARGE, 'Sequence block above budget', {bytes: 32 + dataLength});

  const fullName = `pack:/${name}.clip`, hash = joaat(name), duration = fr(input.duration ?? (frames - 1) / fps);
  const a = new Arena();
  const root = a.allocate(64), pages = a.allocate(24), amap = a.allocate(48), abucket = a.allocate(8), aentry = a.allocate(32);
  const cbucket = a.allocate(8), centry = a.allocate(32), clip = a.allocate(112), text = a.allocate(fullName.length + 1);
  const anim = a.allocate(96), seqList = a.allocate(8), bones = a.allocate(tracks.length * 4), seq = a.allocate(32 + dataLength);
  // Clip dictionary (root block) and page info.
  a.u32(root + 4, 1); a.ptr(root + 8, pages); a.ptr(root + 24, amap); a.u32(root + 32, 0x101); a.ptr(root + 40, cbucket);
  a.u16(root + 48, 1); a.u16(root + 50, 1); a.u32(root + 52, 0x1000000);
  a.u8(pages + 8, 1);
  // Animation map with one bucket and one entry.
  a.u32(amap + 4, 1); a.ptr(amap + 24, abucket); a.u16(amap + 32, 1); a.u16(amap + 34, 1); a.u32(amap + 36, 0x1000000); a.u32(amap + 40, 1);
  a.ptr(abucket, aentry); a.u32(aentry, hash); a.ptr(aentry + 8, anim);
  a.ptr(cbucket, centry); a.u32(centry, hash); a.ptr(centry + 8, clip);
  // Clip (type 1: single animation).
  a.u32(clip + 4, 1); a.u32(clip + 16, 1); a.ptr(clip + 24, text); a.u16(clip + 32, fullName.length); a.u16(clip + 34, fullName.length + 1);
  a.ptr(clip + 40, 0); a.u32(clip + 72, 1); a.ptr(clip + 80, anim); a.f32(clip + 88, 0); a.f32(clip + 92, duration); a.f32(clip + 96, 1);
  for (let i = 0; i < fullName.length; i++) a.u8(text + i, fullName.charCodeAt(i));
  // Animation.
  const mover = tracks.some(t => t.spec.id >= 5);
  a.u32(anim + 4, 1); a.u8(anim + 16, mover ? 16 : 0); a.u8(anim + 17, 1); a.u16(anim + 20, frames); a.u16(anim + 22, frames + 30);
  a.f32(anim + 24, duration); a.u32(anim + 56, 32 + dataLength); a.u32(anim + 60, 2);
  a.ptr(anim + 64, seqList); a.u16(anim + 72, 1); a.u16(anim + 74, 1);
  a.ptr(anim + 80, bones); a.u16(anim + 88, tracks.length); a.u16(anim + 90, tracks.length);
  tracks.forEach((t, i) => { a.u16(bones + i * 4, t.bone); a.u8(bones + i * 4 + 2, t.spec.dataType); a.u8(bones + i * 4 + 3, t.spec.id); });
  a.ptr(seqList, seq);
  // Sequence block header.
  a.u32(seq + 4, dataLength); a.u32(seq + 12, main); a.u32(seq + 16, 32 + dataLength - refBytes);
  a.u16(seq + 22, frames); a.u16(seq + 24, frameLength);
  a.u16(seq + 28, lists[ChannelType.QuantizeFloat].reduce((s, c) => s + c.bits, 0));
  a.u8(seq + 30, 255); a.u8(seq + 31, (refs.position.length << 4) | refs.rotation.length);
  // Sequence data: channel main data | frame data | channel list | channel items | root refs.
  let p = seq + 32;
  for (const [kind, v] of mainParts) { if (kind === 'f') a.f32(p, v); else a.u32(p, v); p += 4; }
  const framed = [];
  for (let type = 0; type < 9; type++) for (const ch of lists[type]) if (ch.frameBits) framed.push(ch);
  for (let f = 0; f < frames; f++) {
    const w = new BitWriter();
    for (const ch of framed) w.write(ch.type === ChannelType.RawFloat ? floatBits(ch.values[f]) : ch.codes[f], ch.frameBits);
    for (let k = 0; k < frameLength / 4; k++) a.u32(p + k * 4, w.words[k] ?? 0);
    p += frameLength;
  }
  for (let type = 0; type < 9; type++) { a.u16(p, lists[type].length); p += 2; }
  for (let type = 0; type < 9; type++) {
    for (const ch of lists[type]) { a.u16(p, (ch.sequence << 2) | ch.index); p += 2; }
    const rem = lists[type].length % 4;
    if (rem) for (let k = 0; k < 4 - rem; k++) { a.u16(p, (tracks.length << 2) & 0xffff); p += 2; }
  }
  for (const r of [...refs.position, ...refs.rotation]) { a.u8(p, r[0]); a.u8(p + 1, r[1]); a.u16(p + 2, r[2]); a.u16(p + 4, r[3]); p += 6; }
  if (p !== seq + 32 + dataLength) fail(ErrorCode.INCONSISTENT_REFERENCE, 'Internal sequence size mismatch');

  const bytes = encodeEnvelope(YCD_RESOURCE_VERSION, a.finish(), limits, options.compressionLevel ?? 6);
  return {
    bytes,
    report: {
      profile: PROFILE_ID, name, frames, fps, duration, encodingMode: enc.mode, tolerances: {...enc},
      tracks: plans.map(p => p.report), rootMotion: mover, frameBits: bit, sequenceBytes: 32 + dataLength, outputBytes: bytes.length,
    },
  };
}
