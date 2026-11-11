import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFbx, convertFbxToYcd, decodeYcd, inspectYcd, fbxBoneAliases, FBX_WARNING_CODES, ErrorCode} from '../src/animation-engine/index.js';
import {resolveSkeleton, clipNameFrom, targetRest} from '../src/animation-engine/fbx-convert.js';
import {eulerToMatrix} from '../src/animation-engine/fbx-math.js';
import {buildFbx} from './animation-engine/fbx-builder.js';
import {fbxFromPoses, knownAnimation, fk, restLocal, BASIS, qmul, qaxis, qrot, shortArc, angleDegrees, eulerMatrix, matrixEuler, seeded} from './animation-engine/fbx-rig.js';

const male = resolveSkeleton('male').skel;
const allBones = male.bones.map((b, i) => ({name: b.name, parent: b.parent, target: i}));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const warningCodes = r => r.report.warnings.map(w => w.code);

/** Decode a converted YCD into per-frame lookups by bone tag. */
function decoded(ycd) {
  const d = decodeYcd(ycd, {strict: true});
  assert.equal(d.ok, true, JSON.stringify(d.error));
  const a = d.animations[0], rotation = new Map(), position = new Map();
  let mover = null;
  for (const t of a.tracks) { if (t.track === 1) rotation.set(t.boneTag, t.samples); else if (t.track === 0) position.set(t.boneTag, t.samples); else if (t.track === 5) mover = t.samples; }
  return {animation: a, clip: d.clips[0], rotation, position, mover,
    q: (tag, f) => [...rotation.get(tag).slice(f * 4, f * 4 + 4)], p: (tag, f) => [...position.get(tag).slice(f * 3, f * 3 + 3)]};
}
/** FK of the converted animation at one frame (bones without a track keep their rest). */
function outputPose(skel, out, f) {
  const rest = restLocal(skel);
  return fk(skel, i => (out.rotation.has(skel.bones[i].tag) ? out.q(skel.bones[i].tag, f) : rest(i)), out.p(skel.bones[skel.order[0]].tag, f));
}
function assertMatchesKnown(skel, anim, out, {angle = 0.05, position = 3e-4} = {}) {
  let worstAngle = 0, worstPosition = 0;
  for (let f = 0; f < anim.frames; f++) {
    const locals = anim.locals(f);
    skel.bones.forEach((b, i) => { if (out.rotation.has(b.tag)) worstAngle = Math.max(worstAngle, angleDegrees(out.q(b.tag, f), locals(i))); });
    worstPosition = Math.max(worstPosition, dist(out.p(0, f), anim.rootPosition(f)));
  }
  assert.ok(worstAngle <= angle, `rotation error ${worstAngle} degrees`);
  assert.ok(worstPosition <= position, `root position error ${worstPosition} m`);
  return {worstAngle, worstPosition};
}

test('test rig math: Euler extraction inverts composition for every FBX rotation order', () => {
  const rnd = seeded(11);
  for (let order = 0; order < 6; order++) for (let k = 0; k < 20; k++) {
    const e = [rnd() * 300 - 150, rnd() * 160 - 80, rnd() * 300 - 150], axes = [[0, 1, 2], [0, 2, 1], [1, 2, 0], [1, 0, 2], [2, 0, 1], [2, 1, 0]][order];
    const euler = [0, 0, 0]; euler[axes[0]] = e[0]; euler[axes[1]] = e[1]; euler[axes[2]] = e[2];
    const m = eulerMatrix(euler, order), back = eulerMatrix(matrixEuler(m, order), order);
    m.forEach((v, i) => assert.ok(Math.abs(v - back[i]) < 1e-9));
    eulerToMatrix(euler, order).forEach((v, i) => assert.ok(Math.abs(v - m[i]) < 1e-12)); // engine and test rig agree on the order convention
  }
});

