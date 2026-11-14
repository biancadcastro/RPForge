'use strict';
// RPForge texture engine — GPU texture formats. Own implementation.
// Decode: BC1/DXT1, BC2/DXT3, BC3/DXT5, BC4/ATI1, BC5/ATI2, BC7 (all modes), uncompressed.
// Encode: BC1, BC3, BC4, BC5, BC7 (mode 6), uncompressed.
// Pixels are RGBA8 (Uint8Array, 4 bytes per pixel, row-major).
const { EngineError } = require('./binary');

const FORMATS = {
  DXT1: { code: 0x31545844, block: 8, label: 'DXT1 (BC1)' },
  DXT3: { code: 0x33545844, block: 16, label: 'DXT3 (BC2)' },
  DXT5: { code: 0x35545844, block: 16, label: 'DXT5 (BC3)' },
  ATI1: { code: 0x31495441, block: 8, label: 'ATI1 (BC4)' },
  ATI2: { code: 0x32495441, block: 16, label: 'ATI2 (BC5)' },
  BC7: { code: 0x20374342, block: 16, label: 'BC7' },
  A8R8G8B8: { code: 21, bpp: 4, label: 'A8R8G8B8' },
  X8R8G8B8: { code: 22, bpp: 4, label: 'X8R8G8B8' },
  A1R5G5B5: { code: 25, bpp: 2, label: 'A1R5G5B5' },
  A8: { code: 28, bpp: 1, label: 'A8' },
  A8B8G8R8: { code: 32, bpp: 4, label: 'A8B8G8R8' },
  L8: { code: 50, bpp: 1, label: 'L8' },
};
const BY_CODE = new Map(Object.entries(FORMATS).map(([k, v]) => [v.code, k]));
function formatName(code) {
  const name = BY_CODE.get(code);
  if (!name) throw new EngineError(`Formato de textura não suportado (0x${code.toString(16)}).`, 'format');
  return name;
}
const isBlock = f => !!FORMATS[f].block;

