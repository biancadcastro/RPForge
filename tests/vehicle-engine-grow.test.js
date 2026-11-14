import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {readYft} from '../src/vehicle-engine/yft-read.js';
import {encodeYftResource} from '../src/vehicle-engine/resource.js';
import {addBones} from '../src/vehicle-engine/yft-bones.js';
import {addGeometries} from '../src/vehicle-engine/yft-grow.js';
import {addShader, removeGeometries, setGeometryShader} from '../src/vehicle-engine/yft-ops.js';
import {repackYft} from '../src/vehicle-engine/yft-repack.js';
import {boneTagFromName} from '../src/animation-engine/hash.js';
import {EngineError} from '../src/animation-engine/errors.js';

// Real files of a client car: never copied into the repo; tests skip without them.
const M3 = process.env.RPFORGE_TEST_YFT ?? 'D:/RedHorn/Loja/Carros/Clientes/Bibis/M3&M/REDHORNM3BIBIS/stream/REDHORNM3BIBIS.yft';
const MOD = M3.replace(/REDHORNM3BIBIS\.yft$/, 'mods/REDHORNM3BIBIS_bumf1.yft');
const hasM3 = existsSync(M3), hasMod = existsSync(MOD);
const code = c => err => err instanceof EngineError && err.code === c;

test('M3: new bones get vehicle tags, parent, sibling chain, matrices and lookup', {skip: !hasM3 && 'M3 not available'}, () => {
  const read = readYft(readFileSync(M3));
  const {regions} = addBones(read, [{name: 'seat_dside_r1', translation: [-0.37, -1, 0.2], template: 'seat_dside_r'}, {name: 'seat_pside_r1', translation: [0.37, -1, 0.2], template: 'seat_pside_r'}]);
  const back = readYft(encodeYftResource(regions)), sk = back.model.skeleton;
  assert.equal(sk.count, read.model.skeleton.count + 2);
  const b = sk.bones.find(x => x.name === 'seat_dside_r1');
  assert.equal(b.tag, boneTagFromName('seat_dside_r1')); assert.equal(b.tag, 35183); // tag used by other cars of the collection
  assert.equal(b.parent, 0); assert.equal(b.sibling, b.index + 1);
  assert.deepEqual(back.model.stats.seatBones.slice(-2), ['seat_dside_r1', 'seat_pside_r1']);
  const dv = back.view.sdv;
  assert.ok(Math.abs(dv.getFloat32(sk.inverseBindAt + b.index * 64 + 12 * 4, true) - 0.37) < 1e-5, 'inverse bind translation');
  assert.throws(() => addBones(read, [{name: 'chassis', translation: [0, 0, 0]}]), code('INVALID_INPUT'));
  assert.throws(() => addBones(read, Array.from({length: 10}, (_, i) => ({name: `x${i}`, translation: [0, 0, 0]}))), code('LIMIT_EXCEEDED'));
});

test('M3: a cloned shader keeps the original untouched and one part can use it', {skip: !hasM3 && 'M3 not available'}, () => {
  const read = readYft(readFileSync(M3));
  const s = addShader(read, 2, {parameters: {specularIntensityMult: [0.05, 0, 0, 0]}});
  setGeometryShader(s.read, [{model: 0, geometry: 7}], s.index);
  const back = readYft(encodeYftResource(repackYft(s.read))).model, sh = back.drawable.shaderGroup.shaders;
  assert.equal(sh.length, read.model.drawable.shaderGroup.shaders.length + 1);
  assert.equal(back.drawable.lods.high[0].geometries[7].shaderIndex, s.index);
  assert.equal(sh.at(-1).parameters.find(p => p.name === 'specularIntensityMult').value[0], Math.fround(0.05));
  assert.equal(sh[2].parameters.find(p => p.name === 'specularIntensityMult').value[0], 1);
  assert.equal(sh.at(-1).fileName, sh[2].fileName);
});

test('mod YFT: a new shop part is built from a mod of the same car (new geometry, old ones removed)', {skip: !hasMod && 'mod not available'}, () => {
  const mod = readYft(readFileSync(MOD)), n = mod.model.drawable.lods.high[0].geometries.length, bone = mod.model.skeleton.bones[0].name;
  let g = addGeometries(mod, [{positions: new Float32Array([0, -2, 0.5, 0.5, -2, 0.5, 0, -2, 1, 0, -2.3, 0.5]), indices: [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2], bone, shaderIndex: 0}]);
  g = removeGeometries(g.read, [...Array(n).keys()]);
  const bytes = encodeYftResource(g.regions), back = readYft(bytes).model;
  assert.equal(back.drawable.lods.high[0].geometries.length, 1);
  assert.equal(back.drawable.lods.high[0].geometries[0].vertexCount, 4);
  assert.ok(bytes.length < 20000, 'dead geometry data is not carried');
  assert.throws(() => removeGeometries(mod, [...Array(n).keys()]), code('INVALID_INPUT'));
});