test('fbx -> ycd: a known GTA animation survives a trip through foreign axes, units, bone frames, pre-rotation and rotation orders', () => {
  const animated = male.bones.map((_, i) => i).filter(i => /^(SKEL_|RB_|IK_Root)/.test(male.bones[i].name));
  const anim = knownAnimation(male, animated, {frames: 31});
  const variants = [
    {basis: BASIS.yUp, unitsPerMetre: 100, armature: {rotation: [-90, 0, 0], scale: 100}, defaultsFromFrame: 9},
    {basis: BASIS.zUpFacingMinusY, unitsPerMetre: 1, armature: {rotation: [0, 0, 0], scale: 1}, version: 7500, compress: true, seed: 21},
    {basis: BASIS.zUpFacingPlusX, unitsPerMetre: 39.37, armature: {rotation: [10, 20, 30], scale: 2.5}, armaturePosition: [3, -2, 5], seed: 5, version: 7700},
    {basis: BASIS.yUp, unitsPerMetre: 100, ascii: true, seed: 9},
  ];
  for (const v of variants) {
    const fbx = fbxFromPoses(male, allBones, anim.pose, anim.rest, {...v, frames: anim.frames});
    const r = convertFbxToYcd(fbx, {clipName: 'known'});
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.ok(r.ycd instanceof Uint8Array);
    const {report} = r;
    assert.equal(report.mappedBones.length, 128); assert.ok(report.mappedBones.every(b => b.via === 'exact'));
    assert.equal(report.ignoredBones.length, 1); assert.equal(report.ignoredBones[0].source, 'Armature');
    assert.equal(report.conversion.restPose, 'bindPose'); assert.equal(report.conversion.scaleFrom, 'legs');
    assert.ok(Math.abs(report.conversion.scale * v.unitsPerMetre - 1) < 1e-5, `scale ${report.conversion.scale}`);
    // The converter must have found the inverse of the basis the file was written in.
    const inverse = [0, 1, 2].flatMap(row => [0, 1, 2].map(c => v.basis.matrix[c * 3 + row]));
    assert.deepEqual(report.conversion.axes.matrix.map(x => x + 0), inverse);
    assert.equal(report.conversion.restAlignment.bones, 0);
    assert.deepEqual(report.output, {clipName: 'known', fps: 30, frames: 31, duration: 1, tracks: 129, bytes: r.ycd.length});
    assert.ok(report.verification.maxAngleError < 2.5e-4);
    const out = decoded(r.ycd);
    assert.equal(out.clip.name, 'pack:/known.clip'); assert.equal(out.animation.frames, 31);
    assert.equal(out.rotation.size, 128); assert.deepEqual([...out.position.keys()], [0]);
    assertMatchesKnown(male, anim, out);
    assert.equal(inspectYcd(r.ycd).strictProfile, 'ycd-skel-v1');
  }
});

test('fbx -> ycd: without a bind pose the file default pose is the rest pose, and the report says so', () => {
  const animated = [male.byName.get('SKEL_R_UpperArm'), male.byName.get('SKEL_Spine1'), male.byName.get('SKEL_L_Calf')];
  const anim = knownAnimation(male, animated, {frames: 16});
  const r = convertFbxToYcd(fbxFromPoses(male, allBones, anim.pose, anim.rest, {frames: 16, bindPose: false}));
  assert.equal(r.ok, true);
  assert.equal(r.report.conversion.restPose, 'defaultPose');
  assert.ok(warningCodes(r).includes('FBX_REST_FROM_DEFAULTS'));
  assertMatchesKnown(male, anim, decoded(r.ycd));
  // If the default pose is NOT the rest pose, the result is offset by exactly that pose: this is why the warning exists.
  const skewed = convertFbxToYcd(fbxFromPoses(male, allBones, anim.pose, anim.rest, {frames: 16, bindPose: false, defaultsFromFrame: 4}));
  const out = decoded(skewed.ycd), tag = male.bones[animated[0]].tag;
  assert.ok(angleDegrees(out.q(tag, 0), anim.locals(0)(animated[0])) > 1);
});

// A Mixamo-style rig: other names, T-pose rest, pre-rotations, centimetres, Y up.
const MIXAMO = [['Hips', null, 'SKEL_ROOT'], ['Spine', 'Hips', 'SKEL_Spine0'], ['Spine1', 'Spine', 'SKEL_Spine1'], ['Spine2', 'Spine1', 'SKEL_Spine3'], ['Neck', 'Spine2', 'SKEL_Neck_1'], ['Head', 'Neck', 'SKEL_Head'],
  ...['Left', 'Right'].flatMap(side => { const s = side[0]; return [[`${side}Shoulder`, 'Spine2', `SKEL_${s}_Clavicle`], [`${side}Arm`, `${side}Shoulder`, `SKEL_${s}_UpperArm`], [`${side}ForeArm`, `${side}Arm`, `SKEL_${s}_Forearm`], [`${side}Hand`, `${side}ForeArm`, `SKEL_${s}_Hand`],
    [`${side}HandMiddle1`, `${side}Hand`, `SKEL_${s}_Finger20`], [`${side}HandThumb1`, `${side}Hand`, `SKEL_${s}_Finger00`],
    [`${side}UpLeg`, 'Hips', `SKEL_${s}_Thigh`], [`${side}Leg`, `${side}UpLeg`, `SKEL_${s}_Calf`], [`${side}Foot`, `${side}Leg`, `SKEL_${s}_Foot`], [`${side}ToeBase`, `${side}Foot`, `SKEL_${s}_Toe0`]]; })];
