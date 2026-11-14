'use strict';
// RPForge texture engine — RSC7 resource container (GTA V Legacy).
// Header: 'RSC7', version, system flags, graphics flags, then one raw DEFLATE stream
// holding the system pages followed by the graphics pages.
const { EngineError, ensure, u32, w32 } = require('./binary');
const { inflateRaw } = require('./inflate');
const { deflateRaw } = require('./deflate');

const MAGIC = 0x37435352;
// [bit offset, bit width] of the page-count field for sizes base<<8 ... base<<0 (base = 512 << (flags & 15)).
const PAGE_FIELDS = [[4, 1], [5, 2], [7, 4], [11, 6], [17, 7], [24, 1], [25, 1], [26, 1], [27, 1]];
const MAX_REGION = 512 * 1024 * 1024;

function pageSizes(flags) {
  const base = 512 * 2 ** (flags & 15), pages = [];
  PAGE_FIELDS.forEach(([shift, width], i) => {
    const count = (flags >>> shift) & ((1 << width) - 1), size = base * 2 ** (8 - i);
    for (let n = 0; n < count; n++) pages.push(size);
  });
  return pages;
}
const regionSize = flags => pageSizes(flags).reduce((a, b) => a + b, 0);

function header(bytes) {
  ensure(bytes && bytes.length >= 16, 'Arquivo vazio ou truncado.');
  const magic = u32(bytes, 0);
  ensure(magic === MAGIC, 'Este arquivo não é um recurso RSC7 do GTA V.', 'not-rsc7');
  return { version: u32(bytes, 4), systemFlags: u32(bytes, 8), graphicsFlags: u32(bytes, 12) };
}

function decode(bytes) {
  const h = header(bytes);
  const systemSize = regionSize(h.systemFlags), graphicsSize = regionSize(h.graphicsFlags);
  ensure(systemSize > 0 && systemSize + graphicsSize <= MAX_REGION, 'Tamanho de recurso não suportado.');
  const raw = inflateRaw(bytes.subarray(16), systemSize + graphicsSize);
  return {
    version: h.version, systemFlags: h.systemFlags, graphicsFlags: h.graphicsFlags, raw,
    system: raw.subarray(0, systemSize),
    graphics: raw.subarray(systemSize),
    systemPages: pageSizes(h.systemFlags).length,
    graphicsPages: pageSizes(h.graphicsFlags).length,
  };
}

// ---------------- writer ----------------
// Blocks are packed into equally sized pages (first-fit decreasing). A block never
// crosses a page boundary; the first system block (the file root) sits at offset 0.
const PAGE_COUNT_FIELD = 4, PAGE_COUNT_MAX = 127; // pages of size base << 4

function packRegion(blocks) {
  if (!blocks.length) return { size: 0, flags: 0, pages: 0 };
  const largest = blocks.reduce((m, b) => Math.max(m, b.size), 0);
  let page = 0x2000;
  while (page < largest) page *= 2;
  for (;;) {
    ensure(page <= (0x200 << 15) << PAGE_COUNT_FIELD, 'Recurso grande demais para o formato RSC7.');
    const free = []; // remaining cursor per page
    const place = b => {
      for (let p = 0; p < free.length; p++) {
        const at = (free[p] + b.align - 1) & ~(b.align - 1);
        if (at + b.size <= page) { free[p] = at + b.size; return p * page + at; }
      }
      free.push(b.size);
      return (free.length - 1) * page;
    };
    const [root, ...rest] = blocks;
    root.offset = place(root);
    rest.slice().sort((a, b) => b.size - a.size).forEach(b => { b.offset = place(b); });
    if (free.length <= PAGE_COUNT_MAX) {
      const base = page >>> PAGE_COUNT_FIELD;
      let shift = 0; while ((0x200 << shift) < base) shift++;
      return { size: free.length * page, flags: (shift | (free.length << 17)) >>> 0, pages: free.length };
    }
    page *= 2;
  }
}

class ResourceBuilder {
  constructor(version) { this.version = version; this.blocks = { system: [], graphics: [] }; }
  // Returns a handle whose .offset is set by layout(); fill() runs after layout.
  add(region, size, fill, align = 16) {
    ensure(size > 0 && size <= MAX_REGION, 'Bloco de recurso inválido.');
    const block = { region, size, align, fill, offset: null };
    this.blocks[region].push(block);
    return block;
  }
  build(options = {}) {
    const s = packRegion(this.blocks.system), g = packRegion(this.blocks.graphics);
    this.systemPages = s.pages; this.graphicsPages = g.pages;
    const raw = new Uint8Array(s.size + g.size);
    const regions = { system: raw.subarray(0, s.size), graphics: raw.subarray(s.size) };
    for (const region of ['system', 'graphics']) for (const b of this.blocks[region]) b.fill(regions[region], b.offset, this);
    const body = deflateRaw(raw, options);
    const out = new Uint8Array(16 + body.length);
    w32(out, 0, MAGIC); w32(out, 4, this.version);
    w32(out, 8, (s.flags | ((this.version >>> 4) << 28)) >>> 0);
    w32(out, 12, (g.flags | ((this.version & 15) << 28)) >>> 0);
    out.set(body, 16);
    return out;
  }
}

// Re-compresses an edited decoded resource keeping its exact page layout (in-place edits only).
function reencode(res, options = {}) {
  const body = deflateRaw(res.raw, options);
  const out = new Uint8Array(16 + body.length);
  w32(out, 0, MAGIC); w32(out, 4, res.version); w32(out, 8, res.systemFlags); w32(out, 12, res.graphicsFlags);
  out.set(body, 16);
  return out;
}

module.exports = { reencode, MAGIC, header, decode, pageSizes, regionSize, ResourceBuilder, packRegion, EngineError };
