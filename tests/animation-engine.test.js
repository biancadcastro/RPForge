import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {writeSkeletalYcd} from '../src/animation-engine/ycd-write.js';
import {readYcd} from '../src/animation-engine/ycd-read.js';
import {decodeEnvelope, encodeEnvelope, adler32} from '../src/animation-engine/envelope.js';
import {DEFAULT_LIMITS, resolveLimits} from '../src/animation-engine/limits.js';
import {EngineError, ErrorCode} from '../src/animation-engine/errors.js';
import {compareAnimations, sampleTrack} from '../src/animation-engine/sample.js';
import {parseSkel, validateSkeleton, matchAnimation, worldPositions} from '../src/animation-engine/skeleton.js';
import {parseBlockChannels} from '../src/animation-engine/channels.js';
import {reencodeYcd, profileInputFromClip} from '../src/animation-engine/convert.js';
import {fromAxisAngle, angleBetween} from '../src/animation-engine/quat.js';
import {writeYcd as writeProofYcd} from '../src/engine-proof/ycd.js';
import {syntheticAnimation} from './animation-engine/synthetic.js';

const code = c => err => err instanceof EngineError && err.code === c;
const TRACK = {position: 0, rotation: 1, moverPosition: 5, moverRotation: 6};
/** Reference model straight from the writer input (float64), for semantic comparison. */
function inputModel(anim) {
  return {frames: anim.frames, duration: anim.duration ?? (anim.frames - 1) / anim.fps,
    tracks: anim.tracks.map(t => ({boneTag: t.bone, track: TRACK[t.type], kind: t.type.endsWith('otation') ? 'quaternion' : 'vector', components: t.type.endsWith('otation') ? 4 : 3, samples: Float64Array.from(t.values)}))};
}
function mutateSystem(bytes, mutate) {
  const env = decodeEnvelope(bytes, 46, DEFAULT_LIMITS), system = Uint8Array.from(env.system);
  mutate(system, new DataView(system.buffer));
  return encodeEnvelope(46, system, DEFAULT_LIMITS);
}
const ptr = (dv, at) => dv.getUint32(at, true) - 0x50000000;

test('skeletal profile: multi-bone raw encoding round-trips exactly through the strict reader', () => {
  const {animation} = syntheticAnimation({bones: 21, frames: 31, constantBones: 3});
  const {bytes, report} = writeSkeletalYcd(animation, {encoding: {mode: 'raw'}});
  const m = readYcd(bytes, {strict: true});
  assert.equal(m.clips.length, 1); assert.equal(m.clips[0].name, 'pack:/synthetic_emote.clip');
  const a = m.animations[0];
  assert.equal(a.frames, 31); assert.equal(a.duration, Math.fround(1)); assert.equal(a.flags, 0); assert.equal(a.usageCount, 2);
  assert.equal(a.tracks.length, 21);
  // File order is (track id, bone tag); identity is never the index.
  assert.deepEqual(a.tracks.map(t => t.track), [0, ...Array(20).fill(1)]);
  assert.ok(a.tracks.slice(1).every((t, i, l) => i === 0 || l[i - 1].boneTag < t.boneTag));
  assert.ok(a.tracks.every(t => t.dataType === (t.track === 1 ? 1 : 0)));
  const cmp = compareAnimations(inputModel(animation), a);
  assert.deepEqual(cmp.diffs, []); assert.equal(cmp.tracks, 21);
  assert.ok(cmp.maxPositionError < 1e-7 && cmp.maxAngleError < 1e-6, JSON.stringify(cmp));
  assert.ok(report.tracks.some(t => t.encoding === 'StaticQuaternion'));
  // Deterministic: same input, same bytes.
  assert.deepEqual(writeSkeletalYcd(animation, {encoding: {mode: 'raw'}}).bytes, bytes);
});