const mixamoBones = MIXAMO.map(([name, parent, target]) => ({name: `mixamorig:${name}`, parent: parent ? MIXAMO.findIndex(m => m[0] === parent) : -1, target: male.byName.get(target)}));
/** T-pose of the GTA skeleton: both upper arms swung (no twist) to point straight sideways. */
function tPoseLocals() {
  const rest = restLocal(male), base = fk(male, rest), override = new Map();
  for (const [side, x] of [['L', -1], ['R', 1]]) {
    const arm = male.byName.get(`SKEL_${side}_UpperArm`), fore = male.byName.get(`SKEL_${side}_Forearm`), parent = male.bones[arm].parent;
    const direction = [0, 1, 2].map(k => base.position[fore][k] - base.position[arm][k]);
    const swing = shortArc(direction, [x, 0, 0]);                                    // world rotation
    const world = qmul(swing, base.rotation[arm]);
    override.set(arm, qmul([-base.rotation[parent][0], -base.rotation[parent][1], -base.rotation[parent][2], base.rotation[parent][3]], world));
  }
  return i => override.get(i) ?? rest(i);
}

test('fbx -> ycd: Mixamo-style rig maps by alias and its T-pose is aligned to the game rest pose', () => {
  const tPose = tPoseLocals(), frames = 21, rnd = seeded(4);
  // Known motion, defined on the game skeleton starting from the T-pose (what the source artist sees).
  const moving = mixamoBones.map(b => b.target).filter(i => male.bones[i].name !== 'SKEL_ROOT');
  const params = new Map(moving.map(i => [i, {axis: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], amp: 15 + 30 * rnd()}]));
  const locals = f => i => { const p = params.get(i); return p ? qmul(tPose(i), qaxis(p.axis, p.amp * Math.sin(2 * Math.PI * f / (frames - 1)))) : (male.bones[i].parent < 0 ? qaxis([0, 0, 1], 40 * f / (frames - 1)) : tPose(i)); };
  const rootPosition = f => [0.2 * f / (frames - 1), 0.0071, -0.0187 - 0.3 * Math.sin(Math.PI * f / (frames - 1))];
  const pose = f => fk(male, locals(f), rootPosition(f)), rest = fk(male, tPose);
  const fbx = fbxFromPoses(male, mixamoBones, pose, rest, {frames, basis: BASIS.yUp, unitsPerMetre: 100, armature: {rotation: [0, 0, 0], scale: 1}});
  const info = inspectFbx(fbx);
  assert.equal(info.ok, true); assert.equal(info.convertible, true);
  assert.equal(info.mapping.mapped, mixamoBones.length); assert.deepEqual(info.mapping.unmapped, ['Armature']);
  assert.deepEqual(info.bones.find(b => b.name === 'mixamorig:LeftUpLeg'), {name: 'mixamorig:LeftUpLeg', parent: 'mixamorig:Hips', type: 'LimbNode', target: 'SKEL_L_Thigh', via: 'alias'});
  const r = convertFbxToYcd(fbx);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.ok(r.report.mappedBones.every(b => b.via === 'alias'));
  assert.equal(r.report.conversion.rootBone, 'mixamorig:Hips');
  assert.ok(warningCodes(r).includes('FBX_REST_POSE_ALIGNED'));
  assert.ok(r.report.conversion.restAlignment.maxDegrees > 40, 'arms were raised from the A-pose to the T-pose');
  // Unmapped bones between mapped ones are pinned to their rest rotation so the pose is fully determined.
  assert.deepEqual(r.report.pinnedBones.sort(), ['SKEL_Pelvis', 'SKEL_Spine2', 'SKEL_Spine_Root']);
  const out = decoded(r.ycd), pinned = male.byName.get('SKEL_Spine2');
  assert.ok(angleDegrees(out.q(male.bones[pinned].tag, 7), male.bones[pinned].rotation) < 0.02);
  assert.ok(!out.rotation.has(male.bones[male.byName.get('SKEL_L_Finger40')].tag), 'bones with no source get no track');
  // Every limb segment points where the source pointed, at every frame; the body travels as the hips did.
  let worst = 0, worstRoot = 0, worstUnaligned = 0;
  for (let f = 0; f < frames; f++) {
    const expected = pose(f), got = outputPose(male, out, f);
    worstRoot = Math.max(worstRoot, dist(got.position[0], expected.position[0]));
    for (const b of mixamoBones) {
      const kids = mixamoBones.filter(k => k.parent >= 0 && mixamoBones[k.parent] === b);
      for (const kid of kids) {
        const d = p => { const v = [0, 1, 2].map(k => p.position[kid.target][k] - p.position[b.target][k]), l = Math.hypot(...v); return v.map(x => x / l); };
        const a = d(expected), g = d(got), angle = Math.acos(Math.min(1, a[0] * g[0] + a[1] * g[1] + a[2] * g[2])) * 180 / Math.PI;
        if (kids.length === 1 || ['Spine2', 'Hand', 'Hips'].every(n => !b.name.endsWith(n))) worst = Math.max(worst, angle);
      }
    }
    // Legs and spine share the rest pose with the game skeleton: their full rotation (twist included) is exact.
    for (const name of ['SKEL_L_Thigh', 'SKEL_R_Calf', 'SKEL_L_Foot', 'SKEL_Spine0', 'SKEL_Head']) { const i = male.byName.get(name); worstUnaligned = Math.max(worstUnaligned, angleDegrees(got.rotation[i], expected.rotation[i])); }
  }
  assert.ok(worst < 0.1, `segment direction error ${worst} degrees`);
  assert.ok(worstRoot < 5e-4, `root error ${worstRoot}`);
  assert.ok(worstUnaligned < 0.1, `rotation error ${worstUnaligned}`);
  // Without the alignment the arms keep the A-pose offset: the option does what it says.
  const raw = convertFbxToYcd(fbx, {alignRestPose: false});
  const arm = male.byName.get('SKEL_L_UpperArm'), hand = male.byName.get('SKEL_L_Forearm');
  const direction = p => [0, 1, 2].map(k => p.position[hand][k] - p.position[arm][k]);
  const a = direction(pose(0)), g = direction(outputPose(male, decoded(raw.ycd), 0));
  assert.ok(Math.acos((a[0] * g[0] + a[1] * g[1] + a[2] * g[2]) / (Math.hypot(...a) * Math.hypot(...g))) * 180 / Math.PI > 40);
});

