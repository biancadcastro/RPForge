'use strict';
// RPForge texture engine — PNG decoder (8-bit grey/RGB/palette/grey+alpha/RGBA, 16-bit reduced,
// non-interlaced and Adam7). Used for OBJ textures in the 3D preview. Own implementation.
const { EngineError, ensure, u32 } = require('./binary');
const { inflateRaw } = require('./inflate');

function be32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }

function decodePng(bytes) {
  ensure(bytes && bytes.length > 33 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71, 'Invalid PNG image.');
  let o = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (o + 8 <= bytes.length) {
    const len = be32(bytes, o), name = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]), d = bytes.subarray(o + 8, o + 8 + len);
    if (name === 'IHDR') { width = be32(d, 0); height = be32(d, 4); depth = d[8]; type = d[9]; interlace = d[12]; }
    else if (name === 'PLTE') palette = d;
    else if (name === 'tRNS') trns = d;
    else if (name === 'IDAT') idat.push(d);
    else if (name === 'IEND') break;
    o += 12 + len;
  }
  ensure(width > 0 && height > 0 && width <= 16384 && height <= 16384, 'Unsupported PNG dimensions.');
  ensure(depth === 8 || depth === 16 || (type === 3 && depth <= 8) || (type === 0 && depth < 8), 'Unsupported PNG bit depth.');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  ensure(channels, 'Unsupported PNG type.');
  const total = idat.reduce((n, c) => n + c.length, 0), z = new Uint8Array(total);
  let p = 0; for (const c of idat) { z.set(c, p); p += c.length; }
  const raw = inflateRaw(z.subarray(2)); // skip zlib header
  const bitsPerPixel = channels * depth, bpp = Math.max(1, bitsPerPixel >> 3);
  const out = new Uint8Array(width * height * 4);
  let pos = 0;
  const pass = (x0, y0, dx, dy) => {
    const pw = Math.ceil((width - x0) / dx), ph = Math.ceil((height - y0) / dy);
    if (pw <= 0 || ph <= 0) return;
    const stride = Math.ceil(pw * bitsPerPixel / 8);
    let prev = new Uint8Array(stride);
    for (let y = 0; y < ph; y++) {
      const filter = raw[pos], line = raw.slice(pos + 1, pos + 1 + stride); pos += 1 + stride;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        let v = 0;
        if (filter === 1) v = a; else if (filter === 2) v = b; else if (filter === 3) v = (a + b) >> 1;
        else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        line[i] = (line[i] + v) & 255;
      }
      for (let x = 0; x < pw; x++) {
        const t = ((y0 + y * dy) * width + x0 + x * dx) * 4;
        const sample = k => {
          if (depth === 16) return line[(x * channels + k) * 2];
          if (depth === 8) return line[x * channels + k];
          const bit = x * depth, v = (line[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
          return type === 3 ? v : Math.round(v * 255 / ((1 << depth) - 1));
        };
        if (type === 3) {
          const i = sample(0);
          out[t] = palette ? palette[i * 3] : 0; out[t + 1] = palette ? palette[i * 3 + 1] : 0; out[t + 2] = palette ? palette[i * 3 + 2] : 0;
          out[t + 3] = trns && i < trns.length ? trns[i] : 255;
        } else if (channels <= 2) {
          const g = sample(0); out[t] = out[t + 1] = out[t + 2] = g; out[t + 3] = channels === 2 ? sample(1) : 255;
        } else { out[t] = sample(0); out[t + 1] = sample(1); out[t + 2] = sample(2); out[t + 3] = channels === 4 ? sample(3) : 255; }
      }
      prev = line;
    }
  };
  if (interlace) for (const [x0, y0, dx, dy] of [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]) pass(x0, y0, dx, dy);
  else pass(0, 0, 1, 1);
  return { rgba: out, width, height };
}

module.exports = { decodePng };
void u32; void EngineError;