test('skeletal profile: quantized encoding stays within declared tolerances, including mover tracks', () => {
  const {animation} = syntheticAnimation({bones: 21, frames: 61, mover: true});
  const {bytes, report} = writeSkeletalYcd(animation);
  const a = readYcd(bytes, {strict: true}).animations[0];
  assert.equal(a.flags, 16); assert.ok(a.hasMoverTracks);
  assert.ok(a.rootMotion.position[0].length >= 1 && a.rootMotion.rotation[0].length >= 1);
  const cmp = compareAnimations(inputModel(animation), a, {midpoints: false});
  assert.deepEqual(cmp.diffs, []);
  assert.ok(cmp.maxPositionError <= 1e-4, `position ${cmp.maxPositionError}`);
  assert.ok(cmp.maxAngleError <= 2.5e-4, `angle ${cmp.maxAngleError}`);
  for (const t of report.tracks) assert.ok((t.maxPositionError ?? 0) <= 1e-4 && (t.maxAngleError ?? 0) <= 2.5e-4);
  assert.ok(bytes.length < writeSkeletalYcd(animation, {encoding: {mode: 'raw'}}).bytes.length);
});

test('rotations: q and -q inputs are equivalent, hemispheres are aligned and static w is canonical', () => {
  const frames = 9, q = f => fromAxisAngle([1, 2, 3], 0.3 * f);
  const base = {name: 'signs', fps: 30, frames, tracks: [{bone: 1, type: 'rotation', values: Array.from({length: frames}, (_, f) => q(f)).flat()}]};
  const flipped = {...base, tracks: [{bone: 1, type: 'rotation', values: Array.from({length: frames}, (_, f) => f % 3 === 1 ? q(f).map(v => -v) : q(f)).flat()}]};
  const a = writeSkeletalYcd(base, {encoding: {mode: 'raw'}}), b = writeSkeletalYcd(flipped, {encoding: {mode: 'raw'}});
  assert.deepEqual(b.bytes, a.bytes);
  assert.equal(b.report.tracks[0].hemisphereFlips, 3);
  // Decoded consecutive samples never take the long way.
  const t = readYcd(a.bytes, {strict: true}).animations[0].tracks[0];
  for (let f = 1; f < frames; f++) assert.ok(t.samples[f * 4] * t.samples[f * 4 - 4] + t.samples[f * 4 + 1] * t.samples[f * 4 - 3] + t.samples[f * 4 + 2] * t.samples[f * 4 - 2] + t.samples[f * 4 + 3] * t.samples[f * 4 - 1] > 0);
  // Constant rotation with w < 0 is stored as the equivalent quaternion with w >= 0.
  const neg = fromAxisAngle([0, 1, 0], 0.7).map(v => -v);
  const s = writeSkeletalYcd({name: 'static_neg', fps: 30, frames: 3, tracks: [{bone: 2, type: 'rotation', values: [...neg, ...neg, ...neg]}]});
  const st = readYcd(s.bytes, {strict: true}).animations[0].tracks[0];
  assert.equal(s.report.tracks[0].encoding, 'StaticQuaternion');
  assert.ok(st.samples[3] > 0 && angleBetween(st.samples, 0, neg, 0) < 1e-6);
  // Near 180 degrees the rebuilt w would lose precision: four static components instead.
  const pi = fromAxisAngle([0, 0, 1], Math.PI - 2e-7);
  const p = writeSkeletalYcd({name: 'near_pi', fps: 30, frames: 2, tracks: [{bone: 3, type: 'rotation', values: [...pi, ...pi]}]}, {encoding: {staticRotationAngleTolerance: 1e-9}});
  assert.equal(p.report.tracks[0].encoding, 'StaticFloat+StaticFloat+StaticFloat+StaticFloat', JSON.stringify(p.report.tracks[0]));
  assert.ok(angleBetween(readYcd(p.bytes, {strict: true}).animations[0].tracks[0].samples, 0, pi, 0) < 1e-6);
});

test('rotations: a 720-degree spin keeps continuity and interpolates the short way between samples', () => {
  const {animation} = syntheticAnimation({bones: 3, frames: 91, spin: true, nearPi: true});
  const a = readYcd(writeSkeletalYcd(animation, {encoding: {mode: 'raw'}}).bytes, {strict: true}).animations[0];
  const cmp = compareAnimations(inputModel(animation), a, {midpoints: true});
  assert.deepEqual(cmp.diffs, []); assert.ok(cmp.maxAngleError < 1e-5, JSON.stringify(cmp.worst));
  const spin = a.tracks.find(t => t.boneTag === animation.tracks[0].bone && t.track === 1);
  // Midpoint between two samples 8 degrees apart is ~4 degrees from each (not ~176).
  const mid = sampleTrack(a, spin, 0.5 / 90 * a.duration), f0 = sampleTrack(a, spin, 0);
  assert.ok(Math.abs(angleBetween(mid, 0, f0, 0) - 4 * Math.PI / 90 / 2) < 1e-3);
});

