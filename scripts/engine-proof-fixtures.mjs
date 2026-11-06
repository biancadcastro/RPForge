import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {writeYdd} from '../src/engine-proof/ydd.js';
import {writeYcd} from '../src/engine-proof/ycd.js';
const folder = process.argv[2]; if (!folder || !path.isAbsolute(folder)) throw Error('Provide absolute proof output directory');
await mkdir(folder, {recursive: true});
const cases = [];
for (const count of [1, 100, 10000]) {
  const model = {name: 'proof_mesh_' + count, positions: [], indices: []};
  for (let i = 0; i < count; i++) {
    const offset = model.positions.length / 3, x = (i % 100) * 2, y = Math.floor(i / 100) * 2;
    model.positions.push(x, y, 0, x + 1, y, 0, x, y + 1, 0); model.indices.push(offset, offset + 1, offset + 2);
  }
  const file = model.name + '.ydd'; await writeFile(path.join(folder, file), writeYdd(model)); cases.push({type: 'ydd', file, model});
}
for (const frames of [2, 31, 256]) {
  const model = {name: 'proof_motion_' + frames, fps: 30, translations: []};
  for (let i = 0; i < frames; i++) model.translations.push(i * 0.125, Math.sin(i * 0.1), i % 2 ? 0.25 : 0);
  const file = model.name + '.ycd'; await writeFile(path.join(folder, file), writeYcd(model)); cases.push({type: 'ycd', file, model});
}
await writeFile(path.join(folder, 'manifest.json'), JSON.stringify(cases));
console.log('Wrote six synthetic fixtures: ' + folder);