test('fbx -> ycd: takes are listed, selected by name or index, and the first is the default', () => {
  const arm = male.byName.get('SKEL_R_UpperArm'), anim = knownAnimation(male, [arm], {frames: 11});
  const second = {name: 'Second Take', curves: [{model: 'SKEL_Head', channel: 'R', axis: 2, times: [0, 2], values: [0, 45]}]};
  const fbx = fbxFromPoses(male, allBones, anim.pose, anim.rest, {frames: 11, takeName: 'Braço Direito!', extraTakes: [second]});
  const info = inspectFbx(fbx);
  assert.deepEqual(info.takes.map(t => [t.index, t.name, t.frames, t.fps, t.convertible]), [[0, 'Braço Direito!', 11, 30, true], [1, 'Second Take', 61, 30, true]]);
  assert.ok(Math.abs(info.takes[0].duration - 10 / 30) < 1e-9); assert.equal(info.takes[1].duration, 2);
  assert.ok(info.warnings.some(w => w.code === 'FBX_MULTIPLE_TAKES'));
  const first = convertFbxToYcd(fbx);
  assert.equal(first.report.take.name, 'Braço Direito!'); assert.equal(first.report.output.clipName, 'braco_direito');
  assert.ok(warningCodes(first).includes('FBX_MULTIPLE_TAKES'));
  assert.deepEqual(first.report.take.available, ['Braço Direito!', 'Second Take']);
  for (const take of [1, 'Second Take', 'second take']) {
    const r = convertFbxToYcd(fbx, {take});
    assert.equal(r.ok, true); assert.equal(r.report.take.index, 1); assert.equal(r.report.output.frames, 61); assert.equal(r.report.output.clipName, 'second_take');
    assert.ok(!warningCodes(r).includes('FBX_MULTIPLE_TAKES'));
  }
  for (const take of [2, -1, 'missing']) {
    const r = convertFbxToYcd(fbx, {take});
    assert.equal(r.ok, false); assert.equal(r.error.code, ErrorCode.FBX_TAKE_NOT_FOUND); assert.equal(r.ycd, undefined);
    assert.match(r.error.userMessage, /não existe no arquivo/);
  }
});

test('fbx -> ycd: resamples to 30 fps by default, keeps the source rate on request, reports both', () => {
  const head = male.byName.get('SKEL_Head'), frames = 25; // 1 second at 24 fps
  const locals = f => i => (i === head ? qmul(male.bones[head].rotation, qaxis([0, 0, 1], 60 * f / (frames - 1))) : restLocal(male)(i));
  const fbx = fbxFromPoses(male, allBones, f => fk(male, locals(f)), fk(male, restLocal(male)), {frames, fps: 24});
  const r = convertFbxToYcd(fbx);
  assert.equal(r.report.source.fps, 24); assert.equal(r.report.output.fps, 30); assert.equal(r.report.output.frames, 31); assert.equal(r.report.output.duration, 1);
  assert.ok(warningCodes(r).includes('FBX_RESAMPLED'));
  const out = decoded(r.ycd), tag = male.bones[head].tag;
  // A steady turn is steady at any sampling rate: 2 degrees per output frame.
  for (const f of [0, 7, 15, 30]) assert.ok(angleDegrees(out.q(tag, f), qmul(male.bones[head].rotation, qaxis([0, 0, 1], 2 * f))) < 0.05, `frame ${f}`);
  const kept = convertFbxToYcd(fbx, {fps: 'source'});
  assert.equal(kept.report.output.fps, 24); assert.equal(kept.report.output.frames, 25); assert.ok(!warningCodes(kept).includes('FBX_RESAMPLED'));
  assert.equal(convertFbxToYcd(fbx, {fps: 60}).report.output.frames, 61);
  for (const fps of [0, 121, 29.97, 'fast']) assert.equal(convertFbxToYcd(fbx, {fps}).error.code, ErrorCode.INVALID_INPUT);
  // A duration that does not close on whole frames is rounded and reported.
  const odd = buildFbx({models: [{name: 'SKEL_ROOT'}, {name: 'SKEL_Head', parent: 'SKEL_ROOT'}], takes: [{name: 't', curves: [{model: 'SKEL_Head', channel: 'R', axis: 0, times: [0, 0.45], values: [0, 30]}]}]});
  const o = convertFbxToYcd(odd);
  assert.equal(o.report.output.frames, 15); assert.ok(warningCodes(o).includes('FBX_DURATION_ROUNDED'));
});