test('writer refuses invalid input before producing bytes', () => {
  const ok = {name: 'bad', fps: 30, frames: 2, tracks: [{bone: 5, type: 'position', values: [0, 0, 0, 1, 1, 1]}]};
  const bad = (patch, c) => assert.throws(() => writeSkeletalYcd({...ok, ...patch}), code(c));
  bad({name: '../x'}, ErrorCode.INVALID_INPUT);
  bad({name: 'Upper'}, ErrorCode.INVALID_INPUT);
  bad({fps: 0}, ErrorCode.INVALID_INPUT);
  bad({frames: 1, tracks: [{bone: 5, type: 'position', values: [0, 0, 0]}]}, ErrorCode.LIMIT_EXCEEDED);
  bad({frames: 1801, tracks: [{bone: 5, type: 'position', values: new Float64Array(1801 * 3)}]}, ErrorCode.LIMIT_EXCEEDED);
  bad({tracks: [{bone: 5, type: 'position', values: [0, NaN, 0, 1, 1, 1]}]}, ErrorCode.NONFINITE_VALUE);
  bad({tracks: [{bone: 5, type: 'position', values: [0, 0, 0, 1, 1, Infinity]}]}, ErrorCode.NONFINITE_VALUE);
  bad({tracks: [{bone: 5, type: 'position', values: [0, 0, 0]}]}, ErrorCode.INVALID_INPUT);
  bad({tracks: [{bone: 5, type: 'rotation', values: [0, 0, 0, 2, 0, 0, 0, 1]}]}, ErrorCode.INVALID_QUATERNION);
  bad({tracks: [{bone: 5, type: 'rotation', values: [0, 0, 0, 0, 0, 0, 0, 1]}]}, ErrorCode.INVALID_QUATERNION);
  bad({tracks: [{bone: 5, type: 'euler', values: [0, 0, 0, 0, 0, 0]}]}, ErrorCode.INVALID_INPUT);
  bad({tracks: [ok.tracks[0], ok.tracks[0]]}, ErrorCode.INVALID_INPUT);
  bad({tracks: [{bone: 7, type: 'moverPosition', values: [0, 0, 0, 0, 0, 0]}]}, ErrorCode.INVALID_INPUT);
  bad({tracks: [{bone: 70000, type: 'position', values: [0, 0, 0, 0, 0, 0]}]}, ErrorCode.INVALID_INPUT);
  assert.throws(() => writeSkeletalYcd(ok, {encoding: {mode: 'lossy'}}), code(ErrorCode.INVALID_INPUT));
  assert.throws(() => writeSkeletalYcd(ok, {limits: {maxOutputBytes: 64}}), code(ErrorCode.OUTPUT_TOO_LARGE));
});

test('reader: every single-bit mutation of the decoded region is refused or changes the decoded model', () => {
  const sig = m => JSON.stringify(m, (k, v) => (v instanceof Float32Array ? Array.from(v, x => (Object.is(x, -0) ? '-0' : x)) : k === 'coverage' || k === 'envelope' ? undefined : Object.is(v, -0) ? '-0' : v));
  for (const mode of ['raw', 'quantized']) {
    const {animation} = syntheticAnimation({bones: 3, frames: 4, mover: mode === 'quantized'});
    const bytes = writeSkeletalYcd(animation, {encoding: {mode}}).bytes;
    const original = sig(readYcd(bytes, {strict: true}));
    const env = decodeEnvelope(bytes, 46, DEFAULT_LIMITS);
    let refused = 0, changed = 0;
    for (let i = 0; i < env.system.length; i++) {
      const bit = 1 << (i % 8);
      const mutated = mutateSystem(bytes, s => { s[i] ^= bit; });
      try {
        const s = sig(readYcd(mutated, {strict: true}));
        assert.notEqual(s, original, `byte ${i} bit ${bit} was silently ignored (${mode})`);
        changed++;
      } catch (err) {
        assert.ok(err instanceof EngineError, `byte ${i}: non-engine failure ${err}`);
        refused++;
      }
    }
    assert.equal(refused + changed, env.system.length);
    assert.ok(refused > changed);
  }
});

