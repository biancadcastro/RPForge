// LSB-first bit access over a byte range, as used by YCD frame and channel bitstreams.
// Reads past `end` fail instead of returning zeros (the reference implementation pads
// with zeros; we treat that as a malformed stream).
import {ErrorCode, ensure} from './errors.js';

export class BitReader {
  constructor(bytes, startByte, endByte) {
    this.bytes = bytes; this.start = startByte * 8; this.end = endByte * 8; this.pos = this.start;
  }
  seek(bit) { ensure(bit >= this.start && bit <= this.end, ErrorCode.POINTER_OUT_OF_RANGE, 'Bit offset outside stream', {bit}); this.pos = bit; }
  read(n) {
    ensure(Number.isInteger(n) && n >= 0 && n <= 32, ErrorCode.UNSUPPORTED_CHANNEL, 'Invalid bit width', {bits: n});
    ensure(this.pos + n <= this.end, ErrorCode.POINTER_OUT_OF_RANGE, 'Bitstream truncated', {bit: this.pos, need: n});
    let result = 0, got = 0, p = this.pos;
    while (got < n) {
      const byte = this.bytes[p >>> 3], off = p & 7, take = Math.min(8 - off, n - got);
      result += ((byte >>> off) & ((1 << take) - 1)) * 2 ** got;
      got += take; p += take;
    }
    this.pos = p;
    return result;
  }
}

export class BitWriter {
  constructor() { this.words = []; this.pos = 0; }
  write(value, n) {
    for (let i = 0; i < n; i++) {
      const bit = Math.floor(value / 2 ** i) % 2, w = this.pos >>> 5;
      while (this.words.length <= w) this.words.push(0);
      if (bit) this.words[w] = (this.words[w] | (1 << (this.pos & 31))) >>> 0;
      this.pos++;
    }
  }
}

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export function floatBits(v) { f32[0] = v; return u32[0]; }
export function bitsFloat(b) { u32[0] = b >>> 0; return f32[0]; }