test('fbx -> ycd: root motion stays in the root by default or goes to the mover track on request', () => {
  const anim = knownAnimation(male, [male.byName.get('SKEL_L_Thigh')], {frames: 31});
  const fbx = fbxFromPoses(male, allBones, anim.pose, anim.rest, {frames: 31});
  const keep = convertFbxToYcd(fbx), mover = convertFbxToYcd(fbx, {rootMotion: true});
  assert.equal(keep.report.rootMotion.mode, 'keep'); assert.equal(mover.report.rootMotion.mode, 'mover');
  assert.ok(Math.abs(keep.report.rootMotion.horizontalTravel - 0.5) < 0.1);
  assert.ok(warningCodes(mover).includes('FBX_ROOT_MOTION_MOVER'));
  const a = decoded(keep.ycd), b = decoded(mover.ycd);
  assert.equal(a.mover, null); assert.equal(a.animation.flags, 0); assert.equal(b.animation.flags, 16); assert.equal(b.animation.hasMoverTracks, true);
  for (let f = 0; f < 31; f++) {
    const total = a.p(0, f), root = b.p(0, f), m = [...b.mover.slice(f * 3, f * 3 + 3)];
    assert.ok(dist(total, [root[0] + m[0], root[1] + m[1], root[2] + m[2]]) < 3e-4);
    assert.ok(Math.abs(m[2]) < 1e-9, 'the mover carries no height');
    assert.ok(Math.hypot(root[0] - b.p(0, 0)[0], root[1] - b.p(0, 0)[1]) < 3e-4, 'the root keeps only height once the mover carries the travel');
  }
  assert.ok(Math.hypot(...b.mover.slice(0, 3)) < 1e-4, 'the mover starts at the origin');
  assert.equal(convertFbxToYcd(fbx, {rootMotion: 'mover'}).report.rootMotion.mode, 'mover');
  assert.equal(convertFbxToYcd(fbx, {rootMotion: 'yes'}).error.code, ErrorCode.INVALID_INPUT);
});

test('fbx -> ycd: manual bone map overrides, excludes and is validated', () => {
  const anim = knownAnimation(male, [male.byName.get('SKEL_R_UpperArm'), male.byName.get('SKEL_L_UpperArm')], {frames: 6});
  const renamed = allBones.map(b => (b.name === 'SKEL_R_UpperArm' ? {...b, name: 'rig:BracoDireito'} : b));
  const fbx = fbxFromPoses(male, renamed, anim.pose, anim.rest, {frames: 6});
  const plain = convertFbxToYcd(fbx);
  assert.deepEqual(plain.report.ignoredBones.map(b => b.source).sort(), ['Armature', 'rig:BracoDireito']);
  assert.ok(warningCodes(plain).includes('FBX_UNMAPPED_BONES'));
  const mapped = convertFbxToYcd(fbx, {boneMap: {BracoDireito: 'SKEL_R_UpperArm', SKEL_L_UpperArm: null}});
  assert.equal(mapped.ok, true, JSON.stringify(mapped.error));
  assert.deepEqual(mapped.report.mappedBones.find(b => b.target === 'SKEL_R_UpperArm'), {source: 'rig:BracoDireito', target: 'SKEL_R_UpperArm', tag: 40269, via: 'manual'});
  assert.deepEqual(mapped.report.ignoredBones.find(b => b.reason === 'excluded'), {source: 'SKEL_L_UpperArm', reason: 'excluded'});
  const out = decoded(mapped.ycd);
  assert.ok(angleDegrees(out.q(40269, 3), anim.locals(3)(male.byName.get('SKEL_R_UpperArm'))) < 0.05);
  // The excluded bone sits above mapped ones, so it is pinned to rest instead of animated.
  assert.ok(mapped.report.pinnedBones.includes('SKEL_L_UpperArm'));
  for (const boneMap of [{Nope: 'SKEL_Head'}, {SKEL_Head: 'SKEL_Nope'}, ['SKEL_Head'], 'text']) {
    const r = convertFbxToYcd(fbx, {boneMap});
    assert.equal(r.ok, false); assert.equal(r.error.code, ErrorCode.BONE_MAP_INVALID);
  }
  // Two source bones claiming one target: the exact name wins and the other is reported.
  const twins = fbxFromPoses(male, [...allBones, {name: 'mixamorig:Head', parent: male.byName.get('SKEL_Neck_1'), target: male.byName.get('SKEL_Head')}], anim.pose, anim.rest, {frames: 6});
  const t = convertFbxToYcd(twins);
  assert.deepEqual(t.report.ignoredBones.find(b => b.reason === 'duplicate'), {source: 'mixamorig:Head', reason: 'duplicate', target: 'SKEL_Head', kept: 'SKEL_Head'});
  assert.ok(warningCodes(t).includes('FBX_DUPLICATE_BONE_MATCH'));
});

