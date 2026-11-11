// Name hashes used by YCD clip dictionaries and skeleton bone tags.

/** Jenkins one-at-a-time over lower-case latin1 bytes (clip/animation map keys). */
export function joaat(name) {
  let h = 0;
  const s = name.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (h + (s.charCodeAt(i) & 0xff)) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  return (h + (h << 15)) >>> 0;
}

/**
 * ELF-style hash of the upper-case name folded into 16 bits. It reproduces only 30 of
 * the 128 tags of the freemode reference skeletons (the main bones carry fixed tags),
 * so it is NOT a name->tag derivation: the engine uses it only to make tags for
 * synthetic test data and as an informational cross-check. Real tags always come
 * from the file or from a reference skeleton.
 */
export function boneTagFromName(name) {
  let h = 0;
  const s = name.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    h = ((h << 4) + (s.charCodeAt(i) & 0xff)) >>> 0;
    const x = (h & 0xf0000000) >>> 0;
    if (x !== 0) h = (h ^ (x >>> 24)) >>> 0;
    h = (h & ~x) >>> 0;
  }
  return (h % 0xfe8f) + 0x170;
}
