// YCD (clip dictionary, RSC7 version 46) reader.
//
// Two modes:
//  - inspect (strict=false): bounded, defensive decoding of every structure the
//    engine understands, recording non-default/unknown values as `unknown` notes.
//    Used for external files and the support survey. Never "repairs" data.
//  - strict (strict=true): additionally refuses any unknown field, unsupported
//    structure, aliasing or unreferenced byte. Used for profile round trips.
import {ErrorCode, EngineError, ensure, fail} from './errors.js';
import {decodeEnvelope, YCD_RESOURCE_VERSION, SYSTEM_BASE} from './envelope.js';
import {Region} from './region.js';
import {resolveLimits} from './limits.js';
import {parseBlockChannels, ChannelType, CHANNEL_NAMES} from './channels.js';
import {joaat} from './hash.js';

export const TRACK_NAMES = Object.freeze({0: 'position', 1: 'rotation', 2: 'scale', 5: 'moverPosition', 6: 'moverRotation'});
const fr = Math.fround;

class Notes {
  constructor(strict) { this.strict = strict; this.list = []; }
  unknown(path, value) {
    if (this.strict) throw new EngineError(ErrorCode.UNKNOWN_FIELD, `Unsupported value in ${path}`, {path, value});
    this.list.push({code: ErrorCode.UNKNOWN_FIELD, path, value});
  }
  unsupported(path, message, details) {
    if (this.strict) throw new EngineError(ErrorCode.UNSUPPORTED_STRUCTURE, message, {path, ...details});
    this.list.push({code: ErrorCode.UNSUPPORTED_STRUCTURE, path, message, ...(details ? {details} : {})});
  }
}

function expect(r, notes, at, path, fields) {
  // fields: [offset, size, expected, name]; any mismatch is an unknown-field note.
  for (const [o, size, expected, name] of fields) {
    const v = size === 1 ? r.u8(at + o) : size === 2 ? r.u16(at + o) : size === 4 ? r.u32(at + o) : r.rawPointer(at + o);
    if (v !== expected) notes.unknown(`${path}.${name}`, v);
  }
}
function zeroRest(r, notes, at, length, known, path) {
  const extra = r.nonZeroOutside(at, length, known);
  if (extra.length) notes.unknown(`${path}+0x${extra[0].toString(16)}`, extra.length + ' byte(s)');
}

/** Walk a bucketed hash map (pointer array + Next chains) with cycle and count limits. */
function readMap(r, notes, arrayAt, capacity, entries, limit, path, readEntry) {
  ensure(capacity <= limit && entries <= limit, ErrorCode.LIMIT_EXCEEDED, `${path} above budget`, {capacity, entries});
  ensure(capacity > 0 || entries === 0, ErrorCode.INCONSISTENT_REFERENCE, `${path} empty bucket array`);
  const out = [], seen = new Set();
  if (capacity === 0) return out;
  r.claim(arrayAt, capacity * 8, `${path} buckets`);
  for (let b = 0; b < capacity; b++) {
    let at = r.pointer(arrayAt + b * 8, 32, `${path} entry`, {nullable: true});
    while (at !== null) {
      ensure(!seen.has(at), ErrorCode.CYCLE, `${path} chain loops`, {at});
      seen.add(at);
      ensure(out.length < entries, ErrorCode.INCONSISTENT_REFERENCE, `${path} has more entries than declared`, {declared: entries});
      r.claim(at, 32, `${path} entry`);
      const hash = r.u32(at);
      if (hash % capacity !== b) notes.unknown(`${path}[${out.length}].bucket`, {hash, bucket: b, capacity});
      out.push(readEntry(at, hash));
      at = r.pointer(at + 16, 32, `${path} next`, {nullable: true});
    }
  }
  ensure(out.length === entries, ErrorCode.INCONSISTENT_REFERENCE, `${path} entry count mismatch`, {declared: entries, found: out.length});
  return out;
}

