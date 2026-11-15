// Clothing engine (YDD read/write, OBJ, Neon, Separar pele).
// Unit tests run everywhere. Real-garment tests need private files from the RedHorn acervo and run
// only when RPFORGE_CLOTHING_SAMPLES points at a JSON file: {"neon": [ydd...], "skin": [ydd...], "reference": "skin-triangles.json"}.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sha256} from '../src/clothing-engine/sha256.js';
import {halfToFloat, floatToHalf} from '../src/clothing-engine/vertex.js';
import {f32} from '../src/clothing-engine/obj.js';
import {triangleFingerprint} from '../src/clothing-engine/skin-reference.js';
import {readYdd, lodGeometries, LODS} from '../src/clothing-engine/ydd-read.js';
import {repackYdd} from '../src/clothing-engine/ydd-write.js';
import {buildClothingObj} from '../src/clothing-engine/obj.js';
import {convertNeon, NEON_COLOUR, NEON_SHADER} from '../src/clothing-engine/neon.js';
import {analyseSkin, applyOverrides, splitSkin} from '../src/clothing-engine/skin.js';
import {componentReader, geometryArrays} from '../src/clothing-engine/vertex.js';
import {encodeYftResource} from '../src/vehicle-engine/resource.js';

test('sha256 matches node:crypto', () => {
  for (const s of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), '-1234,5,0;12,-3,4;7,7,7'.repeat(9)])
    assert.equal(sha256(s), createHash('sha256').update(s).digest('hex'));
});

test('half floats round-trip', () => {
  for (const v of [0, 1, -1, 0.5, 65504, -2.25, 0.0001220703125]) assert.equal(halfToFloat(floatToHalf(v)), v);
});

test('OBJ numbers are the shortest float32 text', () => {
  assert.equal(f32(0.1), '0.1'); assert.equal(f32(-0), '0'); assert.equal(f32(Math.fround(1 / 3)), '0.33333334'); assert.equal(f32(2), '2');
});

test('triangle fingerprint follows the desktop rule (rounded, sorted, order independent)', () => {
  const p = new Float32Array([0.00004, 1, 2, -0.5, 0.25, 3, 1, 1, 1]);
  const a = triangleFingerprint(p, 0, 1, 2), b = triangleFingerprint(p, 2, 0, 1);
  assert.equal(a, b);
  assert.equal(a, createHash('sha256').update(['0,10000,20000', '-5000,2500,30000', '10000,10000,10000'].sort().join(';')).digest('hex'));
});

const samples = process.env.RPFORGE_CLOTHING_SAMPLES ? JSON.parse(readFileSync(process.env.RPFORGE_CLOTHING_SAMPLES, 'utf8')) : null;
const reference = samples ? JSON.parse(readFileSync(samples.reference, 'utf8')) : null;
const real = {skip: samples ? false : 'RPFORGE_CLOTHING_SAMPLES not set'};
const encode = regions => encodeYftResource(regions);

test('real garments: repack round-trip keeps every geometry byte', real, () => {
  for (const file of [...samples.neon, ...samples.skin]) {
    const a = readYdd(readFileSync(file)), b = readYdd(encode(repackYdd(a)));
    const dump = r => r.model.drawables.map(({drawable: d}) => LODS.map(l => lodGeometries(d, l).map(({geometry: g}) => {
      const a = geometryArrays(r.view, g); return [g.declaration.flags, Array.from(a.positions).join(), Array.from(a.indices).join()].join('|');
    }).join('/')).join('#')).join('$');
    assert.equal(dump(b), dump(a), file);
  }
});

test('real garments: OBJ has one group per geometry and V flipped', real, () => {
  const r = readYdd(readFileSync(samples.neon[0]));
  const textures = r.model.drawables.flatMap(({drawable: d}) => d.shaderGroup.shaders.map(s => s.diffuse).filter(Boolean));
  const out = buildClothingObj(r, {lod: 'high', textures, name: 'peca'});
  const geos = lodGeometries(r.model.drawables[0].drawable, 'high');
  assert.equal(out.report.meshes, geos.length);
  assert.match(out.obj, /^mtllib peca\.mtl$/m);
  const firstVt = out.obj.split('\n').find(l => l.startsWith('vt ')).split(' ').map(Number), uv = geometryArrays(r.view, geos[0].geometry).uvs;
  assert.ok(Math.abs(firstVt[2] - (1 - uv[1])) < 1e-6);
  assert.throws(() => buildClothingObj(r, {lod: 'high', textures: [], name: 'peca'}), /Selecione o YTD|difusa/);
});

test('real garments: Neon keeps geometry and applies the preset', real, () => {
  const file = samples.neon[0], r = readYdd(readFileSync(file));
  const out = convertNeon(r, {name: 'jbib_009_u', reference: new Set(reference.female.concat(reference.male))});
  const c = readYdd(encode(out.regions)), d = c.model.drawables[0].drawable;
  assert.equal(d.name, 'jbib_009_u');
  assert.ok(d.shaderGroup.shaders.every(s => s.fileHash === NEON_SHADER.file));
  for (const l of LODS) for (const {geometry: g} of lodGeometries(d, l)) {
    assert.deepEqual(componentReader(c.view, g, 'colour0')(0), [...NEON_COLOUR]);
    assert.ok(componentReader(c.view, g, 'tangent') && componentReader(c.view, g, 'texcoord1'));
  }
});

test('real garments: Separar pele partitions every face', real, () => {
  for (const file of samples.skin) {
    const r = readYdd(readFileSync(file)), set = new Set(reference[/^mp_f_/i.test(file.split(/[\\/]/).pop()) ? 'female' : 'male']);
    const a = analyseSkin(r, set);
    // Resolve any uncertain face as cloth, as a person would in the review.
    const overrides = {};
    for (const [lod, list] of Object.entries(a.lods)) list.forEach((g, gi) => g.roles.forEach((role, f) => { if (role === 2) overrides[`${lod}:${gi}:${f}`] = 'cloth'; }));
    applyOverrides(a, overrides);
    if (!a.canSplit) continue;
    const out = splitSkin(r, a, {cloth: 'jbib_001_u', skin: 'jbib_002_u'});
    const faces = x => LODS.reduce((s, l) => s + lodGeometries(x.model.drawables[0].drawable, l).reduce((t, {geometry: g}) => t + g.triangles, 0), 0);
    const cloth = readYdd(encode(out.cloth.regions)), skin = readYdd(encode(out.skin.regions));
    assert.equal(faces(cloth) + faces(skin), faces(r), file);
  }
});
