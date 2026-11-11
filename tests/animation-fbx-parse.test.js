import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {parseFbx, readArray, child, FBX_LIMITS, resolveFbxLimits} from '../src/animation-engine/fbx-parse.js';
import {buildScene, prepareTake, worldTransforms, localTransform} from '../src/animation-engine/fbx-scene.js';
import {prepareCurve, evaluateCurve, KTIME_PER_SECOND} from '../src/animation-engine/fbx-curve.js';
import {eulerToMatrix, mul3, axisRotation, rotationOf, quatFromMatrix, matrixFromQuat, shortestArc} from '../src/animation-engine/fbx-math.js';
import {EngineError, ErrorCode} from '../src/animation-engine/errors.js';
import {buildFbx, sceneNodes, encodeBinary, encodeAscii, node, I, L, D, S, A, P} from './animation-engine/fbx-builder.js';

const code = c => err => err instanceof EngineError && err.code === c;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const times = n => Array.from({length: n}, (_, i) => i / 30);

/** A small three-bone scene with every feature the reader has to understand. */
function sampleScene(extra = {}) {
  return {
    settings: {upAxis: 1, frontAxis: 2, coordAxis: 0, unitScaleFactor: 1, timeMode: 11},
    models: [
      {name: 'Armature', type: 'Null', rotation: [-90, 0, 0], scaling: [100, 100, 100]},
      {name: 'mixamorig:Hips', parent: 'Armature', translation: [0, 0.5, 1], rotation: [10, 20, 30], preRotation: [0, 0, 90]},
      {name: 'mixamorig:Spine', parent: 'mixamorig:Hips', translation: [0, 0.2, 0], rotationOrder: 4, rotation: [5, 6, 7], postRotation: [0, 45, 0]},
      {name: 'Body', type: 'Mesh', parent: 'Armature'},
    ],
    bindPose: [{model: 'mixamorig:Hips', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1]}],
    takes: [
      {name: 'Idle', start: 0, stop: 1, curves: [
        {model: 'mixamorig:Hips', channel: 'R', axis: 0, times: times(31), values: times(31).map(t => 10 + 20 * t)},
        {model: 'mixamorig:Hips', channel: 'R', axis: 2, times: [0, 1], values: [30, 60]},
        {model: 'mixamorig:Hips', channel: 'T', axis: 1, times: [0, 0.5, 1], values: [0.5, 0.7, 0.5]},
      ]},
      {name: 'Wave', curves: [{model: 'mixamorig:Spine', channel: 'R', axis: 1, times: [0.25, 2.25], values: [0, 90]}]},
    ],
    ...extra,
  };
}
function summary(bytes) {
  const scene = buildScene(parseFbx(bytes));
  const takes = scene.takes.map(t => { const p = prepareTake(scene, t); return {name: t.name, start: p.start, stop: p.stop, source: p.rangeSource, curves: p.stats.curves, keys: p.stats.keys, value: [...p.channels].map(([m, ch]) => [scene.models[m].name, Object.keys(ch).sort().join('')])}; });
  return {version: scene.version, settings: scene.settings, models: scene.models.map(m => ({name: m.name, type: m.type, parent: m.parent, t: m.translation, r: m.rotation, s: m.scaling, order: m.rotationOrder, active: m.rotationActive, pre: m.preRotation, post: m.postRotation})), bind: [...scene.bindPose.keys()], takes};
}