export function readYcd(input, options = {}) {
  const limits = resolveLimits(options.limits), strict = options.strict === true, notes = new Notes(strict);
  const env = decodeEnvelope(input, YCD_RESOURCE_VERSION, limits);
  if (env.graphics.length) { ensure(env.graphics.every(b => b === 0), ErrorCode.UNSUPPORTED_STRUCTURE, 'Graphics region data in clip dictionary'); notes.unsupported('graphics', 'Graphics pages present', {bytes: env.graphics.length}); }
  if (env.trailer) notes.unsupported('envelope.trailer', 'Adler-32 trailer after deflate stream', {trailer: env.trailer});
  const r = new Region(env.system);

  r.claim(0, 64, 'clip dictionary');
  expect(r, notes, 0, 'dictionary', [[0, 4, 0, 'vft'], [4, 4, 1, 'unknown04'], [16, 4, 0, 'unknown10'], [20, 4, 0, 'unknown14'], [32, 4, 0x101, 'unknown20'], [36, 4, 0, 'unknown24'], [52, 4, 0x1000000, 'unknown34'], [56, 4, 0, 'unknown38'], [60, 4, 0, 'unknown3C']]);
  const pagesAt = r.pointer(8, 16, 'page info');
  const sysPages = r.u8(pagesAt + 8), gfxPages = r.u8(pagesAt + 9);
  ensure(sysPages === env.systemPages && gfxPages === env.graphicsPages, ErrorCode.INCONSISTENT_REFERENCE, 'Page info does not match header', {sysPages, gfxPages});
  const pagesLength = 16 + 8 * (sysPages + gfxPages);
  r.claim(pagesAt, pagesLength, 'page info');
  zeroRest(r, notes, pagesAt, pagesLength, [[8, 2]], 'pageInfo');

  // Animations first: clips reference them.
  const amap = r.pointer(24, 48, 'animation map');
  r.claim(amap, 48, 'animation map');
  expect(r, notes, amap, 'animationMap', [[0, 4, 0, 'vft'], [4, 4, 1, 'unknown04'], [36, 4, 0x1000000, 'unknown24'], [40, 4, 1, 'unknown28']]);
  zeroRest(r, notes, amap, 48, [[0, 8], [24, 12], [36, 8]], 'animationMap');
  const animCap = r.u16(amap + 32), animEntries = r.u16(amap + 34);
  ensure(animCap <= limits.maxAnimations && animEntries <= limits.maxAnimations, ErrorCode.LIMIT_EXCEEDED, 'animations above budget', {animCap, animEntries});
  const animArray = animCap ? r.pointer(amap + 24, animCap * 8, 'animation buckets') : null;
  const animByOffset = new Map();
  const animations = readMap(r, notes, animArray, animCap, animEntries, limits.maxAnimations, 'animations', (at, hash) => {
    zeroRest(r, notes, at, 32, [[0, 4], [8, 16]], 'animationEntry');
    const animAt = r.pointer(at + 8, 96, 'animation');
    ensure(!animByOffset.has(animAt), ErrorCode.INCONSISTENT_REFERENCE, 'Animation referenced by two map entries');
    const anim = readAnimation(r, notes, animAt, limits);
    anim.hash = hash; animByOffset.set(animAt, anim);
    return anim;
  });

  const clipCap = r.u16(48), clipEntries = r.u16(50);
  ensure(clipCap <= limits.maxClips && clipEntries <= limits.maxClips, ErrorCode.LIMIT_EXCEEDED, 'clips above budget', {clipCap, clipEntries});
  const clipArray = clipCap ? r.pointer(40, clipCap * 8, 'clip buckets') : null;
  const clips = readMap(r, notes, clipArray, clipCap, clipEntries, limits.maxClips, 'clips', (at, hash) => {
    zeroRest(r, notes, at, 32, [[0, 4], [8, 16]], 'clipEntry');
    const clipAt = r.pointer(at + 8, 112, 'clip');
    return readClip(r, notes, clipAt, hash, animByOffset, limits);
  });

  for (const a of animations) if (!clips.some(c => c.animation === a)) notes.unsupported('animations', 'Animation not referenced by any clip', {hash: a.hash});
  const coverage = r.coverage();
  if (strict) r.requireExclusive();
  else if (coverage.overlaps.length || coverage.unreferencedBytes) notes.list.push({code: ErrorCode.UNREFERENCED_DATA, path: 'system', details: coverage});

  return {
    format: 'ycd', resourceVersion: YCD_RESOURCE_VERSION,
    envelope: {compressedBytes: env.compressedBytes, decodedBytes: env.decodedBytes, systemPages: env.systemPages, graphicsPages: env.graphicsPages, trailer: env.trailer},
    clips, animations, notes: notes.list, coverage,
  };
}