function levelSize(format, w, h) {
  const f = FORMATS[format];
  if (f.block) return Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * f.block;
  return w * h * f.bpp;
}
function dataSize(format, w, h, levels) {
  let size = 0;
  for (let l = 0; l < levels; l++) { size += levelSize(format, w, h); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
  return size;
}
// Row pitch as stored in the grcTexture "Stride" field (GTA stores block-row bytes / 4 for BC).
function strideOf(format, w) {
  const f = FORMATS[format];
  return f.block ? (Math.max(1, (w + 3) >> 2) * f.block) >> 2 : w * f.bpp;
}
// GTA convention: the mip chain stops when the smaller side reaches 4 px.
function gtaLevels(w, h) {
  let levels = 1, m = Math.min(w, h);
  while (m > 4 && levels < 13) { m >>= 1; levels++; }
  return levels;
}

// ---------------- decode helpers ----------------
function rgb565(c, out, o) {
  const r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
  out[o] = (r << 3) | (r >> 2); out[o + 1] = (g << 2) | (g >> 4); out[o + 2] = (b << 3) | (b >> 2);
}
function colorBlock(src, s, px, forceFour) {
  // px: 16*4 RGBA output for one block
  const c0 = src[s] | (src[s + 1] << 8), c1 = src[s + 2] | (src[s + 3] << 8);
  const pal = new Uint8Array(16);
  rgb565(c0, pal, 0); rgb565(c1, pal, 4); pal[3] = pal[7] = 255;
  if (c0 > c1 || forceFour) {
    for (let k = 0; k < 3; k++) { pal[8 + k] = ((2 * pal[k] + pal[4 + k]) / 3) | 0; pal[12 + k] = ((pal[k] + 2 * pal[4 + k]) / 3) | 0; }
    pal[11] = pal[15] = 255;
  } else {
    for (let k = 0; k < 3; k++) { pal[8 + k] = (pal[k] + pal[4 + k]) >> 1; pal[12 + k] = 0; }
    pal[11] = 255; pal[15] = 0;
  }
  const bits = (src[s + 4] | (src[s + 5] << 8) | (src[s + 6] << 16) | (src[s + 7] << 24)) >>> 0;
  for (let i = 0; i < 16; i++) { const idx = (bits >>> (i * 2)) & 3; px.set(pal.subarray(idx * 4, idx * 4 + 4), i * 4); }
}
function alphaBlock8(src, s, px, channel) {
  // BC3 alpha / BC4 channel: 2 endpoints + 16 x 3-bit indices
  const a0 = src[s], a1 = src[s + 1], pal = [a0, a1];
  if (a0 > a1) for (let i = 1; i < 7; i++) pal.push((((7 - i) * a0 + i * a1) / 7) | 0);
  else { for (let i = 1; i < 5; i++) pal.push((((5 - i) * a0 + i * a1) / 5) | 0); pal.push(0, 255); }
  let lo = (src[s + 2] | (src[s + 3] << 8) | (src[s + 4] << 16)) >>> 0, hi = (src[s + 5] | (src[s + 6] << 8) | (src[s + 7] << 16)) >>> 0;
  for (let i = 0; i < 16; i++) {
    const idx = i < 8 ? (lo >>> (3 * i)) & 7 : (hi >>> (3 * (i - 8))) & 7;
    px[i * 4 + channel] = pal[idx];
  }
}

// ---------------- BC7 ----------------
const P2 = [0xCCCC, 0x8888, 0xEEEE, 0xECC8, 0xC880, 0xFEEC, 0xFEC8, 0xEC80, 0xC800, 0xFFEC, 0xFE80, 0xE800, 0xFFE8, 0xFF00, 0xFFF0, 0xF000,
  0xF710, 0x008E, 0x7100, 0x08CE, 0x008C, 0x7310, 0x3100, 0x8CCE, 0x088C, 0x3110, 0x6666, 0x366C, 0x17E8, 0x0FF0, 0x718E, 0x399C,
  0xAAAA, 0xF0F0, 0x5A5A, 0x33CC, 0x3C3C, 0x55AA, 0x9696, 0xA55A, 0x73CE, 0x13C8, 0x324C, 0x3BDC, 0x6996, 0xC33C, 0x9966, 0x0660,
  0x0272, 0x04E4, 0x4E40, 0x2720, 0xC936, 0x936C, 0x39C6, 0x639C, 0x9336, 0x9CC6, 0x817E, 0xE718, 0xCCF0, 0x0FCC, 0x7744, 0xEE22];
const P3 = [
  '0011001102212222', '0001001122112221', '0000200122112211', '0222002200110111', '0000000011221122', '0011001100220022', '0022002211111111', '0011001122112211',
  '0000000011112222', '0000111111112222', '0000111122222222', '0012001200120012', '0112011201120112', '0122012201220122', '0011011211221222', '0011200122002220',
  '0001001101121122', '0111001120012200', '0000112211221122', '0022002200221111', '0111011102220222', '0001000122212221', '0000001101220122', '0000110022102210',
  '0122012200110000', '0012001211222222', '0110122112210110', '0000011012211221', '0022110211020022', '0110011020022222', '0011012201220011', '0000200022112221',
  '0000000211221222', '0222002200120011', '0011001200220222', '0120012001200120', '0000111122220000', '0120120120120120', '0120201212010120', '0011220011220011',
  '0011112222000011', '0101010122222222', '0000000021212121', '0022112200221122', '0022001100220011', '0220122102201221', '0101222222220101', '0000212121212121',
  '0101010101012222', '0222011102220111', '0002111200021112', '0000211221122112', '0222011101110222', '0002111211120002', '0110011001102222', '0000000021122112',
  '0110011022222222', '0022001100110022', '0022112211220022', '0000000000002112', '0002000100020001', '0222122202221222', '0101222222222222', '0111201122012220',
].map(s => Array.from(s, Number));
const A2 = [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2,
  15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2, 2, 15, 15, 6, 6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15];
const A3A = [3, 3, 15, 15, 8, 3, 15, 15, 8, 8, 6, 6, 6, 5, 3, 3, 3, 3, 8, 15, 3, 3, 6, 10, 5, 8, 8, 6, 8, 5, 15, 15,
  8, 15, 3, 5, 6, 10, 8, 15, 15, 3, 15, 5, 15, 15, 15, 15, 3, 15, 5, 5, 5, 8, 5, 10, 5, 10, 8, 13, 15, 12, 3, 3];
const A3B = [15, 8, 8, 3, 15, 15, 3, 8, 15, 15, 15, 15, 15, 15, 15, 8, 15, 8, 15, 3, 15, 8, 15, 8, 3, 15, 6, 10, 15, 15, 10, 8,
  15, 3, 15, 10, 10, 8, 9, 10, 6, 15, 8, 15, 3, 6, 6, 8, 15, 3, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 3, 15, 15, 8];
const W2 = [0, 21, 43, 64], W3 = [0, 9, 18, 27, 37, 46, 55, 64], W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
const WEIGHTS = { 2: W2, 3: W3, 4: W4 };
// ns, partition bits, rotation bits, index-selection bit, color bits, alpha bits, endpoint pbits, shared pbits, index bits, index2 bits
const MODES = [[3, 4, 0, 0, 4, 0, 1, 0, 3, 0], [2, 6, 0, 0, 6, 0, 0, 1, 3, 0], [3, 6, 0, 0, 5, 0, 0, 0, 2, 0], [2, 6, 0, 0, 7, 0, 1, 0, 2, 0],
  [1, 0, 2, 1, 5, 6, 0, 0, 2, 3], [1, 0, 2, 0, 7, 8, 0, 0, 2, 2], [1, 0, 0, 0, 7, 7, 1, 0, 4, 0], [2, 6, 0, 0, 5, 5, 1, 0, 2, 0]];

function subsetOf(ns, part, i) {
  if (ns === 1) return 0;
  if (ns === 2) return (P2[part] >> i) & 1;
  return P3[part][i];
}
function isAnchor(ns, part, i) {
  if (i === 0) return true;
  if (ns === 2) return i === A2[part];
  if (ns === 3) return i === A3A[part] || i === A3B[part];
  return false;
}
const interp = (a, b, w) => (((64 - w) * a + w * b + 32) >> 6);

function bc7Block(src, s, px) {
  let bitPos = 0;
  const bit = n => {
    let v = 0;
    for (let i = 0; i < n; i++) { const p = bitPos + i; v |= ((src[s + (p >> 3)] >> (p & 7)) & 1) << i; }
    bitPos += n; return v;
  };
  let mode = 0;
  while (mode < 8 && !bit(1)) mode++;
  if (mode === 8) { px.fill(0); return; }
  const [ns, pb, rb, isb, cb, ab, epb, spb, ib, ib2] = MODES[mode];
  const part = bit(pb), rot = bit(rb), idxSel = bit(isb);
  const ep = []; // [subset][endpoint][channel]
  for (let si = 0; si < ns; si++) ep.push([[0, 0, 0, 255], [0, 0, 0, 255]]);
  for (let c = 0; c < 3; c++) for (let si = 0; si < ns; si++) for (let e = 0; e < 2; e++) ep[si][e][c] = bit(cb);
  if (ab) for (let si = 0; si < ns; si++) for (let e = 0; e < 2; e++) ep[si][e][3] = bit(ab);
  const pbits = [];
  if (epb) for (let si = 0; si < ns; si++) for (let e = 0; e < 2; e++) pbits.push(bit(1));
  if (spb) for (let si = 0; si < ns; si++) { const p = bit(1); pbits.push(p, p); }
  const hasP = epb || spb;
  for (let si = 0; si < ns; si++) for (let e = 0; e < 2; e++) {
    const p = hasP ? pbits[si * 2 + e] : 0;
    for (let c = 0; c < 4; c++) {
      const bits = c < 3 ? cb : ab;
      if (c === 3 && !ab) { ep[si][e][3] = 255; continue; }
      let v = ep[si][e][c], n = bits;
      if (hasP) { v = (v << 1) | p; n++; }
      v <<= 8 - n; v |= v >> n;
      ep[si][e][c] = v & 255;
    }
  }
  const idx = new Uint8Array(16), idx2 = new Uint8Array(16);
  for (let i = 0; i < 16; i++) idx[i] = bit(isAnchor(ns, part, i) ? ib - 1 : ib);
  if (ib2) for (let i = 0; i < 16; i++) idx2[i] = bit(i === 0 ? ib2 - 1 : ib2);
  for (let i = 0; i < 16; i++) {
    const e = ep[subsetOf(ns, part, i)];
    let cw, aw;
    if (ib2) {
      cw = idxSel ? WEIGHTS[ib2][idx2[i]] : WEIGHTS[ib][idx[i]];
      aw = idxSel ? WEIGHTS[ib][idx[i]] : WEIGHTS[ib2][idx2[i]];
    } else cw = aw = WEIGHTS[ib][idx[i]];
    const o = i * 4;
    px[o] = interp(e[0][0], e[1][0], cw); px[o + 1] = interp(e[0][1], e[1][1], cw); px[o + 2] = interp(e[0][2], e[1][2], cw);
    px[o + 3] = interp(e[0][3], e[1][3], aw);
    if (rot) { const t = px[o + 3]; px[o + 3] = px[o + rot - 1]; px[o + rot - 1] = t; }
  }
}

// Decodes one mip level into RGBA8.
function decode(format, src, w, h) {
  const out = new Uint8Array(w * h * 4);
  if (isBlock(format)) {
    const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2), bs = FORMATS[format].block;
    const px = new Uint8Array(64);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const s = (by * bw + bx) * bs;
      switch (format) {
        case 'DXT1': colorBlock(src, s, px, false); break;
        case 'DXT3':
          colorBlock(src, s + 8, px, true);
          for (let i = 0; i < 16; i++) { const a = (src[s + (i >> 1)] >> ((i & 1) * 4)) & 15; px[i * 4 + 3] = a * 17; }
          break;
        case 'DXT5': colorBlock(src, s + 8, px, true); alphaBlock8(src, s, px, 3); break;
        case 'ATI1': alphaBlock8(src, s, px, 0); for (let i = 0; i < 16; i++) { px[i * 4 + 1] = px[i * 4 + 2] = px[i * 4]; px[i * 4 + 3] = 255; } break;
        case 'ATI2': alphaBlock8(src, s, px, 0); alphaBlock8(src, s + 8, px, 1); for (let i = 0; i < 16; i++) { px[i * 4 + 2] = 0; px[i * 4 + 3] = 255; } break;
        case 'BC7': bc7Block(src, s, px); break;
      }
      for (let y = 0; y < 4; y++) {
        const py = by * 4 + y; if (py >= h) break;
        for (let x = 0; x < 4; x++) {
          const pxx = bx * 4 + x; if (pxx >= w) break;
          const o = (py * w + pxx) * 4, i = (y * 4 + x) * 4;
          out[o] = px[i]; out[o + 1] = px[i + 1]; out[o + 2] = px[i + 2]; out[o + 3] = px[i + 3];
        }
      }
    }
    return out;
  }
  for (let i = 0, n = w * h; i < n; i++) {
    const o = i * 4;
    switch (format) {
      case 'A8R8G8B8': out[o] = src[i * 4 + 2]; out[o + 1] = src[i * 4 + 1]; out[o + 2] = src[i * 4]; out[o + 3] = src[i * 4 + 3]; break;
      case 'X8R8G8B8': out[o] = src[i * 4 + 2]; out[o + 1] = src[i * 4 + 1]; out[o + 2] = src[i * 4]; out[o + 3] = 255; break;
      case 'A8B8G8R8': out[o] = src[i * 4]; out[o + 1] = src[i * 4 + 1]; out[o + 2] = src[i * 4 + 2]; out[o + 3] = src[i * 4 + 3]; break;
      case 'A1R5G5B5': {
        const c = src[i * 2] | (src[i * 2 + 1] << 8), r = (c >> 10) & 31, g = (c >> 5) & 31, b = c & 31;
        out[o] = (r << 3) | (r >> 2); out[o + 1] = (g << 3) | (g >> 2); out[o + 2] = (b << 3) | (b >> 2); out[o + 3] = c & 0x8000 ? 255 : 0; break;
      }
      case 'A8': out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = src[i]; break;
      case 'L8': out[o] = out[o + 1] = out[o + 2] = src[i]; out[o + 3] = 255; break;
    }
  }
  return out;
}