test('fbx parser: binary 7.4, 7.5 (64-bit headers), compressed arrays and ASCII describe the same scene', () => {
  const plain = summary(buildFbx(sampleScene()));
  assert.equal(plain.version, 7400);
  assert.equal(plain.settings.fps, 24); assert.equal(plain.settings.upAxis, 1); assert.equal(plain.settings.unitScaleFactor, 1);
  assert.deepEqual(plain.models.map(m => [m.name, m.type, m.parent]), [['Armature', 'Null', -1], ['mixamorig:Hips', 'LimbNode', 0], ['mixamorig:Spine', 'LimbNode', 1], ['Body', 'Mesh', 0]]);
  assert.deepEqual(plain.models[1].pre, [0, 0, 90]); assert.equal(plain.models[2].order, 4); assert.deepEqual(plain.models[2].post, [0, 45, 0]);
  assert.deepEqual(plain.models[0].s, [100, 100, 100]); assert.deepEqual(plain.models[1].s, [1, 1, 1]);
  assert.deepEqual(plain.bind, [1]);
  assert.deepEqual(plain.takes.map(t => [t.name, t.start, t.stop, t.source, t.curves, t.keys]), [['Idle', 0, 1, 'take', 3, 36], ['Wave', 0.25, 2.25, 'keys', 1, 2]]);
  for (const variant of [{version: 7500}, {version: 7700, compress: true}, {compress: true}, {ascii: true}, {version: 7300}]) {
    const other = summary(buildFbx(sampleScene(variant)));
    assert.deepEqual({...other, version: 0}, {...plain, version: 0}, JSON.stringify(variant));
    assert.equal(other.version, variant.version ?? 7400);
  }
});

test('fbx parser: arrays decode lazily, with exact sizes, in every encoding', () => {
  const values = Array.from({length: 1000}, (_, i) => Math.sin(i));
  for (const compress of [false, true]) {
    const doc = parseFbx(encodeBinary([node('Data', [A('d', values, compress), A('f', [1.5, -2], compress), A('i', [-7, 8], compress), A('l', [5n, -6n], compress), A('b', [1, 0, 1], compress)])]));
    const props = doc.root.children[0].props;
    assert.deepEqual([...readArray(doc, props[0])], values);
    assert.deepEqual([...readArray(doc, props[1])], [1.5, -2]); assert.deepEqual([...readArray(doc, props[2])], [-7, 8]);
    assert.deepEqual([...readArray(doc, props[3])], [5, -6]); assert.deepEqual([...readArray(doc, props[4])], [1, 0, 1]);
    assert.equal(doc.inflated, 8000 + 8 + 8 + 16 + 3);
  }
  const ascii = parseFbx(encodeAscii([node('FBXHeaderExtension', [], [node('FBXVersion', [I(7400)])]), node('Data', [A('d', [1, -2.5, 3e-5])]), node('Objects'), node('Connections')]));
  assert.deepEqual([...readArray(ascii, child(ascii.root, 'Data').props[0])], [1, -2.5, 3e-5]);
});

test('fbx parser: property templates supply defaults the objects omit', () => {
  const scene = buildScene(parseFbx(buildFbx({models: [{name: 'a'}, {name: 'b', scaling: [3, 3, 3]}], templateDefaults: [P('Lcl Scaling', 'Lcl Scaling', '', 'A', D(2), D(2), D(2)), P('RotationOrder', 'enum', '', '', I(5)), P('RotationActive', 'bool', '', '', I(1))]})));
  assert.deepEqual(scene.models[0].scaling, [2, 2, 2]); assert.deepEqual(scene.models[1].scaling, [3, 3, 3]);
  assert.equal(scene.models[0].rotationOrder, 5);
});

test('fbx parser: refuses non-FBX, unsupported versions and structural damage with stable codes', () => {
  const good = buildFbx(sampleScene());
  assert.throws(() => parseFbx(new Uint8Array(0)), code(ErrorCode.FBX_INVALID));
  assert.throws(() => parseFbx(new TextEncoder().encode('hello world, not a model')), code(ErrorCode.FBX_INVALID));
  assert.throws(() => parseFbx('text'), code(ErrorCode.INVALID_INPUT));
  for (const version of [6100, 5800, 7800, 8000]) {
    assert.throws(() => parseFbx(encodeBinaryVersion(good, version)), code(ErrorCode.FBX_UNSUPPORTED_VERSION), String(version));
  }
  assert.throws(() => parseFbx(encodeAscii(sceneNodes({...sampleScene(), version: 6100}), {version: 6100})), code(ErrorCode.FBX_UNSUPPORTED_VERSION));
  // Every truncation is refused cleanly, or stops at a complete top-level record.
  for (let cut = 0; cut < good.length; cut += 7) {
    try { buildScene(parseFbx(good.subarray(0, cut))); } catch (error) { assert.ok(error instanceof EngineError, `cut ${cut}: ${error?.stack}`); }
  }
  // Byte mutations never escape as anything but an EngineError (no crash, no hang).
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let round = 0; round < 1500; round++) {
    const mutated = Uint8Array.from(good); mutated[Math.floor(rnd() * good.length)] = Math.floor(rnd() * 256);
    try { const scene = buildScene(parseFbx(mutated)); scene.takes.forEach(t => prepareTake(scene, t)); } catch (error) { assert.ok(error instanceof EngineError, `round ${round}: ${error?.stack}`); }
  }
});
function encodeBinaryVersion(bytes, version) { const copy = Uint8Array.from(bytes); new DataView(copy.buffer).setUint32(23, version, true); return copy; }

