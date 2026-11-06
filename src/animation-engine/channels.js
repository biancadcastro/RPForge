// Decoding of the nine YCD channel types inside one Sequence block.
// Read support covers every type whose layout is documented in the reference;
// write support (ycd-write.js) is deliberately narrower.
import {ErrorCode, ensure, fail} from './errors.js';
import {BitReader, bitsFloat} from './bits.js';

export const ChannelType = Object.freeze({
  StaticQuaternion: 0, StaticVector3: 1, StaticFloat: 2, RawFloat: 3, QuantizeFloat: 4,
  IndirectQuantizeFloat: 5, LinearFloat: 6, CachedQuaternion1: 7, CachedQuaternion2: 8,
});
export const CHANNEL_NAMES = Object.freeze(Object.keys(ChannelType));
const fr = Math.fround;

/** Quantized value exactly as the reference evaluates it in float32. */
function dequantize(bits, quantum, offset) { return fr(fr(fr(bits) * quantum) + offset); }

/**
 * Parse one Sequence block's data (bytes after the 32-byte header).
 * Returns channels with decoded per-frame values and the root-motion refs.
 */
export function parseBlockChannels(data, header, limits) {
  const {frameOffset, frameLength, numFrames, chunkSize, rootPositionRefs, rootRotationRefs, rootMotionRefsOffset} = header;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const frameBytes = frameLength * numFrames;
  const listOffset = frameOffset + frameBytes;
  ensure(listOffset + 18 <= data.length, ErrorCode.POINTER_OUT_OF_RANGE, 'Channel list outside sequence data');
  const counts = [];
  for (let t = 0; t < 9; t++) counts.push(dv.getUint16(listOffset + t * 2, true));
  const total = counts.reduce((a, b) => a + b, 0);
  ensure(total >= 1 && total <= limits.maxChannelsPerBlock, ErrorCode.LIMIT_EXCEEDED, 'Channel count outside budget', {channels: total});

  let item = listOffset + 18, main = 0;
  const channels = [], notes = [];
  const takeMain = (n, what) => {
    ensure(main + n <= frameOffset, ErrorCode.POINTER_OUT_OF_RANGE, `${what} outside channel data`, {at: main});
    const at = main; main += n; return at;
  };
  for (let type = 0; type < 9; type++) {
    for (let c = 0; c < counts[type]; c++) {
      ensure(item + 2 <= data.length, ErrorCode.POINTER_OUT_OF_RANGE, 'Channel item outside sequence data');
      const tag = dv.getUint16(item, true); item += 2;
      const ch = {type, sequence: tag >>> 2, index: tag & 3, dataIntOffset: main / 4};
      switch (type) {
        case ChannelType.StaticQuaternion: case ChannelType.StaticVector3: {
          const at = takeMain(12, 'Static value');
          ch.value = [dv.getFloat32(at, true), dv.getFloat32(at + 4, true), dv.getFloat32(at + 8, true)];
          break;
        }
        case ChannelType.StaticFloat: ch.value = [dv.getFloat32(takeMain(4, 'Static value'), true)]; break;
        case ChannelType.RawFloat: ch.frameBits = 32; break;
        case ChannelType.QuantizeFloat: {
          const at = takeMain(12, 'Quantize header');
          ch.valueBits = dv.getInt32(at, true); ch.quantum = dv.getFloat32(at + 4, true); ch.offset = dv.getFloat32(at + 8, true);
          ensure(ch.valueBits >= 0 && ch.valueBits <= 32, ErrorCode.UNSUPPORTED_CHANNEL, 'Invalid quantize bit width', {bits: ch.valueBits});
          ch.frameBits = ch.valueBits; break;
        }
        case ChannelType.IndirectQuantizeFloat: {
          const at = takeMain(20, 'Indirect header');
          ch.frameBits = dv.getInt32(at, true); ch.valueBits = dv.getInt32(at + 4, true); const numInts = dv.getInt32(at + 8, true);
          ch.quantum = dv.getFloat32(at + 12, true); ch.offset = dv.getFloat32(at + 16, true);
          ensure(ch.frameBits >= 1 && ch.frameBits <= 24 && ch.valueBits >= 1 && ch.valueBits <= 32 && numInts >= 0, ErrorCode.UNSUPPORTED_CHANNEL, 'Invalid indirect channel header');
          ch.numInts = numInts;
          const valuesAt = takeMain(numInts * 4, 'Indirect values');
          const count = Math.min(Math.floor(numInts * 32 / ch.valueBits), 2 ** ch.frameBits - 1);
          ensure(count <= limits.maxSamples, ErrorCode.LIMIT_EXCEEDED, 'Indirect value table above budget');
          const r = new BitReader(data, valuesAt, valuesAt + numInts * 4), table = new Float32Array(count);
          for (let i = 0; i < count; i++) table[i] = dequantize(r.read(ch.valueBits), ch.quantum, ch.offset);
          ch.table = table; break;
        }
        case ChannelType.LinearFloat: {
          const at = takeMain(16, 'Linear header');
          const numInts = dv.getInt32(at, true), packed = dv.getInt32(at + 4, true);
          ch.quantum = dv.getFloat32(at + 8, true); ch.offset = dv.getFloat32(at + 12, true);
          ensure(numInts >= 4, ErrorCode.UNSUPPORTED_CHANNEL, 'Invalid linear channel header');
          takeMain(numInts * 4 - 16, 'Linear stream');
          ch.values = decodeLinear(data, at + 16, at + numInts * 4, packed, numFrames, chunkSize, ch.quantum, ch.offset);
          break;
        }
        case ChannelType.CachedQuaternion1: case ChannelType.CachedQuaternion2:
          ch.quatIndex = ch.index; ch.index = type === ChannelType.CachedQuaternion1 ? 3 : 4; break;
        default: fail(ErrorCode.UNSUPPORTED_CHANNEL, 'Unknown channel type', {type});
      }
      channels.push(ch);
    }
    const rem = counts[type] % 4;
    if (rem) {
      for (let i = 0; i < 4 - rem; i++) {
        ensure(item + 2 <= data.length, ErrorCode.POINTER_OUT_OF_RANGE, 'Channel padding outside sequence data');
        notes.push(dv.getUint16(item, true)); item += 2;
      }
    }
  }
  ensure(main === frameOffset, ErrorCode.UNREFERENCED_DATA, 'Channel data does not end at frame data', {consumed: main, frameOffset});

  // Frame data: per frame, channel bits concatenated in type order.
  let bit = 0;
  for (const ch of channels) if (ch.frameBits !== undefined) { ch.frameBitOffset = bit; bit += ch.frameBits; } else ch.frameBitOffset = bit;
  ensure(bit <= frameLength * 8 && bit <= limits.maxFrameBits, ErrorCode.INCONSISTENT_REFERENCE, 'Frame bits exceed frame length', {bits: bit, frameLength});
  // Padding bits after the last channel of each frame carry no value: they must be zero.
  let paddingBits = 0;
  if (bit < frameLength * 8) {
    const pr = new BitReader(data, frameOffset, frameOffset + frameBytes);
    for (let f = 0; f < numFrames; f++) {
      let left = frameLength * 8 - bit;
      pr.seek((frameOffset + frameLength * f) * 8 + bit);
      while (left > 0) { const n = Math.min(32, left); if (pr.read(n) !== 0) paddingBits++; left -= n; }
    }
  }
  for (const ch of channels) {
    if (!ch.frameBits && ch.type !== ChannelType.QuantizeFloat && ch.type !== ChannelType.IndirectQuantizeFloat) continue;
    const values = new Float32Array(numFrames);
    const r = new BitReader(data, frameOffset, frameOffset + frameBytes);
    for (let f = 0; f < numFrames; f++) {
      // Positions are in range: total frame bits <= frameLength * 8 and the frame block lies inside data.
      r.pos = (frameOffset + frameLength * f) * 8 + ch.frameBitOffset;
      const raw = r.read(ch.frameBits);
      if (ch.type === ChannelType.RawFloat) {
        const v = bitsFloat(raw);
        ensure(Number.isFinite(v), ErrorCode.NONFINITE_VALUE, 'Non-finite raw sample', {sequence: ch.sequence, frame: f});
        values[f] = v;
      } else if (ch.type === ChannelType.QuantizeFloat) values[f] = dequantize(raw, ch.quantum, ch.offset);
      else {
        ensure(raw < ch.table.length, ErrorCode.INCONSISTENT_REFERENCE, 'Indirect frame index outside value table', {frame: f, index: raw});
        values[f] = ch.table[raw];
      }
    }
    ch.values = values;
  }

  const refCount = rootPositionRefs + rootRotationRefs;
  const refs = {position: [], rotation: []};
  ensure(item + refCount * 6 <= data.length, ErrorCode.POINTER_OUT_OF_RANGE, 'Root motion refs outside sequence data');
  ensure(item === rootMotionRefsOffset - 32, ErrorCode.INCONSISTENT_REFERENCE, 'Root motion refs offset mismatch', {expected: rootMotionRefsOffset - 32, actual: item});
  for (let i = 0; i < refCount; i++) {
    const ref = {channelType: data[item], channelIndex: data[item + 1], dataIntOffset: dv.getUint16(item + 2, true), frameBitOffset: dv.getUint16(item + 4, true)};
    (i < rootPositionRefs ? refs.position : refs.rotation).push(ref); item += 6;
  }
  ensure(item === data.length, ErrorCode.UNREFERENCED_DATA, 'Trailing sequence data', {bytes: data.length - item});
  return {channels, refs, padding: notes, frameBits: bit, nonZeroFramePadding: paddingBits};
}

