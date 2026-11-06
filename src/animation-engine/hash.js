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
 * Bone tag derived from a bone name (ELF-style hash of the upper-case name,
 * folded into 16 bits). Used only to cross-check tags declared by a reference
 * skeleton; tags in files are authoritative and are never recomputed silently.
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
