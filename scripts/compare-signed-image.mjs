import { readFile } from 'node:fs/promises';
import { imageDigest } from './signed-image.mjs';

const [original, signed] = process.argv.slice(2);
if (!original || !signed) throw new Error('Original and signed PE paths required');
if (imageDigest(await readFile(original)) !== imageDigest(await readFile(signed))) {
  throw new Error('Signed binary differs from the approved unsigned image');
}
