'use strict';
// RPForge texture engine — image decoders for OBJ textures: JPEG (baseline and extended
// sequential, any chroma subsampling, restart markers) and TGA (true-colour/greyscale,
// raw or RLE). PNG lives in png.js. Own implementations.
const { EngineError, ensure } = require('./binary');
const { decodePng } = require('./png');

// ---------------- JPEG ----------------
const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];

function buildHuffman(counts, symbols) {
  // lookup: code length -> { code -> symbol }
  const maps = []; let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    const m = new Map();
    for (let i = 0; i < counts[len - 1]; i++) m.set(code++, symbols[k++]);
    maps[len] = m; code <<= 1;
  }
  return maps;
}

// Separable float IDCT (8x8), output clamped 0..255 with level shift.
const COS = new Float64Array(64);
for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) COS[x * 8 + u] = (u === 0 ? Math.SQRT1_2 : 1) * Math.cos((2 * x + 1) * u * Math.PI / 16) / 2;
function idct(block, out) {
  const tmp = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) {
    let s = 0; for (let v = 0; v < 8; v++) s += COS[y * 8 + v] * block[v * 8 + u]; tmp[y * 8 + u] = s;
  }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let s = 0; for (let u = 0; u < 8; u++) s += COS[x * 8 + u] * tmp[y * 8 + u];
    const v = Math.round(s + 128); out[y * 8 + x] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
}

function decodeJpeg(bytes) {
  ensure(bytes[0] === 0xff && bytes[1] === 0xd8, 'Invalid JPEG image.');
  const qt = [], dcT = [], acT = [];
  let frame = null, restart = 0, pos = 2, adobe = null;
  const u16be = o => (bytes[o] << 8) | bytes[o + 1];
  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) { pos++; continue; }
    const marker = bytes[pos + 1]; pos += 2;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { if (marker === 0xff) pos--; continue; }
    if (marker === 0xd9) break;
    const len = u16be(pos), seg = pos + 2, end = pos + len;
    if (marker === 0xdb) {
      for (let p = seg; p < end;) { const pq = bytes[p] >> 4, tq = bytes[p] & 15; p++; const t = new Int32Array(64); for (let i = 0; i < 64; i++) { t[ZIGZAG[i]] = pq ? u16be(p + i * 2) : bytes[p + i]; } p += pq ? 128 : 64; qt[tq] = t; }
    } else if (marker === 0xc4) {
      for (let p = seg; p < end;) {
        const tc = bytes[p] >> 4, th = bytes[p] & 15, counts = bytes.subarray(p + 1, p + 17); let total = 0; for (const c of counts) total += c;
        const table = buildHuffman(counts, bytes.subarray(p + 17, p + 17 + total)); (tc ? acT : dcT)[th] = table; p += 17 + total;
      }
    } else if (marker === 0xc0 || marker === 0xc1) {
      const comps = [];
      for (let i = 0; i < bytes[seg + 5]; i++) { const o = seg + 6 + i * 3; comps.push({ id: bytes[o], h: bytes[o + 1] >> 4, v: bytes[o + 1] & 15, tq: bytes[o + 2] }); }
      frame = { height: u16be(seg + 1), width: u16be(seg + 3), comps };
    } else if (marker === 0xc2 || marker === 0xc3 || (marker >= 0xc5 && marker <= 0xcf && marker !== 0xc8 && marker !== 0xcc)) {
      throw new EngineError('Progressive or lossless JPEG is not supported in the preview yet. Save as a baseline JPEG or PNG.', 'jpeg');
    } else if (marker === 0xdd) restart = u16be(seg);
    else if (marker === 0xee && String.fromCharCode(...bytes.subarray(seg, seg + 5)) === 'Adobe') adobe = bytes[seg + 11];
    else if (marker === 0xda) {
      ensure(frame, 'JPEG without a frame header.');
      const n = bytes[seg], scomps = [];
      for (let i = 0; i < n; i++) { const c = frame.comps.find(x => x.id === bytes[seg + 1 + i * 2]); c.dc = dcT[bytes[seg + 2 + i * 2] >> 4]; c.ac = acT[bytes[seg + 2 + i * 2] & 15]; scomps.push(c); }
      pos = decodeScan(bytes, end, frame, scomps, qt, restart);
      continue;
    }
    pos = end;
  }
  ensure(frame && frame.comps[0].pixels, 'JPEG without image data.');
  return toRgba(frame, adobe);
}

