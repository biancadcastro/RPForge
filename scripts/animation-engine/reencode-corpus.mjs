// Controlled transformation over external files: re-encode one clip per file into the
// skeletal profile. Usage:
//   node scripts/animation-engine/reencode-corpus.mjs <list.txt> <outDir> [quantized|raw]
// Writes <outDir>/<n>.ycd, pairs.txt (source and output paths, for the oracle) and
// reencode.json. Inputs are only read. Outputs derived from third-party files stay
// outside the repository.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {reencodeYcd} from '../../src/animation-engine/convert.js';

const [listPath, outDir, mode = 'quantized'] = process.argv.slice(2);
if (!listPath || !outDir) { console.error('usage: reencode-corpus.mjs <list.txt> <outDir> [quantized|raw]'); process.exit(2); }
mkdirSync(outDir, {recursive: true});
const discard = ['clipTags', 'clipProperties', 'animationMetadata', 'unsupportedTracks'];
const rows = [], sources = [], outputs = [];
const paths = readFileSync(listPath, 'utf8').split(/\r?\n/).filter(Boolean);
paths.forEach((p, n) => {
  const row = {index: n, source: p};
  try {
    const r = reencodeYcd(readFileSync(p), {discard, encoding: {mode}});
    const out = join(outDir, `${n}.ycd`); writeFileSync(out, r.bytes);
    Object.assign(row, {ok: true, output: out, bytes: r.bytes.length, frames: r.report.frames, tracks: r.report.tracks.length,
      discarded: r.discarded.map(d => d.category + (d.track !== undefined ? `:${d.track}` : '')), maxPositionError: r.verification.maxPositionError, maxAngleError: r.verification.maxAngleError});
    sources.push(p); outputs.push(out);
  } catch (e) { Object.assign(row, {ok: false, error: {code: e.code, message: e.message}}); }
  rows.push(row);
});
writeFileSync(join(outDir, 'sources.txt'), sources.join('\n'));
writeFileSync(join(outDir, 'outputs.txt'), outputs.join('\n'));
writeFileSync(join(outDir, 'reencode.json'), JSON.stringify(rows, null, 1));
const ok = rows.filter(r => r.ok), fail = {};
for (const r of rows.filter(r => !r.ok)) fail[`${r.error.code}: ${r.error.message}`] = (fail[`${r.error.code}: ${r.error.message}`] ?? 0) + 1;
console.log(JSON.stringify({files: rows.length, reencoded: ok.length, refused: fail,
  maxPositionError: Math.max(0, ...ok.map(r => r.maxPositionError)), maxAngleError: Math.max(0, ...ok.map(r => r.maxAngleError))}, null, 1));