// ---------------- encode helpers ----------------
// Gathers a 4x4 block (edge pixels replicated) into a Float32Array(64).
function gather(rgba, w, h, bx, by, blk) {
  for (let y = 0; y < 4; y++) {
    const py = Math.min(h - 1, by * 4 + y);
    for (let x = 0; x < 4; x++) {
      const pxx = Math.min(w - 1, bx * 4 + x), o = (py * w + pxx) * 4, i = (y * 4 + x) * 4;
      blk[i] = rgba[o]; blk[i + 1] = rgba[o + 1]; blk[i + 2] = rgba[o + 2]; blk[i + 3] = rgba[o + 3];
    }
  }
}

// Principal axis of the selected channels (power iteration on the covariance).
function principal(blk, channels, mean, mask) {
  const n = channels.length, cov = new Float64Array(n * n);
  let count = 0;
  for (let i = 0; i < 16; i++) {
    if (mask && !mask[i]) continue;
    count++;
    for (let a = 0; a < n; a++) {
      const da = blk[i * 4 + channels[a]] - mean[a];
      for (let b = a; b < n; b++) cov[a * n + b] += da * (blk[i * 4 + channels[b]] - mean[b]);
    }
  }
  for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) cov[a * n + b] = cov[b * n + a];
  let v = new Float64Array(n).fill(1);
  // Start from the max-variance diagonal for faster convergence.
  let best = 0; for (let a = 1; a < n; a++) if (cov[a * n + a] > cov[best * n + best]) best = a;
  v.fill(0.25); v[best] = 1;
  for (let it = 0; it < 8; it++) {
    const nv = new Float64Array(n);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) nv[a] += cov[a * n + b] * v[b];
    const len = Math.hypot(...nv);
    if (len < 1e-9) break;
    for (let a = 0; a < n; a++) v[a] = nv[a] / len;
  }
  return { axis: v, count };
}
function endpointsAlongAxis(blk, channels, mask) {
  const n = channels.length, mean = new Float64Array(n);
  let count = 0;
  for (let i = 0; i < 16; i++) { if (mask && !mask[i]) continue; count++; for (let a = 0; a < n; a++) mean[a] += blk[i * 4 + channels[a]]; }
  if (!count) return null;
  for (let a = 0; a < n; a++) mean[a] /= count;
  const { axis } = principal(blk, channels, mean, mask);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 16; i++) {
    if (mask && !mask[i]) continue;
    let t = 0; for (let a = 0; a < n; a++) t += (blk[i * 4 + channels[a]] - mean[a]) * axis[a];
    if (t < lo) lo = t; if (t > hi) hi = t;
  }
  const e0 = new Float64Array(n), e1 = new Float64Array(n);
  for (let a = 0; a < n; a++) { e0[a] = Math.min(255, Math.max(0, mean[a] + axis[a] * lo)); e1[a] = Math.min(255, Math.max(0, mean[a] + axis[a] * hi)); }
  return [e0, e1];
}
// Least-squares endpoints for fixed weights (t in 0..1 per pixel).
function leastSquares(blk, channels, weights, mask) {
  let aa = 0, bb = 0, ab = 0;
  const n = channels.length, ax = new Float64Array(n), bx = new Float64Array(n);
  for (let i = 0; i < 16; i++) {
    if (mask && !mask[i]) continue;
    const t = weights[i], s = 1 - t;
    aa += s * s; bb += t * t; ab += s * t;
    for (let c = 0; c < n; c++) { const v = blk[i * 4 + channels[c]]; ax[c] += s * v; bx[c] += t * v; }
  }
  const det = aa * bb - ab * ab;
  if (Math.abs(det) < 1e-6) return null;
  const e0 = new Float64Array(n), e1 = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    e0[c] = Math.min(255, Math.max(0, (ax[c] * bb - bx[c] * ab) / det));
    e1[c] = Math.min(255, Math.max(0, (bx[c] * aa - ax[c] * ab) / det));
  }
  return [e0, e1];
}