test('fbx -> ycd: refusals are values with stable codes and plain pt-BR text; nothing partial is returned', () => {
  const two = (name, extra = {}) => ({models: [{name: 'SKEL_ROOT'}, {name, parent: 'SKEL_ROOT'}], takes: [{name: 't', curves: [{model: name, channel: 'R', axis: 0, times: [0, 1], values: [0, 30]}]}], ...extra});
  const refused = (fbx, code, options, pattern) => {
    const r = convertFbxToYcd(fbx, options);
    assert.equal(r.ok, false); assert.equal(r.error.code, code); assert.equal(r.ycd, undefined); assert.equal(r.report, undefined);
    assert.equal(typeof r.error.userMessage, 'string'); assert.ok(r.error.userMessage.length > 10);
    if (pattern) assert.match(r.error.userMessage, pattern);
    assert.doesNotMatch(r.error.userMessage, /undefined|NaN|\[object/);
    return r;
  };
  refused(new Uint8Array([1, 2, 3]), ErrorCode.FBX_INVALID, {}, /não é um FBX válido/);
  refused(buildFbx({...two('SKEL_Head'), version: 7400}).map((b, i) => (i === 23 ? 0xd4 : i === 24 ? 0x17 : b)), ErrorCode.FBX_UNSUPPORTED_VERSION, {}, /6\.1/);
  refused(buildFbx({models: [{name: 'Cube', type: 'Mesh'}]}), ErrorCode.FBX_NO_SKELETON);
  refused(buildFbx({models: [{name: 'SKEL_ROOT'}]}), ErrorCode.FBX_NO_ANIMATION, {}, /não tem animação/);
  refused(buildFbx({models: [{name: 'SKEL_ROOT'}], takes: [{name: 'empty', curves: []}]}), ErrorCode.FBX_NO_ANIMATION);
  const emptyTake = inspectFbx(buildFbx({models: [{name: 'SKEL_ROOT'}], takes: [{name: 'empty', curves: []}]})).takes[0];
  assert.deepEqual([emptyTake.frames, emptyTake.duration, emptyTake.convertible, emptyTake.issue.code], [2, 0, false, ErrorCode.FBX_NO_ANIMATION]);
  refused(buildFbx(two('Bone007')).map(b => b), ErrorCode.BONE_MAP_INSUFFICIENT, {boneMap: {SKEL_ROOT: null}}, /Nenhum osso/);
  // 61 seconds at 30 fps = 1831 frames: beyond the single block the writer is proven for.
  const long = buildFbx({models: [{name: 'SKEL_ROOT'}, {name: 'SKEL_Head', parent: 'SKEL_ROOT'}], takes: [{name: 't', curves: [{model: 'SKEL_Head', channel: 'R', axis: 0, times: [0, 61], values: [0, 30]}]}]});
  const tooLong = refused(long, ErrorCode.ANIMATION_TOO_LONG, {}, /1831 quadros.*1800 quadros/);
  assert.deepEqual([tooLong.error.details.frames, tooLong.error.details.max], [1831, 1800]);
  assert.equal(convertFbxToYcd(long, {fps: 24}).ok, true, 'the same take fits at a lower rate');
  assert.equal(inspectFbx(long).takes[0].issue.code, ErrorCode.ANIMATION_TOO_LONG); assert.equal(inspectFbx(long).convertible, false);
  // Two animated layers would need blending: refused, never guessed.
  const curve = {model: 'SKEL_Head', channel: 'R', axis: 0, times: [0, 1], values: [0, 30]};
  refused(buildFbx({models: [{name: 'SKEL_ROOT'}, {name: 'SKEL_Head', parent: 'SKEL_ROOT'}], takes: [{name: 't', layers: [[curve], [{...curve, axis: 1}]]}]}), ErrorCode.FBX_UNSUPPORTED_FEATURE, {}, /camada/);
  // Mirrored hierarchy (negative scale).
  refused(buildFbx({models: [{name: 'Armature', type: 'Null', scaling: [-1, 1, 1]}, {name: 'SKEL_ROOT', parent: 'Armature'}, {name: 'SKEL_Head', parent: 'SKEL_ROOT'}], takes: [{name: 't', curves: [curve]}]}), ErrorCode.FBX_UNSUPPORTED_FEATURE, {}, /espelhado/);
  refused(buildFbx(two('SKEL_Head')), ErrorCode.SKELETON_INVALID, {skeleton: 'horse'});
  refused(buildFbx(two('SKEL_Head')), ErrorCode.INPUT_TOO_LARGE, {limits: {maxFbxBytes: 100}}, /grande demais/);
  const aborted = AbortSignal.abort();
  refused(buildFbx(two('SKEL_Head')), ErrorCode.CANCELLED, {signal: aborted});
  assert.equal(inspectFbx(buildFbx(two('SKEL_Head')), {signal: aborted}).error.code, ErrorCode.CANCELLED);
  assert.equal(inspectFbx('nope').error.code, ErrorCode.INVALID_INPUT);
  // Inspect never fails just because a file cannot be converted: it explains why.
  const mesh = inspectFbx(buildFbx({models: [{name: 'Cube', type: 'Mesh'}]}));
  assert.equal(mesh.ok, true); assert.equal(mesh.convertible, false);
  assert.deepEqual(mesh.issues.map(i => i.code), [ErrorCode.FBX_NO_SKELETON, ErrorCode.FBX_NO_ANIMATION]);
  assert.ok(mesh.issues.every(i => i.message.length > 10));
});

test('fbx -> ycd: sparse curves, TCB keys, scale and stretch are reported instead of silently approximated', () => {
  const slopes = new Float32Array([0, 12, 0, 0]);
  const base = {models: [{name: 'SKEL_ROOT'}, {name: 'SKEL_Spine0', parent: 'SKEL_ROOT', translation: [0, 10, 0]}, {name: 'SKEL_Head', parent: 'SKEL_Spine0', translation: [0, 50, 0]}]};
  const take = curves => buildFbx({...base, takes: [{name: 't', curves}]});
  const cubic = convertFbxToYcd(take([{model: 'SKEL_Head', channel: 'R', axis: 2, times: [0, 2], values: [0, 8], flags: [0x8], data: [...slopes], refs: [2]}]));
  assert.ok(warningCodes(cubic).includes('FBX_SPARSE_CUBIC_KEYS')); assert.equal(cubic.report.source.cubicKeys, 2); assert.equal(cubic.report.source.bakedKeys, false);
  // The cubic segment is honoured: v(t) = t^3 degrees about Z, so half way the head has turned 1 degree, not 4.
  const out = decoded(cubic.ycd), tag = 31086, rel = f => angleDegrees(out.q(tag, f), out.q(tag, 0));
  assert.ok(Math.abs(rel(30) - 1) < 0.05, `cubic midpoint ${rel(30)}`); assert.ok(Math.abs(rel(60) - 8) < 0.05);
  const tcb = convertFbxToYcd(take([{model: 'SKEL_Head', channel: 'R', axis: 2, times: [0, 2], values: [0, 8], flags: [0x8 | 0x200], refs: [2]}]));
  assert.ok(warningCodes(tcb).includes('FBX_TCB_AS_LINEAR')); assert.ok(!warningCodes(tcb).includes('FBX_SPARSE_CUBIC_KEYS'));
  const linear = convertFbxToYcd(take([{model: 'SKEL_Head', channel: 'R', axis: 2, times: [0, 2], values: [0, 8]}]));
  assert.ok(!warningCodes(linear).some(c => /CUBIC|TCB/.test(c)));
  const scaled = convertFbxToYcd(take([{model: 'SKEL_Head', channel: 'R', axis: 2, times: [0, 1], values: [0, 8]}, {model: 'SKEL_Head', channel: 'S', axis: 0, times: [0, 1], values: [1, 2], defaults: [1, 1, 1]}, {model: 'SKEL_Head', channel: 'T', axis: 1, times: [0, 1], values: [50, 80], defaults: [0, 50, 0]}]));
  assert.ok(warningCodes(scaled).includes('FBX_SCALE_ANIMATION_IGNORED')); assert.ok(warningCodes(scaled).includes('FBX_BONE_TRANSLATION_IGNORED'));
  assert.ok(warningCodes(scaled).includes('FBX_SCALE_FROM_UNITS')); assert.ok(warningCodes(scaled).includes('FBX_ORIENTATION_ASSUMED')); assert.ok(warningCodes(scaled).includes('FBX_FEW_BONES_MAPPED'));
  // Every warning has a known code, a level and a readable sentence.
  for (const r of [cubic, tcb, scaled]) for (const w of r.report.warnings) {
    assert.ok(FBX_WARNING_CODES.includes(w.code)); assert.ok(['info', 'warning'].includes(w.level));
    assert.ok(w.message.length > 20); assert.doesNotMatch(w.message, /undefined|NaN|\[object/);
  }
  // A single pose (no duration) still converts, as a two-frame hold, with a warning.
  const still = convertFbxToYcd(take([{model: 'SKEL_Head', channel: 'R', axis: 2, times: [0], values: [20]}]));
  assert.equal(still.ok, true); assert.equal(still.report.output.frames, 2); assert.ok(warningCodes(still).includes('FBX_STATIC_POSE'));
});

test('fbx -> ycd: the longest supported take (1800 frames, every bone) converts and stays within tolerance', () => {
  const animated = male.bones.map((_, i) => i), frames = 1800;
  const anim = knownAnimation(male, animated, {frames, amplitude: 25});
  const fbx = fbxFromPoses(male, allBones, anim.pose, anim.rest, {frames, compress: true});
  const started = performance.now(), r = convertFbxToYcd(fbx, {clipName: 'longest'});
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.report.output.frames, 1800); assert.ok(Math.abs(r.report.output.duration - 1799 / 30) < 1e-9);
  assert.ok(r.report.verification.maxAngleError < 2.5e-4);
  const out = decoded(r.ycd);
  for (const f of [0, 1, 899, 1799]) { const locals = anim.locals(f); male.bones.forEach((b, i) => assert.ok(angleDegrees(out.q(b.tag, f), locals(i)) < 0.05)); }
  assert.ok(performance.now() - started < 30000);
});

test('fbx -> ycd: target skeleton can be female, .skel text or explicit data; clip names are made safe', () => {
  const female = resolveSkeleton('female').skel;
  assert.equal(female.bones.length, 128); assert.equal(resolveSkeleton('mp_f_freemode_01').id, 'mp_f_freemode_01'); assert.equal(resolveSkeleton().id, 'mp_m_freemode_01');
  const bonesF = female.bones.map((b, i) => ({name: b.name, parent: b.parent, target: i}));
  const anim = knownAnimation(female, [female.byName.get('SKEL_L_Forearm'), female.byName.get('SKEL_Spine2')], {frames: 8});
  const fbx = fbxFromPoses(female, bonesF, anim.pose, anim.rest, {frames: 8});
  const r = convertFbxToYcd(fbx, {skeleton: 'female', clipName: 'Dança Nova 01.fbx'});
  assert.equal(r.report.skeleton.id, 'mp_f_freemode_01'); assert.equal(r.report.output.clipName, 'danca_nova_01_fbx');
  assert.ok(warningCodes(r).includes('CLIP_NAME_ADJUSTED'));
  assertMatchesKnown(female, anim, decoded(r.ycd));
  const custom = convertFbxToYcd(fbx, {skeleton: {bones: female.bones.map(b => ({name: b.name, tag: b.tag, parent: b.parent, rotation: b.rotation, translation: b.translation}))}, clipName: 'ok_name@1'});
  assert.equal(custom.ok, true); assert.equal(custom.report.skeleton.id, 'custom'); assert.ok(!warningCodes(custom).includes('CLIP_NAME_ADJUSTED'));
  assert.deepEqual([...custom.ycd], [...convertFbxToYcd(fbx, {skeleton: 'female', clipName: 'ok_name@1'}).ycd], 'same data, same bytes');
  assert.equal(clipNameFrom('  ___ '), 'animacao'); assert.equal(clipNameFrom('A'.repeat(100)).length, 64); assert.equal(clipNameFrom('mixamo.com'), 'mixamo_com');
  // The reference pose faces +Y with the left side at -X (the .skel root half turn is not part of animations).
  const rest = targetRest(male), L = male.byName.get('SKEL_L_Thigh'), toe = male.byName.get('SKEL_L_Toe0'), foot = male.byName.get('SKEL_L_Foot');
  assert.ok(rest.position[L][0] < -0.05); assert.ok(rest.position[toe][1] > rest.position[foot][1] + 0.1);
  assert.ok(rest.position[male.byName.get('SKEL_Head')][2] > 0.5);
  assert.ok(fbxBoneAliases().some(([k, v]) => k === 'leftupleg' && v === 'SKEL_L_Thigh'));
  // ArrayBuffer input is accepted like Uint8Array.
  assert.equal(convertFbxToYcd(fbx.buffer.slice(fbx.byteOffset, fbx.byteOffset + fbx.byteLength), {skeleton: 'female'}).ok, true);
  void qrot;
});