function decodeLinear(data, start, end, packed, numFrames, chunkSize, quantum, offset) {
  const c1 = packed & 0xff, c2 = (packed >>> 8) & 0xff, c3 = (packed >>> 16) & 0xff;
  ensure(c1 <= 32 && c2 <= 32 && c3 <= 31 && (packed >>> 24) === 0, ErrorCode.UNSUPPORTED_CHANNEL, 'Invalid linear bit widths');
  ensure(chunkSize >= 1, ErrorCode.UNSUPPORTED_CHANNEL, 'Invalid chunk size');
  const chunks = Math.ceil(numFrames / chunkSize), r = new BitReader(data, start, end);
  const offsets = [], starts = [];
  for (let i = 0; i < chunks; i++) offsets.push(c1 ? r.read(c1) : 0);
  for (let i = 0; i < chunks; i++) starts.push(c2 ? r.read(c2) : 0);
  const deltaBase = start * 8 + chunks * (c1 + c2), out = new Float32Array(numFrames);
  for (let i = 0; i < chunks; i++) {
    r.seek(deltaBase + offsets[i]);
    let value = starts[i], inc = 0;
    for (let j = 0; j < chunkSize; j++) {
      const frame = i * chunkSize + j;
      if (frame >= numFrames) break;
      out[frame] = dequantize(value, quantum, offset);
      if (j + 1 >= chunkSize) break;
      let delta = c3 ? r.read(c3) : 0, zeros = 0;
      while (r.read(1) === 0) { zeros++; ensure(zeros <= 32, ErrorCode.UNSUPPORTED_CHANNEL, 'Linear delta prefix too long'); }
      delta += zeros * 2 ** c3;
      if (delta !== 0 && r.read(1) === 1) delta = -delta;
      inc += delta; value += inc;
      ensure(Number.isSafeInteger(value), ErrorCode.UNSUPPORTED_CHANNEL, 'Linear value overflow');
    }
  }
  return out;
}