test('fbx parser: budgets for size, nodes, depth, arrays and inflation are enforced', () => {
  const good = buildFbx(sampleScene());
  assert.throws(() => parseFbx(good, {limits: {maxFbxBytes: good.length - 1}}), code(ErrorCode.INPUT_TOO_LARGE));
  assert.throws(() => parseFbx(good, {limits: {maxNodes: 10}}), code(ErrorCode.LIMIT_EXCEEDED));
  assert.throws(() => parseFbx(good, {limits: {maxDepth: 2}}), code(ErrorCode.LIMIT_EXCEEDED));
  assert.throws(() => parseFbx(buildFbx({...sampleScene(), ascii: true}), {limits: {maxDepth: 2}}), code(ErrorCode.LIMIT_EXCEEDED));
  assert.throws(() => buildScene(parseFbx(good, {limits: {maxModels: 2}})), code(ErrorCode.LIMIT_EXCEEDED));
  assert.throws(() => buildScene(parseFbx(good, {limits: {maxTakes: 1}})), code(ErrorCode.LIMIT_EXCEEDED));
  assert.throws(() => { const s = buildScene(parseFbx(good, {limits: {maxKeysPerCurve: 10}})); prepareTake(s, s.takes[0]); }, code(ErrorCode.LIMIT_EXCEEDED));
  assert.throws(() => resolveFbxLimits({maxFbxBytes: FBX_LIMITS.maxFbxBytes + 1}), RangeError);
  // A compressed array that inflates beyond what it declares (decompression bomb) is cut off.
  const bomb = deflateSync(new Uint8Array(4 * 1024 * 1024));
  const file = encodeBinary([node('Data', [A('b', [0, 0, 0, 0])])]);
  const doc = parseFbx(file), lazy = doc.root.children[0].props[0];
  const forged = new Uint8Array(file.length + bomb.length); forged.set(file);
  forged.set(bomb, file.length);
  const forgedDoc = {...doc, bytes: forged}; lazy.encoding = 1; lazy.start = file.length; lazy.end = forged.length;
  assert.throws(() => readArray(forgedDoc, lazy), code(ErrorCode.DECOMPRESSION_FAILED));
  const big = parseFbx(encodeBinary([node('Data', [A('d', new Array(1000).fill(1))])]), {limits: {maxArrayBytes: 4000}});
  assert.throws(() => readArray(big, big.root.children[0].props[0]), code(ErrorCode.LIMIT_EXCEEDED));
  const total = parseFbx(encodeBinary([node('Data', [A('d', new Array(1000).fill(1))])]), {limits: {maxInflatedBytes: 12000}});
  readArray(total, total.root.children[0].props[0]);
  assert.throws(() => readArray(total, total.root.children[0].props[0]), code(ErrorCode.LIMIT_EXCEEDED));
  // Declared array length that disagrees with the stored bytes.
  const short = parseFbx(encodeBinary([node('Data', [A('d', [1, 2, 3])])]));
  short.root.children[0].props[0].length = 4;
  assert.throws(() => readArray(short, short.root.children[0].props[0]), code(ErrorCode.FBX_INVALID));
});

