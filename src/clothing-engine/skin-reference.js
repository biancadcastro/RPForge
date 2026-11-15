// Skin recognition shared by Neon (refuse garments with skin) and Separar pele (classify faces).
// The reference (skin-triangles.json: {male: [sha256...], female: [sha256...]}) holds only
// fingerprints of the freemode body triangles, never their geometry. A triangle's fingerprint is
// the SHA-256 of its three positions rounded to 1e-4, sorted as text: the same rule as the
// desktop engine (scripts/clothing/ClothingSkin.cs), so the reference file is shared.
import {sha256} from './sha256.js';
import {SKIN_SHADER_FILES} from './ydd-read.js';

const round = v => { const r = Math.floor(v * 10000 + 0.5); return String(Object.is(r, -0) ? 0 : r); };
export const pointKey = (p, i) => `${round(p[i * 3])},${round(p[i * 3 + 1])},${round(p[i * 3 + 2])}`;

export function triangleFingerprint(positions, a, b, c) {
  const pts = [pointKey(positions, a), pointKey(positions, b), pointKey(positions, c)].sort();
  return sha256(pts.join(';'));
}

/** Gender of a freemode file name (mp_f_ = female, anything else male, like the desktop engine). */
export const genderOf = fileName => (/^mp_f_/i.test(fileName) ? 'female' : 'male');

/** Set of fingerprints for one gender from the parsed reference JSON. */
export function referenceSet(reference, gender) {
  const list = reference?.[gender];
  if (!Array.isArray(list) || !list.length) throw new Error('Referência de pele indisponível.');
  return new Set(list);
}

export const isSkinShader = shader => SKIN_SHADER_FILES.includes(shader.fileHash >>> 0);
