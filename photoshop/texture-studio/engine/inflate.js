'use strict';
// RPForge texture engine — raw DEFLATE decoder (RFC 1951). Own implementation.
const { EngineError } = require('./binary');

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

const FAST = 10; // bits resolved by one table lookup

// Canonical Huffman table: fast[] maps the next FAST (bit-reversed) bits to (symbol << 4 | length);
// longer codes fall back to a per-length search.
function buildTable(lengths, count) {
  const blCount = new Uint16Array(16), nextCode = new Uint16Array(16);
  for (let i = 0; i < count; i++) blCount[lengths[i]]++;
  blCount[0] = 0;
  let code = 0;
  for (let bits = 1; bits < 16; bits++) { code = (code + blCount[bits - 1]) << 1; nextCode[bits] = code; }
  const fast = new Int32Array(1 << FAST).fill(-1);
  const slowCodes = [], slowSyms = [], slowLens = [];
  let any = false;
  for (let sym = 0; sym < count; sym++) {
    const len = lengths[sym];
    if (!len) continue;
    any = true;
    const c = nextCode[len]++;
    let rev = 0;
    for (let i = 0; i < len; i++) rev |= ((c >>> i) & 1) << (len - 1 - i);
    if (len <= FAST) {
      for (let r = rev; r < (1 << FAST); r += 1 << len) fast[r] = (sym << 4) | len;
    } else { slowCodes.push(rev); slowSyms.push(sym); slowLens.push(len); }
  }
  return { fast, slowCodes, slowSyms, slowLens, any };
}

class BitReader {
  constructor(input) { this.input = input; this.pos = 0; this.bit = 0; this.bits = 0; }
  need(n) {
    while (this.bits < n) {
      if (this.pos >= this.input.length) {
        if (this.bits === 0 && n > 0) throw new EngineError('Dados compactados terminaram antes do esperado.');
        this.bits += 8; this.pos++; // zero padding; checked by caller via pos overflow
        if (this.pos > this.input.length + 4) throw new EngineError('Dados compactados terminaram antes do esperado.');
        continue;
      }
      this.bit |= this.input[this.pos++] << this.bits;
      this.bits += 8;
    }
  }
  read(n) {
    if (n === 0) return 0;
    this.need(n);
    const v = this.bit & ((1 << n) - 1);
    this.bit >>>= n; this.bits -= n;
    return v;
  }
  symbol(t) {
    this.need(FAST);
    const e = t.fast[this.bit & ((1 << FAST) - 1)];
    if (e >= 0) { const len = e & 15; this.bit >>>= len; this.bits -= len; return e >>> 4; }
    this.need(15);
    for (let i = 0; i < t.slowCodes.length; i++) {
      const len = t.slowLens[i];
      if ((this.bit & ((1 << len) - 1)) === t.slowCodes[i]) { this.bit >>>= len; this.bits -= len; return t.slowSyms[i]; }
    }
    throw new EngineError('Código Huffman inválido.');
  }
  align() { const drop = this.bits & 7; this.bit >>>= drop; this.bits -= drop; }
}

let FIXED_LIT = null, FIXED_DIST = null;
function fixedTables() {
  if (!FIXED_LIT) {
    const l = new Uint8Array(288);
    l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
    FIXED_LIT = buildTable(l, 288);
    FIXED_DIST = buildTable(new Uint8Array(30).fill(5), 30);
  }
}

// expectedSize: exact decompressed size when known (RSC7 declares it); output is preallocated.
function inflateRaw(input, expectedSize) {
  let out = new Uint8Array(expectedSize || Math.max(1024, input.length * 4));
  let op = 0;
  const grow = n => {
    if (op + n <= out.length) return;
    if (expectedSize) throw new EngineError('Dados descompactados maiores que o declarado.');
    let size = out.length * 2; while (size < op + n) size *= 2;
    const next = new Uint8Array(size); next.set(out.subarray(0, op)); out = next;
  };
  const br = new BitReader(input);
  let final = 0;
  do {
    final = br.read(1);
    const type = br.read(2);
    if (type === 0) {
      br.align();
      // Drop whole bytes still held in the bit buffer back to the stream position.
      const held = br.bits >>> 3; br.pos -= held; br.bit = 0; br.bits = 0;
      if (br.pos + 4 > input.length) throw new EngineError('Bloco armazenado truncado.');
      const len = input[br.pos] | (input[br.pos + 1] << 8), nlen = input[br.pos + 2] | (input[br.pos + 3] << 8);
      if ((len ^ 0xffff) !== nlen) throw new EngineError('Bloco armazenado corrompido.');
      br.pos += 4;
      if (br.pos + len > input.length) throw new EngineError('Bloco armazenado truncado.');
      grow(len); out.set(input.subarray(br.pos, br.pos + len), op); op += len; br.pos += len;
      continue;
    }
    let lit, dist;
    if (type === 1) { fixedTables(); lit = FIXED_LIT; dist = FIXED_DIST; }
    else if (type === 2) {
      const hlit = br.read(5) + 257, hdist = br.read(5) + 1, hclen = br.read(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = br.read(3);
      const clt = buildTable(cl, 19);
      const lens = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist;) {
        const s = br.symbol(clt);
        if (s < 16) lens[i++] = s;
        else {
          let rep, val = 0;
          if (s === 16) { if (i === 0) throw new EngineError('Repetição sem código anterior.'); val = lens[i - 1]; rep = 3 + br.read(2); }
          else if (s === 17) rep = 3 + br.read(3);
          else rep = 11 + br.read(7);
          if (i + rep > hlit + hdist) throw new EngineError('Tabela Huffman inválida.');
          lens.fill(val, i, i + rep); i += rep;
        }
      }
      lit = buildTable(lens.subarray(0, hlit), hlit);
      dist = buildTable(lens.subarray(hlit), hdist);
    } else throw new EngineError('Tipo de bloco DEFLATE inválido.');
    for (;;) {
      const s = br.symbol(lit);
      if (s < 256) { grow(1); out[op++] = s; continue; }
      if (s === 256) break;
      const li = s - 257;
      if (li >= 29) throw new EngineError('Comprimento DEFLATE inválido.');
      const len = LEN_BASE[li] + br.read(LEN_EXTRA[li]);
      const ds = br.symbol(dist);
      if (ds >= 30) throw new EngineError('Distância DEFLATE inválida.');
      const d = DIST_BASE[ds] + br.read(DIST_EXTRA[ds]);
      if (d > op) throw new EngineError('Distância DEFLATE fora da janela.');
      grow(len);
      let from = op - d;
      if (d >= len) { out.copyWithin(op, from, from + len); op += len; }
      else for (let k = 0; k < len; k++) out[op++] = out[from++];
    }
  } while (!final);
  if (expectedSize && op !== expectedSize) throw new EngineError('Tamanho descompactado diferente do declarado.');
  return expectedSize ? out : out.subarray(0, op);
}

module.exports = { inflateRaw };