test('fbx scene: hierarchy loops, missing sections and unsupported rotation orders are refused', () => {
  const nodes = sceneNodes({models: [{name: 'a'}, {name: 'b', parent: 'a'}]});
  const connections = nodes.find(n => n.name === 'Connections');
  connections.children[0] = node('C', [S('OO'), L(1000), L(1001)]); // a under b, b under a
  assert.throws(() => buildScene(parseFbx(encodeBinary(nodes))), code(ErrorCode.CYCLE));
  assert.throws(() => buildScene(parseFbx(encodeBinary(sceneNodes({}).filter(n => n.name !== 'Connections')))), code(ErrorCode.FBX_INVALID));
  assert.throws(() => buildScene(parseFbx(buildFbx({models: [{name: 'a', rotationOrder: 6}]}))), code(ErrorCode.FBX_UNSUPPORTED_FEATURE));
  assert.throws(() => buildScene(parseFbx(buildFbx({settings: {upAxis: 2, frontAxis: 2}, models: [{name: 'a'}]}))), code(ErrorCode.FBX_INVALID));
  // Keys out of time order.
  const scene = buildScene(parseFbx(buildFbx({models: [{name: 'a'}], takes: [{name: 't', curves: [{model: 'a', channel: 'R', axis: 0, times: [1, 0], values: [0, 1]}]}]})));
  assert.throws(() => prepareTake(scene, scene.takes[0]), code(ErrorCode.FBX_INVALID));
});