// ---- BC1 color block ----
const to565 = (r, g, b) => ((Math.round(r * 31 / 255) << 11) | (Math.round(g * 63 / 255) << 5) | Math.round(b * 31 / 255));
function encodeColor(blk, out, o, allowTransparent) {
  const transparent = new Uint8Array(16); let anyT = false;
  if (allowTransparent) for (let i = 0; i < 16; i++) if (blk[i * 4 + 3] < 128) { transparent[i] = 1; anyT = true; }
  const mask = anyT ? transparent.map(t => 1 - t) : null;
  const ch = [0, 1, 2];
  let ends = endpointsAlongAxis(blk, ch, mask);
  if (!ends) { // fully transparent block
    out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; out[o + 4] = out[o + 5] = out[o + 6] = out[o + 7] = 0xff; return;
  }
  let best = null;
  const evaluate = (e0, e1) => {
    let c0 = to565(e0[0], e0[1], e0[2]), c1 = to565(e1[0], e1[1], e1[2]);
    const four = !anyT;
    if (four ? c0 < c1 : c0 > c1) { const t = c0; c0 = c1; c1 = t; }
    if (four && c0 === c1) { /* single color: all indices 0 */ }
    const pal = new Uint8Array(16); rgb565(c0, pal, 0); rgb565(c1, pal, 4);
    let colors;
    if (four && c0 !== c1) {
      for (let k = 0; k < 3; k++) { pal[8 + k] = ((2 * pal[k] + pal[4 + k]) / 3) | 0; pal[12 + k] = ((pal[k] + 2 * pal[4 + k]) / 3) | 0; }
      colors = 4;
    } else { for (let k = 0; k < 3; k++) pal[8 + k] = (pal[k] + pal[4 + k]) >> 1; colors = four ? 1 : 3; }
    let bits = 0, err = 0; const tw = new Float64Array(16);
    const T = [0, 1, 1 / 3, 2 / 3];
    for (let i = 0; i < 16; i++) {
      let idx = 0;
      if (anyT && transparent[i]) { idx = 3; }
      else {
        let bd = Infinity;
        for (let k = 0; k < colors; k++) {
          const dr = blk[i * 4] - pal[k * 4], dg = blk[i * 4 + 1] - pal[k * 4 + 1], db = blk[i * 4 + 2] - pal[k * 4 + 2];
          const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; idx = k; }
        }
        err += bd;
      }
      tw[i] = colors === 4 ? T[idx] : idx === 1 ? 1 : idx === 2 ? 0.5 : 0;
      bits |= idx << (i * 2);
    }
    if (!best || err < best.err) best = { err, c0, c1, bits: bits >>> 0, tw };
  };
  evaluate(ends[0], ends[1]);
  for (let it = 0; it < 2; it++) {
    const ls = leastSquares(blk, ch, best.tw, mask);
    if (!ls) break;
    const before = best.err; evaluate(ls[0], ls[1]); if (best.err >= before) break;
  }
  out[o] = best.c0 & 255; out[o + 1] = best.c0 >> 8; out[o + 2] = best.c1 & 255; out[o + 3] = best.c1 >> 8;
  out[o + 4] = best.bits & 255; out[o + 5] = (best.bits >>> 8) & 255; out[o + 6] = (best.bits >>> 16) & 255; out[o + 7] = (best.bits >>> 24) & 255;
}

