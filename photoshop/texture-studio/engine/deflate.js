'use strict';
// RPForge texture engine — raw DEFLATE encoder (RFC 1951). Own implementation:
// LZ77 with hash chains + dynamic Huffman blocks with length-limited codes.

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// Length (3..258) -> code index; distance (1..32768) -> code index.
const LEN_CODE = new Uint8Array(259);
for (let c = 0; c < 29; c++) for (let l = LEN_BASE[c]; l < LEN_BASE[c] + (1 << LEN_EXTRA[c]) && l <= 258; l++) LEN_CODE[l] = c;
LEN_CODE[258] = 28;
function distCode(d) { let c = 0; while (c < 29 && DIST_BASE[c + 1] <= d) c++; return c; }
const DIST_SMALL = new Uint8Array(512);
for (let d = 1; d < 512; d++) DIST_SMALL[d] = distCode(d);
const DIST_LARGE = new Uint8Array(256); // (d-1) >> 7
for (let i = 0; i < 256; i++) DIST_LARGE[i] = distCode((i << 7) + 1);
function dcode(d) { return d < 512 ? DIST_SMALL[d] : DIST_LARGE[(d - 1) >> 7]; }

class BitWriter {
  constructor(capacity) { this.out = new Uint8Array(Math.max(1024, capacity)); this.pos = 0; this.bit = 0; this.bits = 0; }
  ensure(n) {
    if (this.pos + n <= this.out.length) return;
    let size = this.out.length * 2; while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size); next.set(this.out.subarray(0, this.pos)); this.out = next;
  }
  write(value, n) {
    this.bit |= value << this.bits; this.bits += n;
    if (this.bits >= 16) {
      this.ensure(2);
      this.out[this.pos++] = this.bit & 255; this.out[this.pos++] = (this.bit >>> 8) & 255;
      this.bit >>>= 16; this.bits -= 16;
    }
  }
  flush() {
    this.ensure(4);
    while (this.bits > 0) { this.out[this.pos++] = this.bit & 255; this.bit >>>= 8; this.bits -= 8; }
    this.bits = 0; this.bit = 0;
  }
  result() { return this.out.subarray(0, this.pos); }
}