test('reader: truncation, bombs, budgets, trailing data and magic are refused with stable codes', () => {
  const bytes = writeSkeletalYcd(syntheticAnimation({bones: 4, frames: 5}).animation).bytes;
  for (let n = 0; n < bytes.length; n += 7) assert.throws(() => readYcd(bytes.subarray(0, n)), err => err instanceof EngineError && [ErrorCode.INVALID_ENVELOPE, ErrorCode.DECOMPRESSION_FAILED].includes(err.code));
  const magic = Uint8Array.from(bytes); magic[0] ^= 0x80;
  assert.throws(() => readYcd(magic), code(ErrorCode.INVALID_ENVELOPE));
  const version = Uint8Array.from(bytes); version[4] = 45;
  assert.throws(() => readYcd(version), code(ErrorCode.INVALID_ENVELOPE));
  // Declared 8 KiB, actual 16 MiB of zeros: stop at the declared size.
  const bomb = Uint8Array.from([...bytes.subarray(0, 16), ...deflateRawSync(new Uint8Array(16 * 1024 * 1024))]);
  assert.throws(() => readYcd(bomb), code(ErrorCode.DECOMPRESSION_FAILED));
  // Region declared above the budget is refused before inflating anything.
  const big = Uint8Array.from(bytes); new DataView(big.buffer).setUint32(8, (0x20000000 | 0x08000000 | 15) >>> 0, true);
  assert.throws(() => readYcd(big), code(ErrorCode.LIMIT_EXCEEDED));
  assert.throws(() => readYcd(bytes, {limits: {maxInputBytes: 64}}), code(ErrorCode.INPUT_TOO_LARGE));
  assert.throws(() => resolveLimits({maxInputBytes: DEFAULT_LIMITS.maxInputBytes + 1}), RangeError);
  assert.throws(() => resolveLimits({nope: 1}), TypeError);
  // Trailing bytes: only an exact Adler-32 of the decoded data is tolerated (and noted).
  const env = decodeEnvelope(bytes, 46, DEFAULT_LIMITS), sum = adler32(env.system);
  const withAdler = Uint8Array.from([...bytes, sum >>> 24, (sum >>> 16) & 255, (sum >>> 8) & 255, sum & 255]);
  const m = readYcd(withAdler);
  assert.equal(m.envelope.trailer, 'adler32'); assert.ok(m.notes.some(n => n.path === 'envelope.trailer'));
  assert.throws(() => readYcd(withAdler, {strict: true}), code(ErrorCode.UNSUPPORTED_STRUCTURE));
  const wrong = Uint8Array.from(withAdler); wrong[wrong.length - 1] ^= 1;
  assert.throws(() => readYcd(wrong), code(ErrorCode.DECOMPRESSION_FAILED));
  assert.throws(() => readYcd(Uint8Array.from([...bytes, 0])), code(ErrorCode.DECOMPRESSION_FAILED));
  assert.throws(() => readYcd('not bytes'), code(ErrorCode.INVALID_INPUT));
});

test('reader: linked-list cycles, foreign pointers and inconsistent counts', () => {
  const bytes = writeSkeletalYcd(syntheticAnimation({bones: 3, frames: 3}).animation).bytes;
  const at = (dv, ...path) => path.reduce((o, step) => ptr(dv, o + step), 0);
  // clip map entry pointing to itself as Next
  assert.throws(() => readYcd(mutateSystem(bytes, (s, dv) => { const e = at(dv, 40, 0); dv.setUint32(e + 16, 0x50000000 + e, true); })), code(ErrorCode.CYCLE));
  assert.throws(() => readYcd(mutateSystem(bytes, (s, dv) => { dv.setUint32(40, 0x50ffff00, true); })), code(ErrorCode.POINTER_OUT_OF_RANGE));
  assert.throws(() => readYcd(mutateSystem(bytes, (s, dv) => { dv.setUint32(44, 1, true); })), code(ErrorCode.POINTER_OUT_OF_RANGE));
  assert.throws(() => readYcd(mutateSystem(bytes, (s, dv) => { dv.setUint16(50, 2, true); })), code(ErrorCode.INCONSISTENT_REFERENCE));
  assert.throws(() => readYcd(mutateSystem(bytes, (s, dv) => { dv.setUint16(48, 60000, true); dv.setUint16(50, 60000, true); })), code(ErrorCode.LIMIT_EXCEEDED));
  // Inspect mode records unknown values instead of failing; strict refuses them.
  const odd = mutateSystem(bytes, (s, dv) => { const anim = at(dv, 24, 24, 0, 8); dv.setUint32(anim + 28, 0x1234, true); });
  assert.ok(readYcd(odd).notes.some(n => n.path === 'animation.unknown1C'));
  assert.throws(() => readYcd(odd, {strict: true}), code(ErrorCode.UNKNOWN_FIELD));
});