// ---- BC3 alpha / BC4 channel block (8-value mode) ----
function encodeChannel(blk, channel, out, o) {
  let lo = 255, hi = 0;
  for (let i = 0; i < 16; i++) { const v = blk[i * 4 + channel]; if (v < lo) lo = v; if (v > hi) hi = v; }
  lo = Math.round(lo); hi = Math.round(hi);
  out[o] = hi; out[o + 1] = lo;
  const pal = [hi, lo];
  if (hi > lo) for (let i = 1; i < 7; i++) pal.push((((7 - i) * hi + i * lo) / 7) | 0);
  else for (let i = 0; i < 6; i++) pal.push(hi); // a0 <= a1 mode never chosen when equal: all index 0
  let lo24 = 0, hi24 = 0;
  for (let i = 0; i < 16; i++) {
    const v = blk[i * 4 + channel]; let idx = 0, bd = Infinity;
    if (hi > lo) for (let k = 0; k < 8; k++) { const d = Math.abs(v - pal[k]); if (d < bd) { bd = d; idx = k; } }
    if (i < 8) lo24 |= idx << (3 * i); else hi24 |= idx << (3 * (i - 8));
  }
  out[o + 2] = lo24 & 255; out[o + 3] = (lo24 >>> 8) & 255; out[o + 4] = (lo24 >>> 16) & 255;
  out[o + 5] = hi24 & 255; out[o + 6] = (hi24 >>> 8) & 255; out[o + 7] = (hi24 >>> 16) & 255;
}