function readClip(r, notes, at, hash, animByOffset, limits) {
  r.claim(at, 112, 'clip');
  const type = r.u32(at + 16);
  ensure(type === 1 || type === 2, ErrorCode.UNSUPPORTED_STRUCTURE, 'Unknown clip type', {type});
  expect(r, notes, at, 'clip', [[0, 4, 0, 'vft'], [4, 4, 1, 'unknown04'], [40, 8, SYSTEM_BASE, 'unknown28'], [72, 4, 1, 'unknown48']]);
  const unknown30 = r.u32(at + 48);
  if (unknown30 !== 0) notes.unknown('clip.unknown30', unknown30);
  zeroRest(r, notes, at, 112, [[0, 8], [16, 4], [24, 12], [40, 12], [56, 20], [80, 20]], 'clip');
  const nameAt = r.pointer(at + 24, 1, 'clip name');
  const name = r.string(nameAt, limits.maxNameLength);
  r.claim(nameAt, name.length, 'clip name');
  ensure(r.u16(at + 32) === name.value.length && r.u16(at + 34) === name.value.length + 1, ErrorCode.INCONSISTENT_REFERENCE, 'Clip name length mismatch');
  const shortName = shortClipName(name.value);
  if (joaat(shortName) !== hash) notes.unknown('clip.hash', {hash, shortName});
  const tags = r.rawPointer(at + 56), properties = r.rawPointer(at + 64);
  if (tags) notes.unsupported('clip.tags', 'Clip tags are not decoded', {pointer: tags});
  if (properties) notes.unsupported('clip.properties', 'Clip properties are not decoded', {pointer: properties});
  const clip = {name: name.value, shortName, hash, type: type === 1 ? 'animation' : 'animationList', hasTags: tags !== 0, hasProperties: properties !== 0};
  if (type === 2) { notes.unsupported('clip.type', 'Animation-list clips are not supported', {name: name.value}); return clip; }
  const animAt = r.pointer(at + 80, 96, 'clip animation');
  const animation = animByOffset.get(animAt);
  ensure(animation !== undefined, ErrorCode.INCONSISTENT_REFERENCE, 'Clip references an animation outside the map');
  clip.animation = animation;
  clip.start = r.finite(at + 88, 'clip start'); clip.end = r.finite(at + 92, 'clip end'); clip.rate = r.finite(at + 96, 'clip rate');
  return clip;
}

