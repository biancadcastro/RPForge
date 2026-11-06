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
    ensure(n >= 0 && n <= 32 && (n | 0) === n, ErrorCode.UNSUPPORTED_CHANNEL, 'Invalid bit width', {bits: n});
    ensure(this.pos + n <= this.end, ErrorCode.POINTER_OUT_OF_RANGE, 'Bitstream truncated', {bit: this.pos, need: n});
    if (n === 0) return 0;
    // Gather the (at most five) bytes covering the field into one exact Number (< 2^40).
    const b = this.bytes, i = this.pos >>> 3, off = this.pos & 7, len = b.length;
    const window = b[i] + (i + 1 < len ? b[i + 1] : 0) * 256 + (i + 2 < len ? b[i + 2] : 0) * 65536
      + (i + 3 < len ? b[i + 3] : 0) * 16777216 + (i + 4 < len ? b[i + 4] : 0) * 4294967296;
    this.pos += n;
    return Math.floor(window / (1 << off)) % 2 ** n;
  }
}

/** Little-endian 32-bit word stream; write() places up to 32 bits at the cursor. */
export class BitWriter {
  constructor(words = []) { this.words = words; this.pos = 0; this.base = 0; }
  /** Write into a preallocated Uint32Array starting at word `base` (frame data). */
  static into(array, base) { const w = new BitWriter(array); w.base = base; return w; }
  write(value, n) {
    if (n === 0) return;
    const v = n === 32 ? value >>> 0 : (value >>> 0) & ((1 << n) - 1 >>> 0);
    const w = this.base + (this.pos >>> 5), off = this.pos & 31, words = this.words;
    while (words.length !== undefined && !(words instanceof Uint32Array) && words.length <= w + 1) words.push(0);
    words[w] = (words[w] | (v << off)) >>> 0;
    if (off + n > 32) words[w + 1] = (words[w + 1] | (v >>> (32 - off))) >>> 0;
    this.pos += n;
  }
}

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export function floatBits(v) { f32[0] = v; return u32[0]; }
export function bitsFloat(b) { u32[0] = b >>> 0; return f32[0]; }