test('reader: the earlier 256-frame proof file is only consistent under the chunk inference', () => {
  // SequenceFrameLimit 255 with 256 frames in one block: the reference evaluator indexes
  // block frame/limit (frame 255 -> missing block 1); the chunk reading (limit+1) covers it.
  const proof = writeProofYcd({name: 'proof_256', fps: 30, translations: new Array(256 * 3).fill(0.5)});
  assert.ok(readYcd(proof).notes.some(n => n.path === 'animation.sequenceFrameLimit'));
  assert.throws(() => readYcd(proof, {strict: true}), code(ErrorCode.UNKNOWN_FIELD));
  const small = readYcd(writeProofYcd({name: 'proof_31', fps: 30, translations: new Array(31 * 3).fill(0.5)}));
  assert.equal(small.animations[0].tracks[0].trackName, 'position');
});

test('channels: quantized and indirect-quantized decoding follows the documented float32 formula', () => {
  // main data: Quantize(bits=5,q=0.5,o=-1) | Indirect(frameBits=2,valueBits=4,numInts=1,q=0.25,o=2, table bits [3,15,0])
  const frames = 3, main = new DataView(new ArrayBuffer(12 + 24));
  main.setInt32(0, 5, true); main.setFloat32(4, 0.5, true); main.setFloat32(8, -1, true);
  main.setInt32(12, 2, true); main.setInt32(16, 4, true); main.setInt32(20, 1, true); main.setFloat32(24, 0.25, true); main.setFloat32(28, 2, true);
  main.setUint32(32, 3 | (15 << 4) | (0 << 8), true);
  const frameLength = 4, frameData = new Uint8Array(frames * frameLength), codes = [[0, 2], [31, 0], [7, 1]];
  codes.forEach(([qv, idx], f) => new DataView(frameData.buffer).setUint32(f * 4, qv | (idx << 5), true));
  const list = new Uint8Array(18); const ldv = new DataView(list.buffer); ldv.setUint16(8, 1, true); ldv.setUint16(10, 1, true);
  const items = new Uint8Array(16); const idv = new DataView(items.buffer); idv.setUint16(0, 0, true); idv.setUint16(8, 1, true);
  for (const k of [2, 4, 6, 10, 12, 14]) idv.setUint16(k, 4, true);
  const data = Uint8Array.from([...new Uint8Array(main.buffer), ...frameData, ...list, ...items]);
  const header = {frameOffset: 36, frameLength, numFrames: frames, chunkSize: 255, rootPositionRefs: 0, rootRotationRefs: 0, rootMotionRefsOffset: 32 + data.length};
  const r = parseBlockChannels(data, header, DEFAULT_LIMITS);
  assert.deepEqual(Array.from(r.channels[0].values), [-1, 14.5, 2.5]);
  assert.deepEqual(Array.from(r.channels[1].values), [2, 2.75, 5.75]);
  // Index beyond the table is refused rather than read out of bounds.
  new DataView(data.buffer).setUint32(36, 0 | (3 << 5), true);
  assert.throws(() => parseBlockChannels(data, header, DEFAULT_LIMITS), code(ErrorCode.INCONSISTENT_REFERENCE));
});

