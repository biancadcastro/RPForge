// Full-writer proof over a corpus, in batches (disk-friendly):
//   node scripts/vehicle-engine/repack-corpus.mjs <list.txt> <work-dir> <CodeWalker-dir> [batch=40] [repack|grow]
// grow: adds one bone (seat_dside_r6 or rpf_teste) and one cube skinned to it, then checks that the
// oracle and our reader agree field by field on the grown file, and that the counts grew by one.
// For each YFT: read -> repackYft -> re-read with our reader (model must match, addresses aside)
// -> CodeWalker oracle reads the repacked file -> compare(oracle, original model).
// Repacked files are deleted after each batch. Prints one JSON line per file.
import {readFileSync, writeFileSync, mkdirSync, rmSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {readYft} from '../../src/vehicle-engine/yft-read.js';
import {repackYftBytes} from '../../src/vehicle-engine/yft-repack.js';
import {compare} from './compare-oracle.mjs';
import {addBones} from '../../src/vehicle-engine/yft-bones.js';
import {addGeometries} from '../../src/vehicle-engine/yft-grow.js';
import {encodeYftResource} from '../../src/vehicle-engine/resource.js';
import {readYftResource} from '../../src/vehicle-engine/yft-read.js';

const [listFile, work, cw, batchArg, mode = 'repack'] = process.argv.slice(2);
const batch = Number(batchArg ?? 40);
const files = readFileSync(listFile, 'utf8').trim().split(/\r?\n/);
// Addresses and page flags change by design; a stale page-count warning disappears because the repack writes correct counts.
const strip = (k, v) => (/^(at|off|.*At|data|secondVertexData|systemFlags|graphicsFlags)$/.test(k) ? undefined : k === 'warnings' ? v.filter(w => w.code !== 'PAGE_INFO_COUNTS') : v);
const oracleScript = new URL('./Invoke-YftOracle.ps1', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

for (let start = 0; start < files.length; start += batch) {
  const dir = join(work, `batch-${start}`); mkdirSync(dir, {recursive: true});
  const rows = [], list = [];
  for (const [k, file] of files.slice(start, start + batch).entries()) {
    const row = {file};
    try {
      const a = readYft(readFileSync(file)), t = Date.now();
      if (mode === 'grow') {
        const name = a.model.skeleton.bones.some(b => b.name === 'seat_dside_r6') ? 'rpf_teste' : 'seat_dside_r6';
        let g = addBones(a, [{name, parent: a.model.skeleton.bones[0].name, translation: [0, -0.5, 0.4]}]);
        const m = g.read.model.drawable.lods.high?.[0], cube = new Float32Array([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0, 0, 0.1]);
        if (m?.hasSkin) g = addGeometries(g.read, [{positions: cube, indices: [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2], bone: name, shaderIndex: m.geometries[0].shaderIndex}]);
        const bytes = encodeYftResource(g.regions), b = readYft(bytes).model;
        row.ms = Date.now() - t; row.bonesGrew = b.stats.bones === a.model.stats.bones + 1;
        row.geomsGrew = !m?.hasSkin || b.drawable.lods.high[0].geometries.length === a.model.drawable.lods.high[0].geometries.length + 1;
        row.sameModel = row.bonesGrew && row.geomsGrew;
        const out = join(dir, `rp-${k}.yft`); writeFileSync(out, bytes); list.push(out); row.index = list.length - 1; row.model = b;
      } else {
        const r = repackYftBytes(a);
        row.ms = Date.now() - t; row.pages = r.pages; row.dropped = r.droppedDeadBytes;
        row.sizeIn = a.resource.system.length + a.resource.graphics.length; row.sizeOut = r.system.length + r.graphics.length;
        row.sameModel = JSON.stringify(a.model, strip) === JSON.stringify(readYft(r.bytes).model, strip);
        const out = join(dir, `rp-${k}.yft`); writeFileSync(out, r.bytes); list.push(out); row.index = list.length - 1; row.model = a.model;
      }
    } catch (e) { row.error = `${e.code ?? ''} ${e.message}`; }
    rows.push(row);
  }
  if (list.length) {
    writeFileSync(join(dir, 'list.txt'), list.join('\r\n'));
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', oracleScript, '-ListFile', join(dir, 'list.txt'), '-OutDirectory', dir, '-LibraryDirectory', cw, '-Blocks', '0'], {stdio: 'ignore', maxBuffer: 1 << 26});
  }
  for (const row of rows) {
    if (row.index !== undefined) {
      const oracle = JSON.parse(readFileSync(join(dir, `oracle-${row.index}.json`), 'utf8'));
      if (oracle.error) row.oracleError = oracle.error.split('\n')[0];
      else { const c = compare(oracle, row.model); row.oracleChecks = c.checks; row.oracleMismatches = c.mismatches.slice(0, 5); }
    }
    delete row.model; delete row.index;
    row.ok = !row.error && !row.oracleError && row.sameModel && row.oracleMismatches?.length === 0;
    console.log(JSON.stringify(row));
  }
  rmSync(dir, {recursive: true, force: true});
}
if (existsSync(work)) rmSync(work, {recursive: true, force: true});
