// Re-reads files saved by the offline oracle with the proof's own readers.
// A refusal is a recorded result (profile limitation), not something to hide.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import path from 'node:path';
import {readYdd} from '../src/engine-proof/ydd.js';
import {readYcd} from '../src/engine-proof/ycd.js';

const folder = process.argv[2]; if (!folder || !path.isAbsolute(folder)) throw Error('Provide absolute proof fixture directory');
const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
function header(bytes) {
  const sf = bytes.readUInt32LE(8), gf = bytes.readUInt32LE(12);
  let expanded = null; try { expanded = inflateRawSync(bytes.subarray(16)).length; } catch { /* reported below */ }
  return {magic: bytes.toString('ascii', 0, 4), version: bytes.readUInt32LE(4), systemFlags: '0x' + sf.toString(16), graphicsFlags: '0x' + gf.toString(16), expandedBytes: expanded};
}
function sameModel(type, got, want) {
  if (got.name !== want.name) return 'name differs';
  if (type === 'ydd') {
    if (got.indices.length !== want.indices.length || got.indices.some((n, i) => n !== want.indices[i])) return 'indices differ';
    if (got.positions.length !== want.positions.length || got.positions.some((n, i) => Math.abs(n - want.positions[i]) > 1e-5)) return 'positions differ';
  } else {
    if (got.fps !== want.fps) return 'fps differs';
    if (got.translations.length !== want.translations.length || got.translations.some((n, i) => Math.abs(n - want.translations[i]) > 1e-5)) return 'samples differ';
  }
  return null;
}
const results = [];
for (const c of manifest) {
  const file = 'oracle-' + c.file, bytes = await readFile(path.join(folder, file));
  const row = {file, sha256: sha(bytes), bytes: bytes.length, header: header(bytes), ownRead: 'refused', error: null};
  try {
    const got = (c.type === 'ydd' ? readYdd : readYcd)(bytes), diff = sameModel(c.type, got, c.model);
    row.ownRead = diff ? 'mismatch' : 'passed'; row.error = diff;
  } catch (e) { row.error = e.message; }
  results.push(row);
}
const report = {generatedAt: new Date().toISOString(), node: process.version, results};
await writeFile(path.join(folder, 'oracle-reread.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
