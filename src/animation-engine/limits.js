// Budgets for untrusted input. These are engine safety limits, not game limits and
// not product/plan limits: the platform may pass tighter values, never looser ones
// than MAX_LIMITS.
export const DEFAULT_LIMITS = Object.freeze({
  maxInputBytes: 4 * 1024 * 1024,     // compressed RSC7 file
  maxRegionBytes: 8 * 1024 * 1024,    // one decoded region (system or graphics)
  maxPages: 128,                      // pages per region
  maxClips: 256,
  maxAnimations: 256,
  maxSequenceBlocks: 64,              // Sequence blocks per animation
  maxTracks: 1024,                    // BoneIds entries per animation
  maxChannelsPerBlock: 4096,
  maxFrames: 8192,                    // per animation (read); writer profile caps lower
  maxSamples: 8 * 1024 * 1024,        // decoded floats per animation (frames * components)
  maxFrameBits: 65535,                // bits per frame in one Sequence block (u16 bit offsets)
  maxOutputBytes: 4 * 1024 * 1024,
  maxNameLength: 255,
});

export const MAX_LIMITS = DEFAULT_LIMITS;

/** Merge caller limits, refusing anything above the engine maximum. */
export function resolveLimits(overrides) {
  if (overrides === undefined || overrides === null) return DEFAULT_LIMITS;
  if (typeof overrides !== 'object') throw new TypeError('limits must be an object');
  const out = {...DEFAULT_LIMITS};
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in DEFAULT_LIMITS)) throw new TypeError(`Unknown limit ${key}`);
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIMITS[key]) throw new RangeError(`Invalid limit ${key}`);
    out[key] = value;
  }
  return Object.freeze(out);
}