test('fbx math: rotation orders, pre/post rotation and pivots follow the FBX transform chain', () => {
  // Order XYZ = X first, then Y, then Z about fixed axes: R = Rz * Ry * Rx.
  const e = [20, -35, 50];
  assert.deepEqual(eulerToMatrix(e, 0).map(v => +v.toFixed(12)), mul3(axisRotation(2, 50), mul3(axisRotation(1, -35), axisRotation(0, 20))).map(v => +v.toFixed(12)));
  assert.deepEqual(eulerToMatrix(e, 4).map(v => +v.toFixed(12)), mul3(axisRotation(1, -35), mul3(axisRotation(0, 20), axisRotation(2, 50))).map(v => +v.toFixed(12))); // ZXY
  // A 90 degree turn about Z takes +X to +Y (right-handed, counter-clockwise).
  const v = eulerToMatrix([0, 0, 90], 0); close(v[0], 0, 1e-12); close(v[3], 1, 1e-12);
  const q = rotationOf(mul3(eulerToMatrix(e, 2), [3, 0, 0, 0, 3, 0, 0, 0, 3])).q; // uniform scale does not disturb the rotation
  assert.deepEqual(matrixFromQuat(q).map(x => +x.toFixed(9)), eulerToMatrix(e, 2).map(x => +x.toFixed(9)));
  assert.equal(rotationOf([1, 0, 0, 0, 1, 0, 0, 0, -1]).mirrored, true);
  assert.deepEqual(quatFromMatrix(eulerToMatrix([0, 0, 0], 0)), [0, 0, 0, 1]);
  const arc = shortestArc([1, 0, 0], [0, 1, 0]); close(arc[2], Math.SQRT1_2); close(arc[3], Math.SQRT1_2);
  // Pivot: rotating 180 degrees about Z around pivot (1,0,0) sends the origin to (2,0,0).
  const scene = buildScene(parseFbx(buildFbx({models: [{name: 'p', rotationPivot: [1, 0, 0], rotation: [0, 0, 180], rotationActive: true}, {name: 'c', parent: 'p', translation: [1, 0, 0], preRotation: [0, 0, 90], rotation: [0, 0, 0]}]})));
  const world = worldTransforms(scene, scene.order, null, 0);
  assert.deepEqual(world.get(0).t.map(x => +x.toFixed(9) + 0), [2, 0, 0]);
  assert.deepEqual(world.get(1).t.map(x => +x.toFixed(9) + 0), [1, 0, 0]);
  // Child world rotation = parent 180 about Z * pre-rotation 90 about Z = 270 about Z: +X -> -Y.
  close(world.get(1).m[3], -1, 1e-9);
  // Pre-rotation is ignored when the file says rotation is not active.
  const off = buildScene(parseFbx(buildFbx({models: [{name: 'a', preRotation: [0, 0, 90], rotationActive: false}]})));
  assert.equal(off.models[0].ignoredPreRotation, true);
  assert.deepEqual(localTransform(off.models[0], [0, 0, 0], [0, 0, 0], [1, 1, 1]).m, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

test('fbx curves: constant, linear, cubic and weighted segments; values hold outside the keys', () => {
  const k = s => s * KTIME_PER_SECOND, limits = FBX_LIMITS;
  const linear = prepareCurve({times: [k(0), k(1), k(3)], values: [0, 10, 30]}, limits);
  assert.equal(evaluateCurve(linear, -1), 0); assert.equal(evaluateCurve(linear, 9), 30);
  close(evaluateCurve(linear, 0.25), 2.5); close(evaluateCurve(linear, 2), 20);
  const stepped = prepareCurve({times: [k(0), k(1), k(2)], values: [1, 5, 9], flags: [0x2, 0x102], data: new Float32Array(8), refs: [1, 2]}, limits);
  assert.equal(evaluateCurve(stepped, 0.9), 1); assert.equal(evaluateCurve(stepped, 1.5), 9);
  // Cubic with default weights is the Hermite spline of the stored slopes: reproduce v = t^3 exactly.
  const cubic = prepareCurve({times: [k(0), k(2)], values: [0, 8], flags: [0x8 | 0x400], data: new Float32Array([0, 12, 0, 0]), refs: [2]}, limits);
  for (const t of [0.3, 1, 1.7]) close(evaluateCurve(cubic, t), t ** 3, 1e-6);
  assert.equal(cubic.cubicKeys, 2);
  // Weighted tangents: weights 1/3 packed explicitly must agree with the unweighted path,
  // and a stronger weight bends the curve while still hitting both keys.
  const pack = (a, b) => (Math.round(b * 9999) << 16) | Math.round(a * 9999);
  const data = w => { const f = new Float32Array(4), bits = new Int32Array(f.buffer); f[0] = 0; f[1] = 12; bits[2] = pack(w, w); return f; };
  const third = prepareCurve({times: [k(0), k(2)], values: [0, 8], flags: [0x8 | 0x01000000 | 0x02000000], data: data(1 / 3), refs: [2]}, limits);
  for (const t of [0.3, 1, 1.7]) close(evaluateCurve(third, t), t ** 3, 2e-3);
  const heavy = prepareCurve({times: [k(0), k(2)], values: [0, 8], flags: [0x8 | 0x01000000 | 0x02000000], data: data(0.8), refs: [2]}, limits);
  close(evaluateCurve(heavy, 0), 0); close(evaluateCurve(heavy, 2), 8);
  assert.ok(Math.abs(evaluateCurve(heavy, 1) - 1) > 0.05);
  for (let t = 0; t <= 2; t += 0.05) assert.ok(Number.isFinite(evaluateCurve(heavy, t)));
  // TCB keys carry no slopes: evaluated as straight lines and counted for the warning.
  const tcb = prepareCurve({times: [k(0), k(2)], values: [0, 8], flags: [0x8 | 0x200], data: new Float32Array(4), refs: [2]}, limits);
  close(evaluateCurve(tcb, 1), 4); assert.equal(tcb.tcbKeys, 2);
  assert.throws(() => prepareCurve({times: [k(0)], values: [NaN]}, limits), code(ErrorCode.NONFINITE_VALUE));
  assert.throws(() => prepareCurve({times: [k(0), k(1)], values: [1]}, limits), code(ErrorCode.FBX_INVALID));
});

test('fbx scene: ASCII files carry key attributes as integer bit patterns', () => {
  const f = new Float32Array([0, 12, 0, 0]), bits = [...new Int32Array(f.buffer)];
  const description = {models: [{name: 'a'}], takes: [{name: 't', curves: [{model: 'a', channel: 'R', axis: 0, times: [0, 2], values: [0, 8], flags: [0x8], dataBits: bits, refs: [2]}]}]};
  for (const ascii of [false, true]) {
    const scene = buildScene(parseFbx(buildFbx({...description, ascii})));
    const take = prepareTake(scene, scene.takes[0]);
    close(evaluateCurve(take.channels.get(0).R.curves[0], 1), 1, 1e-6);
  }
});