function readAnimation(r, notes, at, limits) {
  r.claim(at, 96, 'animation');
  expect(r, notes, at, 'animation', [[0, 4, 0, 'vft'], [4, 4, 1, 'unknown04'], [17, 1, 1, 'unknown11']]);
  zeroRest(r, notes, at, 96, [[0, 8], [16, 2], [20, 12], [56, 20], [80, 12]], 'animation');
  const flags = r.u8(at + 16), frames = r.u16(at + 20), limit = r.u16(at + 22);
  const duration = r.finite(at + 24, 'animation duration'), unknown1C = r.u32(at + 28);
  const maxSeqBlockLength = r.u32(at + 56), usageCount = r.u32(at + 60);
  ensure(frames >= 1 && frames <= limits.maxFrames, ErrorCode.LIMIT_EXCEEDED, 'Frame count outside budget', {frames});
  ensure(duration >= 0, ErrorCode.INCONSISTENT_REFERENCE, 'Negative duration');
  ensure(limit >= 1, ErrorCode.INCONSISTENT_REFERENCE, 'Invalid sequence frame limit');
  const seqCount = r.u16(at + 72), seqCap = r.u16(at + 74), boneCount = r.u16(at + 88), boneCap = r.u16(at + 90);
  ensure(seqCount >= 1 && seqCount <= limits.maxSequenceBlocks && seqCap === seqCount, ErrorCode.LIMIT_EXCEEDED, 'Sequence block count outside budget', {seqCount, seqCap});
  ensure(boneCount >= 1 && boneCount <= limits.maxTracks && boneCap === boneCount, ErrorCode.LIMIT_EXCEEDED, 'Track count outside budget', {boneCount, boneCap});
  const bonesAt = r.pointer(at + 80, boneCount * 4, 'bone ids');
  r.claim(bonesAt, boneCount * 4, 'bone ids');
  const tracks = [];
  const seenTrack = new Set();
  for (let i = 0; i < boneCount; i++) {
    const boneTag = r.u16(bonesAt + i * 4), dataType = r.u8(bonesAt + i * 4 + 2), track = r.u8(bonesAt + i * 4 + 3);
    const key = boneTag * 256 + track;
    if (seenTrack.has(key)) notes.unsupported(`animation.boneIds[${i}]`, 'Duplicate bone/track pair', {boneTag, track});
    seenTrack.add(key);
    // Byte 2 of a BoneId entry is the track data type: 0 vector3, 1 quaternion, 2 float
    // (consistent with channel layouts in every surveyed file; see docs/animation-engine).
    if (dataType > 2) notes.unknown(`animation.boneIds[${i}].dataType`, dataType);
    tracks.push({boneTag, track, trackName: TRACK_NAMES[track] ?? `track${track}`, dataType});
  }

  const listAt = r.pointer(at + 64, seqCount * 8, 'sequence list');
  r.claim(listAt, seqCount * 8, 'sequence list');
  const blocks = [];
  let maxBlock = 0;
  for (let s = 0; s < seqCount; s++) {
    const seqAt = r.pointer(listAt + s * 8, 32, 'sequence');
    const block = readSequence(r, notes, seqAt, tracks.length, limits);
    maxBlock = Math.max(maxBlock, 32 + block.dataLength);
    blocks.push(block);
  }
  if (maxSeqBlockLength !== maxBlock) notes.unknown('animation.maxSeqBlockLength', {declared: maxSeqBlockLength, computed: maxBlock});

  // Frame -> block mapping. Single block: it must hold every frame. Several blocks:
  // non-overlapping chunks of (limit + 1) frames, the only reading under which the
  // block sizes of the surveyed multi-block files add up to Frames (605 = 4*128+93,
  // 482 = 256+226, 202 = 128+74). The reference implementation indexes by
  // frame/limit instead; that disagreement is documented, not resolved in game.
  const chunk = seqCount === 1 ? frames : limit + 1;
  if (seqCount === 1) {
    ensure(blocks[0].numFrames >= frames, ErrorCode.INCONSISTENT_REFERENCE, 'Sequence block holds fewer frames than the animation', {frames, block: blocks[0].numFrames});
    if (blocks[0].numFrames !== frames) notes.unknown('animation.blockFrames', {frames, block: blocks[0].numFrames});
    if (limit < frames) notes.unknown('animation.sequenceFrameLimit', {frames, limit});
  } else {
    blocks.forEach((b, i) => {
      const want = i < seqCount - 1 ? chunk : frames - chunk * (seqCount - 1);
      ensure(b.numFrames === want, ErrorCode.INCONSISTENT_REFERENCE, 'Sequence block frame count does not match the chunk layout', {block: i, frames: b.numFrames, expected: want});
    });
  }
  let samples = 0;
  for (let t = 0; t < tracks.length; t++) {
    const layouts = blocks.map(b => trackLayout(b.channels.filter(c => c.sequence === t), t, tracks[t].dataType));
    const first = layouts[0];
    for (const l of layouts) ensure(l.kind === first.kind && l.components === first.components, ErrorCode.UNSUPPORTED_CHANNEL, 'Track layout changes between sequence blocks', {track: t});
    const track = tracks[t];
    track.kind = first.kind; track.components = first.components;
    track.encoding = layouts.map(l => l.encoding);
    const declared = [3, 4, 1][track.dataType];
    if (declared !== undefined && declared !== first.components) notes.unknown(`animation.boneIds[${t}].dataType`, {dataType: track.dataType, components: first.components});
    samples += frames * first.components;
    ensure(samples <= limits.maxSamples, ErrorCode.LIMIT_EXCEEDED, 'Decoded samples above budget', {samples});
    const out = new Float32Array(frames * first.components);
    for (let f = 0; f < frames; f++) layouts[Math.floor(f / chunk)].evaluate(f % chunk, out, f * first.components);
    track.samples = out;
  }
  for (const b of blocks) for (const c of b.channels) ensure(c.sequence < tracks.length, ErrorCode.INCONSISTENT_REFERENCE, 'Channel references a missing track', {sequence: c.sequence});

  const rootMotion = {position: blocks.map(b => b.refs.position), rotation: blocks.map(b => b.refs.rotation)};
  const hasMoverTracks = tracks.some(t => t.track === 5 || t.track === 6);
  // Flags byte: 16 exactly when mover tracks exist in every surveyed file; other bits unknown.
  if (flags !== (hasMoverTracks ? 16 : 0)) notes.unknown('animation.flags', flags);
  if (unknown1C !== 0) notes.unknown('animation.unknown1C', unknown1C);
  return {
    frames, duration, sequenceFrameLimit: limit, flags, unknown1C, usageCount, maxSeqBlockLength,
    blockCount: blocks.length, blocks: blocks.map(b => ({numFrames: b.numFrames, dataLength: b.dataLength, chunkSize: b.chunkSize, frameLength: b.frameLength, channelTypes: b.channelTypes, unknown00: b.unknown00})),
    tracks, rootMotion, hasMoverTracks,
  };
}