function decodeScan(bytes, start, frame, comps, qt, restart) {
  const hmax = Math.max(...frame.comps.map(c => c.h)), vmax = Math.max(...frame.comps.map(c => c.v));
  const mcusX = Math.ceil(frame.width / (8 * hmax)), mcusY = Math.ceil(frame.height / (8 * vmax));
  for (const c of comps) {
    c.bw = mcusX * c.h; c.bh = mcusY * c.v; c.pixels = new Uint8Array(c.bw * 8 * c.bh * 8); c.pred = 0;
  }
  let pos = start, bitBuf = 0, bitCnt = 0;
  const bit = () => {
    if (bitCnt === 0) {
      if (pos >= bytes.length) return 0;
      let b = bytes[pos++];
      if (b === 0xff) { const nx = bytes[pos]; if (nx === 0) pos++; else if (nx >= 0xd0 && nx <= 0xd7) { b = 0; } else { b = 0; pos--; } }
      bitBuf = b; bitCnt = 8;
    }
    bitCnt--; return (bitBuf >> bitCnt) & 1;
  };
  const receive = n => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(); return v; };
  const extend = (v, n) => (n && v < 1 << (n - 1) ? v - (1 << n) + 1 : v);
  const decodeHuff = t => { let code = 0; for (let len = 1; len <= 16; len++) { code = (code << 1) | bit(); const s = t[len].get(code); if (s !== undefined) return s; } return 0; };
  const block = new Float64Array(64), px = new Uint8Array(64);
  const decodeBlock = (c, bx, by) => {
    block.fill(0);
    const q = qt[c.tq], s = decodeHuff(c.dc);
    c.pred += s ? extend(receive(s), s) : 0;
    block[0] = c.pred * q[0];
    for (let k = 1; k < 64;) {
      const rs = decodeHuff(c.ac), r = rs >> 4, sz = rs & 15;
      if (!sz) { if (r === 15) { k += 16; continue; } break; }
      k += r; if (k > 63) break;
      block[ZIGZAG[k]] = extend(receive(sz), sz) * q[ZIGZAG[k]]; k++;
    }
    idct(block, px);
    const stride = c.bw * 8;
    for (let y = 0; y < 8; y++) c.pixels.set(px.subarray(y * 8, y * 8 + 8), (by * 8 + y) * stride + bx * 8);
  };
  const resync = () => {
    bitCnt = 0;
    while (pos + 1 < bytes.length && !(bytes[pos] === 0xff && bytes[pos + 1] >= 0xd0 && bytes[pos + 1] <= 0xd7)) pos++;
    if (pos + 1 < bytes.length) pos += 2;
    for (const c of comps) c.pred = 0;
  };
  const single = comps.length === 1;
  if (single) { // non-interleaved: blocks in raster order over the component's own size
    const c = comps[0], bw = Math.ceil(Math.ceil(frame.width * c.h / hmax) / 8), bh = Math.ceil(Math.ceil(frame.height * c.v / vmax) / 8);
    let n = 0;
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { if (restart && n && n % restart === 0) resync(); decodeBlock(c, bx, by); n++; }
  } else {
    let n = 0;
    for (let my = 0; my < mcusY; my++) for (let mx = 0; mx < mcusX; mx++) {
      if (restart && n && n % restart === 0) resync();
      for (const c of comps) for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) decodeBlock(c, mx * c.h + h, my * c.v + v);
      n++;
    }
  }
  // skip to the next marker
  while (pos + 1 < bytes.length && !(bytes[pos] === 0xff && bytes[pos + 1] !== 0 && !(bytes[pos + 1] >= 0xd0 && bytes[pos + 1] <= 0xd7))) pos++;
  return pos;
}

function toRgba(frame, adobe) {
  const { width: w, height: h, comps } = frame;
  const hmax = Math.max(...comps.map(c => c.h)), vmax = Math.max(...comps.map(c => c.v));
  const out = new Uint8Array(w * h * 4);
  const at = (c, x, y) => c.pixels[Math.floor(y * c.v / vmax) * c.bw * 8 + Math.floor(x * c.h / hmax)];
  const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (comps.length === 1) { const g = at(comps[0], x, y); out[o] = out[o + 1] = out[o + 2] = g; }
    else if (comps.length >= 3) {
      const Y = at(comps[0], x, y), cb = at(comps[1], x, y) - 128, cr = at(comps[2], x, y) - 128;
      if (adobe === 0 && comps.length === 3) { out[o] = Y; out[o + 1] = cb + 128; out[o + 2] = cr + 128; }
      else { out[o] = clamp(Y + 1.402 * cr); out[o + 1] = clamp(Y - 0.344136 * cb - 0.714136 * cr); out[o + 2] = clamp(Y + 1.772 * cb); }
    }
    out[o + 3] = 255;
  }
  return { rgba: out, width: w, height: h };
}

// ---------------- TGA ----------------
function decodeTga(bytes) {
  ensure(bytes.length > 18, 'Invalid TGA image.');
  const idLen = bytes[0], cmapType = bytes[1], type = bytes[2];
  const w = bytes[12] | (bytes[13] << 8), h = bytes[14] | (bytes[15] << 8), bpp = bytes[16], desc = bytes[17];
  ensure(cmapType === 0 && [2, 3, 10, 11].includes(type) && w && h, 'Unsupported TGA type (use 24/32-bit or grayscale).');
  const ch = bpp >> 3; ensure([1, 3, 4].includes(ch), 'Unsupported TGA bit depth.');
  let p = 18 + idLen;
  const px = new Uint8Array(w * h * ch);
  if (type === 2 || type === 3) px.set(bytes.subarray(p, p + px.length));
  else for (let i = 0; i < px.length;) {
    const head = bytes[p++], count = (head & 127) + 1;
    if (head & 128) { const v = bytes.subarray(p, p + ch); p += ch; for (let k = 0; k < count && i < px.length; k++, i += ch) px.set(v, i); }
    else { const n = count * ch; px.set(bytes.subarray(p, p + n), i); p += n; i += n; }
  }
  const out = new Uint8Array(w * h * 4), top = (desc & 0x20) !== 0, right = (desc & 0x10) !== 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sy = top ? y : h - 1 - y, sx = right ? w - 1 - x : x, s = (sy * w + sx) * ch, o = (y * w + x) * 4;
    if (ch === 1) { out[o] = out[o + 1] = out[o + 2] = px[s]; out[o + 3] = 255; }
    else { out[o] = px[s + 2]; out[o + 1] = px[s + 1]; out[o + 2] = px[s]; out[o + 3] = ch === 4 ? px[s + 3] : 255; }
  }
  return { rgba: out, width: w, height: h };
}

// Decodes by content (falls back to the extension for TGA, which has no magic number).
function decodeImage(bytes, extension = '') {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return decodePng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return decodeJpeg(bytes);
  if (/tga$/i.test(extension)) return decodeTga(bytes);
  throw new EngineError('Unsupported image format (use PNG, JPG or TGA).', 'image');
}

module.exports = { decodeImage, decodeJpeg, decodeTga };