test('skeleton: .skel parsing, validation, matching and forward kinematics', () => {
  const text = `Version 165 30\n{\n DataCRC 1\n NumBones 3\n Bone SKEL_ROOT 0\n {\n  Flags ROT_X TRANS_X\n  RotationQuaternion 0 0 0 1\n  LocalOffset 0 0 0\n  Scale 1 1 1\n  Children 1\n  {\n   Bone SKEL_A 100\n   {\n    RotationQuaternion 0 0 0.70710678 0.70710678\n    LocalOffset 1 0 0\n    Children 1\n    {\n     Bone SKEL_B 200\n     {\n      LocalOffset 1 0 0\n     }\n    }\n   }\n  }\n }\n}\n`;
  const skel = parseSkel(text);
  assert.deepEqual(skel.bones.map(b => [b.name, b.tag, b.parent]), [['SKEL_ROOT', 0, -1], ['SKEL_A', 100, 0], ['SKEL_B', 200, 1]]);
  const world = worldPositions(skel);
  assert.ok(Math.abs(world[2][0] - 1) < 1e-6 && Math.abs(world[2][1] - 1) < 1e-6);
  const posed = worldPositions(skel, {rotation: new Map([[100, [0, 0, 0, 1]]])});
  assert.ok(Math.abs(posed[2][0] - 2) < 1e-6);
  assert.throws(() => parseSkel(text.replace('NumBones 3', 'NumBones 4')), code(ErrorCode.SKELETON_INVALID));
  assert.throws(() => parseSkel(text.replace('SKEL_B 200', 'SKEL_B 100')), code(ErrorCode.SKELETON_INVALID));
  assert.throws(() => parseSkel(text.replace('LocalOffset 1 0 0\n     }', 'Evil 1\n     }')), code(ErrorCode.SKELETON_INVALID));
  const loop = {bones: [{name: 'R', tag: 0, parent: -1, rotation: [0, 0, 0, 1], translation: [0, 0, 0]}, {name: 'A', tag: 1, parent: 2, rotation: [0, 0, 0, 1], translation: [0, 0, 0]}, {name: 'B', tag: 2, parent: 1, rotation: [0, 0, 0, 1], translation: [0, 0, 0]}]};
  assert.throws(() => validateSkeleton(loop), code(ErrorCode.CYCLE));
  const anim = {tracks: [{boneTag: 100, track: 1}, {boneTag: 300, track: 1}, {boneTag: 0, track: 5}]};
  assert.deepEqual(matchAnimation(skel, anim).missing, [{boneTag: 300, track: 1}]);
  assert.throws(() => matchAnimation(skel, anim, {require: true}), code(ErrorCode.SKELETON_MISMATCH));
});

test('reencode: profile input from a decoded clip keeps identity and refuses silent drops', () => {
  const {animation} = syntheticAnimation({bones: 6, frames: 12, mover: true});
  const raw = writeSkeletalYcd(animation, {encoding: {mode: 'raw'}}).bytes;
  const r = reencodeYcd(raw, {encoding: {mode: 'quantized'}});
  assert.deepEqual(r.discarded, []); assert.deepEqual(r.verification.diffs, []);
  assert.ok(r.verification.maxPositionError <= 1e-4 && r.verification.maxAngleError <= 3e-4);
  const clip = readYcd(raw).clips[0];
  assert.throws(() => profileInputFromClip({...clip, hasTags: true}), code(ErrorCode.UNSUPPORTED_STRUCTURE));
  assert.equal(profileInputFromClip({...clip, hasTags: true}, {discard: ['clipTags']}).discarded[0].category, 'clipTags');
  const scale = {...clip, animation: {...clip.animation, tracks: [...clip.animation.tracks, {boneTag: 9, track: 2, kind: 'vector', components: 3, samples: new Float32Array(36)}]}};
  assert.throws(() => profileInputFromClip(scale), code(ErrorCode.UNSUPPORTED_STRUCTURE));
  assert.throws(() => reencodeYcd(raw, {discard: ['everything']}), code(ErrorCode.INVALID_INPUT));
});

test('engine core stays pure: no filesystem, network, process or dynamic code', () => {
  const dir = new URL('../src/animation-engine/', import.meta.url);
  for (const file of readdirSync(dir)) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
    for (const spec of imports) assert.ok(spec.startsWith('./') || spec === '../rsc7.js' || spec === 'node:zlib', `${file} imports ${spec}`);
    assert.doesNotMatch(src, /\b(fetch|eval|Function|require|process|child_process|XMLHttpRequest|WebSocket|import\()\s*\(/, file);
  }
});