function readSequence(r, notes, at, trackCount, limits) {
  const dataLength = r.u32(at + 4);
  ensure(dataLength >= 18 && dataLength <= r.bytes.length, ErrorCode.POINTER_OUT_OF_RANGE, 'Sequence data length outside resource', {dataLength});
  r.claim(at, 32 + dataLength, 'sequence');
  zeroRest(r, notes, at, 32, [[0, 8], [12, 8], [22, 10]], 'sequence');
  const header = {
    unknown00: r.u32(at), frameOffset: r.u32(at + 12), rootMotionRefsOffset: r.u32(at + 16), numFrames: r.u16(at + 22),
    frameLength: r.u16(at + 24), indirectNumInts: r.u16(at + 26), quantizeBits: r.u16(at + 28), chunkSize: r.u8(at + 30), refCounts: r.u8(at + 31),
  };
  header.rootPositionRefs = header.refCounts >>> 4; header.rootRotationRefs = header.refCounts & 15;
  ensure(header.numFrames >= 1 && header.numFrames <= limits.maxFrames, ErrorCode.LIMIT_EXCEEDED, 'Sequence frame count invalid or above budget', {frames: header.numFrames});
  ensure(header.frameOffset <= dataLength && header.frameLength % 4 === 0, ErrorCode.INCONSISTENT_REFERENCE, 'Invalid sequence frame layout');
  ensure(header.frameOffset + header.frameLength * header.numFrames + 18 <= dataLength, ErrorCode.POINTER_OUT_OF_RANGE, 'Frame data outside sequence');
  const data = r.bytes.subarray(at + 32, at + 32 + dataLength);
  if (header.unknown00 !== 0) notes.unknown('sequence.unknown00', header.unknown00);
  if (header.chunkSize !== 255) notes.unknown('sequence.chunkSize', header.chunkSize);
  const parsed = parseBlockChannels(data, header, limits);
  const expectedPad = (trackCount << 2) & 0xffff;
  if (parsed.nonZeroFramePadding) notes.unknown('sequence.framePadding', parsed.nonZeroFramePadding);
  if (parsed.padding.some(p => p !== expectedPad)) notes.unknown('sequence.channelPadding', parsed.padding);
  const quantBits = parsed.channels.filter(c => c.type === ChannelType.QuantizeFloat).reduce((a, c) => a + c.valueBits, 0);
  const indirectInts = parsed.channels.filter(c => c.type === ChannelType.IndirectQuantizeFloat).reduce((a, c) => a + c.numInts + 5, 0);
  if (indirectInts !== header.indirectNumInts) notes.unknown('sequence.indirectQuantizeFloatNumInts', {declared: header.indirectNumInts, computed: indirectInts});
  if (quantBits !== header.quantizeBits) notes.unknown('sequence.quantizeFloatValueBits', {declared: header.quantizeBits, computed: quantBits});
  const types = {};
  for (const c of parsed.channels) types[CHANNEL_NAMES[c.type]] = (types[CHANNEL_NAMES[c.type]] ?? 0) + 1;
  return {...header, dataLength, channels: parsed.channels, refs: parsed.refs, channelTypes: types};
}