// ---- BC7 mode 6: one subset, RGBA 7-bit endpoints + p-bit, 4-bit indices ----
function encodeBc7Mode6(blk, out, o) {
  const ch = [0, 1, 2, 3];
  // Opaque blocks must stay exactly 255: weigh alpha error so the p-bit favours it.
  let opaque = true; for (let i = 0; i < 16; i++) if (blk[i * 4 + 3] !== 255) { opaque = false; break; }
  const aw = opaque ? 16 : 1;
  let ends = endpointsAlongAxis(blk, ch, null);
  let best = null;
  const tryEnds = (e0, e1) => {
    for (let p0 = 0; p0 < 2; p0++) for (let p1 = 0; p1 < 2; p1++) {
      const q0 = new Int32Array(4), q1 = new Int32Array(4), v0 = new Int32Array(4), v1 = new Int32Array(4);
      for (let c = 0; c < 4; c++) {
        q0[c] = Math.min(127, Math.max(0, Math.round((e0[c] - p0) / 2)));
        q1[c] = Math.min(127, Math.max(0, Math.round((e1[c] - p1) / 2)));
        v0[c] = (q0[c] << 1) | p0; v0[c] = (v0[c] << 0) | 0; // 8-bit already (7 bits + pbit)
        v1[c] = (q1[c] << 1) | p1;
      }
      const pal = new Int32Array(64);
      for (let k = 0; k < 16; k++) for (let c = 0; c < 4; c++) pal[k * 4 + c] = interp(v0[c], v1[c], W4[k]);
      const idx = new Uint8Array(16); let err = 0;
      for (let i = 0; i < 16; i++) {
        let bd = Infinity, bi = 0;
        for (let k = 0; k < 16; k++) {
          const dr = blk[i * 4] - pal[k * 4], dg = blk[i * 4 + 1] - pal[k * 4 + 1], db = blk[i * 4 + 2] - pal[k * 4 + 2], da = blk[i * 4 + 3] - pal[k * 4 + 3];
          const d = dr * dr + dg * dg + db * db + aw * da * da; if (d < bd) { bd = d; bi = k; }
        }
        idx[i] = bi; err += bd;
      }
      if (!best || err < best.err) best = { err, q0, q1, p0, p1, idx };
    }
  };
  tryEnds(ends[0], ends[1]);
  for (let it = 0; it < 2; it++) {
    const tw = new Float64Array(16); for (let i = 0; i < 16; i++) tw[i] = W4[best.idx[i]] / 64;
    const ls = leastSquares(blk, ch, tw, null);
    if (!ls) break;
    const before = best.err; tryEnds(ls[0], ls[1]); if (best.err >= before) break;
  }
  let { q0, q1, p0, p1, idx } = best;
  if (idx[0] >= 8) { // anchor index must fit in 3 bits: swap endpoints and invert
    [q0, q1] = [q1, q0]; [p0, p1] = [p1, p0]; idx = idx.map(v => 15 - v);
  }
  // Bit stream, LSB first.
  const bytes = new Uint8Array(16); let pos = 0;
  const put = (v, n) => { for (let i = 0; i < n; i++, pos++) if ((v >> i) & 1) bytes[pos >> 3] |= 1 << (pos & 7); };
  put(1 << 6, 7);
  for (let c = 0; c < 4; c++) { put(q0[c], 7); put(q1[c], 7); }
  put(p0, 1); put(p1, 1);
  for (let i = 0; i < 16; i++) put(idx[i], i === 0 ? 3 : 4);
  out.set(bytes, o);
}

