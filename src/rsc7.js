// Shared RSC7 envelope primitives (GTA V Legacy resources). Pure: no filesystem, no native code.
export const RSC7_MAGIC = 0x37435352; // bytes 52 53 43 37 ('RSC7') little-endian

// RSC7 page-count fields: [bit offset, bit width] for size classes base<<8 ... base<<0, base = 512 << (flags & 15).
const PAGE_FIELDS = [[4, 1], [5, 2], [7, 4], [11, 6], [17, 7], [24, 1], [25, 1], [26, 1], [27, 1]];

/** Page sizes declared by one region's flags, largest first, as laid out in the decompressed stream. */
export function rsc7PageSizes(flags) {
  const base = 512 * 2 ** (flags & 15), pages = [];
  PAGE_FIELDS.forEach(([shift, width], i) => {
    const count = (flags >>> shift) & ((1 << width) - 1), size = base * 2 ** (8 - i);
    for (let n = 0; n < count; n++) pages.push(size);
  });
  return pages;
}
export function rsc7RegionSize(flags) { return rsc7PageSizes(flags).reduce((sum, size) => sum + size, 0); }

/** Exact header check. Never compare the magic through a lossy text decoder ('ascii' drops the high bit). */
export function isRsc7(bytes, version) {
  return bytes.length >= 16 && bytes.readUInt32LE(0) === RSC7_MAGIC && bytes.readUInt32LE(4) === version;
}
/** Decompressed size declared by the header (system + graphics pages). */
export function rsc7DeclaredSize(bytes) {
  return rsc7RegionSize(bytes.readUInt32LE(8)) + rsc7RegionSize(bytes.readUInt32LE(12));
}