/** Interpret the channels of one track in one block. */
function trackLayout(channels, track, dataType) {
  ensure(channels.length >= 1, ErrorCode.INCONSISTENT_REFERENCE, 'Track without channels', {track});
  const byIndex = new Map();
  for (const c of channels) { ensure(!byIndex.has(c.index), ErrorCode.INCONSISTENT_REFERENCE, 'Duplicate channel index', {track, index: c.index}); byIndex.set(c.index, c); }
  const scalar = c => {
    if (c.type === ChannelType.StaticFloat) { const v = c.value[0]; return () => v; }
    if (c.values) return f => c.values[f];
    fail(ErrorCode.UNSUPPORTED_CHANNEL, 'Channel is not a scalar', {track, type: c.type});
  };
  // Stored parameters are part of the decoded model (diagnostics, and so that no stored
  // byte can change without changing the model).
  const encodingOf = () => channels.map(c => ({type: CHANNEL_NAMES[c.type], index: c.index,
    ...(c.quatIndex !== undefined ? {quatIndex: c.quatIndex} : {}), ...(c.valueBits !== undefined ? {valueBits: c.valueBits, quantum: c.quantum, offset: c.offset} : {}),
    ...(c.frameBits !== undefined && c.type === ChannelType.IndirectQuantizeFloat ? {frameBits: c.frameBits, numInts: c.numInts} : {})}));
  const hint = channels.find(c => c.type === ChannelType.CachedQuaternion2);
  if (hint) {
    // Observed only next to four complete component channels (x, y, z, w at 0..3).
    // The value is fully defined by those channels; the hint's runtime meaning is
    // unknown and it is ignored for evaluation (as the reference does). Read-only.
    const comps = channels.filter(c => c !== hint);
    ensure(comps.length === 4 && [0, 1, 2, 3].every(i => byIndex.has(i)) && !comps.some(c => c.type === ChannelType.CachedQuaternion1), ErrorCode.UNSUPPORTED_CHANNEL, 'CachedQuaternion2 without four component channels', {track});
    const parts = [0, 1, 2, 3].map(i => scalar(byIndex.get(i)));
    return {kind: 'quaternion', components: 4, encoding: encodingOf(), evaluate(f, out, o) { for (let i = 0; i < 4; i++) out[o + i] = parts[i](f); }};
  }
  const cached = channels.find(c => c.type === ChannelType.CachedQuaternion1);
  if (cached) {
    ensure(channels.length === 4 && [0, 1, 2].every(i => byIndex.has(i)), ErrorCode.UNSUPPORTED_CHANNEL, 'Cached quaternion needs three component channels', {track});
    const parts = [0, 1, 2].map(i => scalar(byIndex.get(i))), q = cached.quatIndex;
    return {kind: 'quaternion', components: 4, encoding: encodingOf(), evaluate(f, out, o) {
      const a = parts[0](f), b = parts[1](f), c = parts[2](f);
      const lenSq = fr(fr(fr(a * a) + fr(b * b)) + fr(c * c));
      const derived = fr(Math.sqrt(Math.max(fr(1 - lenSq), 0)));
      const v = [a, b, c]; v.splice(q, 0, derived);
      out[o] = v[0]; out[o + 1] = v[1]; out[o + 2] = v[2]; out[o + 3] = v[3];
    }};
  }
  const only = channels.length === 1 ? channels[0] : null;
  if (only && only.index === 0 && only.type === ChannelType.StaticQuaternion) {
    const [x, y, z] = only.value;
    const w = fr(Math.sqrt(Math.max(fr(1 - fr(fr(fr(x * x) + fr(y * y)) + fr(z * z))), 0)));
    for (const v of only.value) ensure(Number.isFinite(v), ErrorCode.NONFINITE_VALUE, 'Non-finite static quaternion', {track});
    return {kind: 'quaternion', components: 4, encoding: encodingOf(), evaluate(f, out, o) { out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = w; }};
  }
  if (only && only.index === 0 && only.type === ChannelType.StaticVector3) {
    for (const v of only.value) ensure(Number.isFinite(v), ErrorCode.NONFINITE_VALUE, 'Non-finite static vector', {track});
    const [x, y, z] = only.value;
    return {kind: 'vector', components: 3, encoding: encodingOf(), evaluate(f, out, o) { out[o] = x; out[o + 1] = y; out[o + 2] = z; }};
  }
  const n = channels.length;
  ensure(n <= 4 && [...byIndex.keys()].every(i => i < n), ErrorCode.UNSUPPORTED_CHANNEL, 'Non-contiguous channel indices', {track});
  for (const c of channels) {
    ensure(c.type !== ChannelType.StaticVector3 && c.type !== ChannelType.StaticQuaternion, ErrorCode.UNSUPPORTED_CHANNEL, 'Static vector mixed with scalar channels', {track});
    if (c.type === ChannelType.StaticFloat) ensure(Number.isFinite(c.value[0]), ErrorCode.NONFINITE_VALUE, 'Non-finite static float', {track});
  }
  const parts = Array.from({length: n}, (_, i) => scalar(byIndex.get(i)));
  // Four scalar channels on a track the file declares as quaternion: x, y, z, w.
  return {kind: n === 4 ? (dataType === 1 ? 'quaternion' : 'vector4') : n === 1 ? 'float' : 'vector', components: n, encoding: encodingOf(), evaluate(f, out, o) { for (let i = 0; i < n; i++) out[o + i] = parts[i](f); }};
}

export function shortClipName(name) {
  let s = name.replace(/\\/g, '/');
  const slash = s.lastIndexOf('/');
  if (slash >= 0 && slash < s.length - 1) s = s.slice(slash + 1);
  const dot = s.indexOf('.');
  if (dot > 0) s = s.slice(0, dot);
  return s.toLowerCase();
}
