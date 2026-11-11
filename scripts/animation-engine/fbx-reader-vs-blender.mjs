// Offline check of the FBX READER against Blender's FBX importer (independent
// implementation). It writes a synthetic FBX that uses what Maya/Mixamo-style files use
// and Blender's exporter never writes (pre-rotation, every rotation order, a scaled and
// rotated parent node), lets Blender import it, and compares the position of every bone
// head, frame by frame, with the RPForge evaluation of the same file.
// Usage: node scripts/animation-engine/fbx-reader-vs-blender.mjs --blender <blender.exe> --out <scratch dir>
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseFbx} from '../../src/animation-engine/fbx-parse.js';
import {buildScene, prepareTake, worldTransforms} from '../../src/animation-engine/fbx-scene.js';
import {resolveSkeleton} from '../../src/animation-engine/fbx-convert.js';
import {fbxFromPoses, knownAnimation, BASIS} from '../../tests/animation-engine/fbx-rig.js';

const args = process.argv.slice(2), option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const blender = option('blender'), out = option('out');
if (!blender || !out) { console.error('usage: fbx-reader-vs-blender.mjs --blender <blender.exe> --out <scratch dir>'); process.exit(2); }
const dir = resolve(out); mkdirSync(dir, {recursive: true});
const {skel} = resolveSkeleton('male'), frames = 21, fps = 30;
const bones = skel.bones.map((b, i) => ({name: b.name, parent: b.parent, target: i}));
const anim = knownAnimation(skel, skel.bones.map((_, i) => i).filter(i => /^SKEL_/.test(skel.bones[i].name)), {frames});
const rows = [];
let failed = false;
for (const [label, options] of [
  ['y-up, cm, parent rotated and scaled', {basis: BASIS.yUp, unitsPerMetre: 100, armature: {rotation: [-90, 0, 0], scale: 100}}],
  ['y-up, cm, plain parent', {basis: BASIS.yUp, unitsPerMetre: 100, armature: {rotation: [0, 0, 0], scale: 1}, seed: 31}],
]) {
  const file = join(dir, `reader-${rows.length}.fbx`), json = join(dir, `reader-${rows.length}.json`);
  const bytes = fbxFromPoses(skel, bones, anim.pose, anim.rest, {...options, frames, fps});
  writeFileSync(file, bytes);
  const script = fileURLToPath(new URL('./blender-read-fbx.py', import.meta.url));
  const run = spawnSync(blender, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', script, '--', file, json, String(frames), String(fps)], {encoding: 'utf8', timeout: 600000});
  if (run.status !== 0 || !/READ_OK/.test(run.stdout)) { console.error(run.stdout?.slice(-3000), run.stderr?.slice(-3000)); process.exit(1); }
  const oracle = JSON.parse(readFileSync(json, 'utf8'));
  const scene = buildScene(parseFbx(bytes)), take = prepareTake(scene, scene.takes[0]);
  // Blender scene from a Y-up centimetre file: metres, Z up -> (x, y, z) becomes (x, -z, y) / 100.
  let worst = 0, worstBone = null, compared = 0, span = 0;
  for (let f = 0; f < frames; f++) {
    const world = worldTransforms(scene, scene.order, take, f / fps);
    for (const model of scene.models) {
      const expected = oracle.frames[f][model.name];
      if (!expected) continue;
      const t = world.get(model.index).t, mine = [t[0] / 100, -t[2] / 100, t[1] / 100];
      const error = Math.hypot(mine[0] - expected[0], mine[1] - expected[1], mine[2] - expected[2]);
      span = Math.max(span, Math.hypot(...expected));
      compared++;
      if (error > worst) { worst = error; worstBone = model.name; }
    }
  }
  rows.push({case: label, blender: /READ_OK (\S+)/.exec(run.stdout)[1], bonesPerFrame: compared / frames, frames, maxErrorMm: +(worst * 1000).toFixed(4), worstBone, sceneSpanM: +span.toFixed(2)});
  if (worst > 1e-3 || compared < frames * 100) failed = true;
}
console.table(rows);
writeFileSync(join(dir, 'reader-vs-blender.json'), JSON.stringify(rows, null, 2));
if (failed) { console.error('READER MISMATCH'); process.exit(1); }
console.log('reader ok');