// Huffman code lengths limited to maxBits (package-merge free heuristic, as in miniz/zlib).
function codeLengths(freq, maxBits) {
  const n = freq.length, lengths = new Uint8Array(n);
  const syms = [];
  for (let i = 0; i < n; i++) if (freq[i]) syms.push(i);
  if (syms.length === 0) return lengths;
  if (syms.length === 1) { lengths[syms[0]] = 1; return lengths; }
  // Build tree with a simple binary heap over (weight, node).
  const weight = [], parent = [];
  const heap = [];
  const push = node => {
    heap.push(node); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (weight[heap[p]] <= weight[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < heap.length && weight[heap[l]] < weight[heap[m]]) m = l;
        if (r < heap.length && weight[heap[r]] < weight[heap[m]]) m = r;
        if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  for (const s of syms) { weight.push(freq[s]); parent.push(-1); push(weight.length - 1); }
  while (heap.length > 1) {
    const a = pop(), b = pop();
    weight.push(weight[a] + weight[b]); parent.push(-1);
    const node = weight.length - 1; parent[a] = node; parent[b] = node; push(node);
  }
  // Depth of each leaf.
  const depthCount = new Uint32Array(64);
  const leafDepth = syms.map((s, i) => { let d = 0, x = i; while (parent[x] !== -1) { x = parent[x]; d++; } return d; });
  for (const d of leafDepth) depthCount[Math.min(d, 63)]++;
  // Limit lengths: move overflow into maxBits and rebalance the Kraft sum.
  let overflow = 0;
  for (let d = maxBits + 1; d < 64; d++) { overflow += depthCount[d]; depthCount[maxBits] += depthCount[d]; depthCount[d] = 0; }
  if (overflow) {
    let kraft = 0;
    for (let d = 1; d <= maxBits; d++) kraft += depthCount[d] << (maxBits - d);
    const limit = 1 << maxBits;
    while (kraft > limit) {
      depthCount[maxBits]--;
      for (let d = maxBits - 1; d > 0; d--) if (depthCount[d]) { depthCount[d]--; depthCount[d + 1] += 2; break; }
      kraft--;
    }
  }
  // Assign lengths: most frequent symbols get the shortest codes.
  const order = syms.slice().sort((a, b) => freq[b] - freq[a] || a - b);
  let k = 0;
  for (let d = 1; d <= maxBits; d++) for (let c = 0; c < depthCount[d]; c++) lengths[order[k++]] = d;
  return lengths;
}

function canonicalCodes(lengths) {
  const blCount = new Uint16Array(16), next = new Uint16Array(16), codes = new Uint16Array(lengths.length);
  for (const l of lengths) blCount[l]++;
  blCount[0] = 0;
  let code = 0;
  for (let b = 1; b < 16; b++) { code = (code + blCount[b - 1]) << 1; next[b] = code; }
  for (let s = 0; s < lengths.length; s++) {
    const l = lengths[s]; if (!l) continue;
    const c = next[l]++; let rev = 0;
    for (let i = 0; i < l; i++) rev |= ((c >>> i) & 1) << (l - 1 - i);
    codes[s] = rev;
  }
  return codes;
}

// Run-length encodes the concatenated literal+distance lengths with symbols 16/17/18.
function rleLengths(lens) {
  const out = [];
  for (let i = 0; i < lens.length;) {
    const v = lens[i]; let run = 1;
    while (i + run < lens.length && lens[i + run] === v) run++;
    let left = run;
    if (v === 0) {
      while (left >= 11) { const r = Math.min(left, 138); out.push([18, r - 11]); left -= r; }
      if (left >= 3) { out.push([17, left - 3]); left = 0; }
      while (left-- > 0) out.push([0, 0]);
    } else {
      out.push([v, 0]); left--;
      while (left >= 3) { const r = Math.min(left, 6); out.push([16, r - 3]); left -= r; }
      while (left-- > 0) out.push([v, 0]);
    }
    i += run;
  }
  return out;
}

const WINDOW = 32768, HASH_BITS = 15, HASH_SIZE = 1 << HASH_BITS, MAX_MATCH = 258, MIN_MATCH = 3;
const BLOCK_SYMBOLS = 1 << 16;

function deflateRaw(input, options = {}) {
  const chainLimit = options.chain || 48, niceLength = options.nice || 128;
  const n = input.length;
  const w = new BitWriter((n >>> 1) + 1024);
  if (n === 0) { w.write(1, 1); w.write(1, 2); w.write(0, 7); w.flush(); return w.result(); }
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(WINDOW);
  const hashAt = i => (((input[i] << 10) ^ (input[i + 1] << 5) ^ input[i + 2]) & (HASH_SIZE - 1));
  // Symbol buffer: literal (<256) or length/distance pairs, flushed in dynamic blocks.
  const sLit = new Uint16Array(BLOCK_SYMBOLS), sDist = new Uint16Array(BLOCK_SYMBOLS);
  let count = 0, blockStart = 0;

  const emitBlock = (final, end) => {
    const litFreq = new Uint32Array(286), distFreq = new Uint32Array(30);
    for (let i = 0; i < count; i++) {
      if (sDist[i] === 0) litFreq[sLit[i]]++;
      else { litFreq[257 + LEN_CODE[sLit[i]]]++; distFreq[dcode(sDist[i])]++; }
    }
    litFreq[256]++;
    let litLens = codeLengths(litFreq, 15), distLens = codeLengths(distFreq, 15);
    if (!distLens.some(x => x)) distLens[0] = 1;
    let hlit = 286; while (hlit > 257 && !litLens[hlit - 1]) hlit--;
    let hdist = 30; while (hdist > 1 && !distLens[hdist - 1]) hdist--;
    const all = new Uint8Array(hlit + hdist); all.set(litLens.subarray(0, hlit)); all.set(distLens.subarray(0, hdist), hlit);
    const rle = rleLengths(all);
    const clFreq = new Uint32Array(19); for (const [s] of rle) clFreq[s]++;
    const clLens = codeLengths(clFreq, 7), clCodes = canonicalCodes(clLens);
    let hclen = 19; while (hclen > 4 && !clLens[CL_ORDER[hclen - 1]]) hclen--;
    const litCodes = canonicalCodes(litLens), distCodes = canonicalCodes(distLens);
    // Estimate dynamic size vs stored; incompressible data goes stored.
    let bits = 17 + hclen * 3;
    for (const [s] of rle) bits += clLens[s] + (s === 16 ? 2 : s === 17 ? 3 : s === 18 ? 7 : 0);
    for (let i = 0; i < 286; i++) bits += litFreq[i] * litLens[i];
    for (let i = 0; i < 29; i++) bits += litFreq[257 + i] * LEN_EXTRA[i];
    for (let i = 0; i < 30; i++) bits += distFreq[i] * (distLens[i] + DIST_EXTRA[i]);
    const raw = end - blockStart;
    if (raw > 0 && raw <= 65535 && bits > (raw + 5) * 8) {
      w.write(final, 1); w.write(0, 2); w.flush();
      w.ensure(raw + 4);
      w.out[w.pos++] = raw & 255; w.out[w.pos++] = raw >>> 8; w.out[w.pos++] = ~raw & 255; w.out[w.pos++] = (~raw >>> 8) & 255;
      w.out.set(input.subarray(blockStart, end), w.pos); w.pos += raw;
    } else {
      w.write(final, 1); w.write(2, 2);
      w.write(hlit - 257, 5); w.write(hdist - 1, 5); w.write(hclen - 4, 4);
      for (let i = 0; i < hclen; i++) w.write(clLens[CL_ORDER[i]], 3);
      for (const [s, extra] of rle) {
        w.write(clCodes[s], clLens[s]);
        if (s === 16) w.write(extra, 2); else if (s === 17) w.write(extra, 3); else if (s === 18) w.write(extra, 7);
      }
      for (let i = 0; i < count; i++) {
        const d = sDist[i];
        if (d === 0) { const s = sLit[i]; w.write(litCodes[s], litLens[s]); continue; }
        const len = sLit[i], lc = LEN_CODE[len], dc = dcode(d);
        w.write(litCodes[257 + lc], litLens[257 + lc]);
        if (LEN_EXTRA[lc]) w.write(len - LEN_BASE[lc], LEN_EXTRA[lc]);
        w.write(distCodes[dc], distLens[dc]);
        if (DIST_EXTRA[dc]) w.write(d - DIST_BASE[dc], DIST_EXTRA[dc]);
      }
      w.write(litCodes[256], litLens[256]);
    }
    count = 0; blockStart = end;
  };

  const insert = i => { const h = hashAt(i); prev[i & (WINDOW - 1)] = head[h]; head[h] = i; };
  let i = 0;
  while (i < n) {
    let bestLen = 0, bestDist = 0;
    if (i + MIN_MATCH <= n) {
      const h = hashAt(i);
      let cand = head[h], chain = chainLimit;
      const maxLen = Math.min(MAX_MATCH, n - i);
      while (cand >= 0 && i - cand <= WINDOW && chain-- > 0) {
        if (input[cand + bestLen] === input[i + bestLen] && input[cand] === input[i]) {
          let l = 0; while (l < maxLen && input[cand + l] === input[i + l]) l++;
          if (l > bestLen) { bestLen = l; bestDist = i - cand; if (l >= niceLength) break; }
        }
        const next = prev[cand & (WINDOW - 1)];
        if (next >= cand) break;
        cand = next;
      }
      prev[i & (WINDOW - 1)] = head[h]; head[h] = i;
    }
    if (bestLen >= MIN_MATCH) {
      sLit[count] = bestLen; sDist[count] = bestDist; count++;
      const end = i + bestLen;
      // Long runs (zero padding in resource pages) skip hashing most positions for speed.
      const step = bestLen > 64 ? 8 : 1;
      for (let k = i + 1; k < end && k + MIN_MATCH <= n; k += step) insert(k);
      i = end;
    } else { sLit[count] = input[i]; sDist[count] = 0; count++; i++; }
    if (count >= BLOCK_SYMBOLS - 1) emitBlock(0, i);
  }
  emitBlock(1, n);
  w.flush();
  return w.result();
}

module.exports = { deflateRaw };