// Encodes one mip level from RGBA8. Calls onBlockRow(by, bh) so callers can report progress.
function encode(format, rgba, w, h) {
  const f = FORMATS[format];
  if (!f) throw new EngineError(`Formato de saída não suportado: ${format}`);
  if (!f.block) {
    const out = new Uint8Array(w * h * f.bpp);
    for (let i = 0, n = w * h; i < n; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
      switch (format) {
        case 'A8R8G8B8': out[i * 4] = b; out[i * 4 + 1] = g; out[i * 4 + 2] = r; out[i * 4 + 3] = a; break;
        case 'X8R8G8B8': out[i * 4] = b; out[i * 4 + 1] = g; out[i * 4 + 2] = r; out[i * 4 + 3] = 255; break;
        case 'A8B8G8R8': out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a; break;
        case 'A1R5G5B5': { const c = (a >= 128 ? 0x8000 : 0) | ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3); out[i * 2] = c & 255; out[i * 2 + 1] = c >> 8; break; }
        case 'A8': out[i] = a; break;
        case 'L8': out[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b); break;
      }
    }
    return out;
  }
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2), out = new Uint8Array(bw * bh * f.block);
  const blk = new Float32Array(64);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    gather(rgba, w, h, bx, by, blk);
    const o = (by * bw + bx) * f.block;
    switch (format) {
      case 'DXT1': encodeColor(blk, out, o, true); break;
      case 'DXT3': {
        for (let i = 0; i < 16; i += 2) out[o + (i >> 1)] = (Math.round(blk[i * 4 + 3] / 17)) | (Math.round(blk[(i + 1) * 4 + 3] / 17) << 4);
        encodeColor(blk, out, o + 8, false); break;
      }
      case 'DXT5': encodeChannel(blk, 3, out, o); encodeColor(blk, out, o + 8, false); break;
      case 'ATI1': encodeChannel(blk, 0, out, o); break;
      case 'ATI2': encodeChannel(blk, 0, out, o); encodeChannel(blk, 1, out, o + 8); break;
      case 'BC7': encodeBc7Mode6(blk, out, o); break;
    }
  }
  return out;
}

// Next mip level by 2x2 box filter (odd edges replicate).
function downsample(rgba, w, h) {
  const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1), y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
    const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4, o = (y * nw + x) * 4;
    for (let k = 0; k < 4; k++) out[o + k] = (rgba[a + k] + rgba[b + k] + rgba[c + k] + rgba[d + k] + 2) >> 2;
  }
  return { rgba: out, w: nw, h: nh };
}

module.exports = { FORMATS, formatName, isBlock, levelSize, dataSize, strideOf, gtaLevels, decode, encode, downsample };
