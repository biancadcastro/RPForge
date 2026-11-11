// FBX scene -> skeletal profile input (`ycd-skel-v1`). See docs/animation-engine/FBX-AND-RETARGET.md.
//
// The conversion works in world space, so it does not depend on how each program orients
// the local axes of a bone:
//   1. evaluate the FBX hierarchy (full transform chain) at rest and at every output frame;
//   2. change basis from the FBX world to the game's model space with a pure rotation C
//      (up axis from GlobalSettings; quarter-turn about it chosen so the left side of the
//      rest character lands on the left side of the target skeleton) and a uniform scale;
//   3. for each mapped bone, take its world rotation relative to its own rest pose and apply
//      that same world rotation to the target bone's rest orientation (after an optional
//      rest-pose alignment, for rigs whose rest pose differs from the game's);
//   4. express the result in the target parent's space: that is the bone's YCD rotation.
// Target bones without a source keep their rest rotation relative to their parent.
import {ErrorCode, ensure} from './errors.js';
import {multiply, rotate} from './quat.js';
import {validateSkeleton, parseSkel} from './skeleton.js';
import {PROFILE_LIMITS} from './ycd-write.js';
import {FREEMODE_MALE, FREEMODE_FEMALE} from './freemode-skeletons.js';
import {prepareTake, worldTransforms, localTransform} from './fbx-scene.js';
import {mapBones} from './fbx-bone-map.js';
import {warning} from './fbx-messages.js';
import {affineMul, rotationOf, quatFromMatrix, conjugate, shortestArc, mulVec3, sub, dot3, cross, scale as scale3, normalize3, length3} from './fbx-math.js';

export const FBX_PROFILE_ID = 'fbx-skel-v1';
export const DEFAULT_FPS = 30;
const IDENTITY = [0, 0, 0, 1];
const SIDE_PAIRS = [['SKEL_L_Thigh', 'SKEL_R_Thigh'], ['SKEL_L_UpperArm', 'SKEL_R_UpperArm'], ['SKEL_L_Clavicle', 'SKEL_R_Clavicle'], ['SKEL_L_Calf', 'SKEL_R_Calf'], ['SKEL_L_Foot', 'SKEL_R_Foot'], ['SKEL_L_Hand', 'SKEL_R_Hand']];
const LEGS = [['SKEL_L_Thigh', 'SKEL_L_Calf', 'SKEL_L_Foot'], ['SKEL_R_Thigh', 'SKEL_R_Calf', 'SKEL_R_Foot']];
// Which child gives a bone its direction when several mapped bones hang from it.
const DIRECTION_CHILD = {SKEL_Spine0: 'SKEL_Spine1', SKEL_Spine1: 'SKEL_Spine2', SKEL_Spine2: 'SKEL_Spine3', SKEL_Spine3: 'SKEL_Neck_1', SKEL_Neck_1: 'SKEL_Head', SKEL_L_Hand: 'SKEL_L_Finger20', SKEL_R_Hand: 'SKEL_R_Finger20', SKEL_L_Foot: 'SKEL_L_Toe0', SKEL_R_Foot: 'SKEL_R_Toe0'};
// Bones that never get a rest-pose alignment: the body's overall orientation comes from them.
const NO_ALIGNMENT = new Set(['SKEL_ROOT', 'SKEL_Pelvis', 'SKEL_Spine_Root']);

const skeletonCache = new Map();
function bundled(id, rows) {
  if (!skeletonCache.has(id)) skeletonCache.set(id, validateSkeleton({bones: rows.map(r => ({name: r[0], tag: r[1], parent: r[2], rotation: r.slice(3, 7), translation: r.slice(7, 10), scale: [1, 1, 1], flags: []}))}));
  return skeletonCache.get(id);
}
/** Target skeleton: 'male' (default) | 'female' | ped model name | `.skel` text | {bones:[...]}. */
export function resolveSkeleton(skeleton) {
  if (skeleton === undefined || skeleton === null || skeleton === 'male' || skeleton === 'mp_m_freemode_01') return {id: 'mp_m_freemode_01', skel: bundled('m', FREEMODE_MALE)};
  if (skeleton === 'female' || skeleton === 'mp_f_freemode_01') return {id: 'mp_f_freemode_01', skel: bundled('f', FREEMODE_FEMALE)};
  if (typeof skeleton === 'string') { ensure(/^\s*Version\s/.test(skeleton), ErrorCode.SKELETON_INVALID, 'Unknown skeleton name'); return {id: 'custom', skel: parseSkel(skeleton)}; }
  ensure(typeof skeleton === 'object' && Array.isArray(skeleton.bones), ErrorCode.SKELETON_INVALID, 'Skeleton must be a name, .skel text or {bones}');
  return {id: 'custom', skel: skeleton.byTag && skeleton.order ? skeleton : validateSkeleton(skeleton)};
}

/**
 * Rest pose of the target in the game's model space. The root's animated rotation is the
 * identity when the ped stands in its bind pose facing +Y (101 real emotes agree), while
 * the openFormats `.skel` stores a half turn there; so the root is taken as identity.
 */
export function targetRest(skel) {
  const n = skel.bones.length, rotation = new Array(n), position = new Array(n);
  for (const i of skel.order) {
    const b = skel.bones[i];
    if (b.parent < 0) { rotation[i] = IDENTITY; position[i] = b.translation; continue; }
    rotation[i] = multiply(rotation[b.parent], b.rotation);
    const o = rotate(rotation[b.parent], b.translation), p = position[b.parent];
    position[i] = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
  }
  return {rotation, position};
}

export function selectTake(scene, take) {
  ensure(scene.takes.length > 0, ErrorCode.FBX_NO_ANIMATION, 'FBX file has no animation take');
  const available = scene.takes.map(t => t.name).slice(0, 32);
  if (take === undefined || take === null) return scene.takes[0];
  if (typeof take === 'number') { ensure(Number.isInteger(take) && take >= 0 && take < scene.takes.length, ErrorCode.FBX_TAKE_NOT_FOUND, 'Take index out of range', {take, available}); return scene.takes[take]; }
  ensure(typeof take === 'string', ErrorCode.INVALID_INPUT, 'take must be a name or an index');
  const found = scene.takes.find(t => t.name === take) ?? scene.takes.find(t => t.name.toLowerCase() === take.toLowerCase());
  ensure(found, ErrorCode.FBX_TAKE_NOT_FOUND, 'Take not found', {take: take.slice(0, 64), available});
  return found;
}

/** Game clip name from free text: lower case, [a-z0-9_@-], at most 64 characters. */
export function clipNameFrom(text, fallback = 'animacao') {
  const clean = String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_@-]+/g, '_').replace(/^[^a-z0-9]+/, '').replace(/_+$/, '').slice(0, 64);
  return clean || fallback;
}

/** Output timing of a prepared take: {fps, frames, duration, sourceDuration}. */
export function timing(prepared, sourceFps, fpsOption) {
  let fps = DEFAULT_FPS;
  if (fpsOption === 'source') fps = Math.round(sourceFps);
  else if (fpsOption !== undefined && fpsOption !== null) fps = fpsOption;
  ensure(Number.isInteger(fps) && fps >= 1 && fps <= PROFILE_LIMITS.maxFps, ErrorCode.INVALID_INPUT, 'fps must be an integer between 1 and 120, or "source"', {fps});
  const span = prepared.stop - prepared.start, sourceDuration = Number.isFinite(span) && span > 0 ? span : 0; // a take without keys has no range
  const frames = Math.max(PROFILE_LIMITS.minFrames, Math.round(sourceDuration * fps) + 1);
  return {fps, frames, duration: (frames - 1) / fps, sourceDuration};
}

function snapHorizontal(vector, up) {
  // Nearest signed axis perpendicular to `up`; also returns how far the vector was from it.
  const flat = normalize3(sub(vector, scale3(up, dot3(vector, up))));
  let best = null, bestDot = -Infinity;
  for (let axis = 0; axis < 3; axis++) for (const sign of [1, -1]) {
    const e = [0, 0, 0]; e[axis] = sign;
    if (Math.abs(dot3(e, up)) > 0.5) continue;
    const d = dot3(e, flat);
    if (d > bestDot) { bestDot = d; best = e; }
  }
  return {axis: best, degrees: Math.acos(Math.min(1, Math.max(-1, bestDot))) * 180 / Math.PI, valid: length3(flat) > 0};
}

/**
 * Convert one take. Returns {input (profile animation for the YCD writer), report}.
 * options: {take, clipName, rootMotion, boneMap, fps, alignRestPose, signal}
 */
export function convertScene(scene, {skel, id: skeletonId}, options = {}) {
  const warnings = [];
  const checkSignal = () => { if (options.signal?.aborted) ensure(false, ErrorCode.CANCELLED, 'Operation cancelled'); };
  ensure(scene.models.some(m => m.isBoneCandidate), ErrorCode.FBX_NO_SKELETON, 'FBX file has no bones');
  const take = selectTake(scene, options.take), prepared = prepareTake(scene, take);
  ensure(prepared.hasCurves, ErrorCode.FBX_NO_ANIMATION, 'Selected take has no animation curves', {take: take.name});
  ensure(prepared.stats.extraLayers === 0, ErrorCode.FBX_UNSUPPORTED_FEATURE, 'Take uses several animation layers', {feature: 'layers', take: take.name});
  if (scene.takes.length > 1 && (options.take === undefined || options.take === null)) warnings.push(warning('FBX_MULTIPLE_TAKES', {count: scene.takes.length, used: take.name}));

  const rootMotion = options.rootMotion === true ? 'mover' : (options.rootMotion === false || options.rootMotion === undefined || options.rootMotion === null ? 'keep' : options.rootMotion);
  ensure(rootMotion === 'keep' || rootMotion === 'mover', ErrorCode.INVALID_INPUT, 'rootMotion must be true/false, "keep" or "mover"');

  // --- mapping -----------------------------------------------------------------
  const mapping = mapBones(scene, skel, options.boneMap);
  ensure(mapping.pairs.length > 0, ErrorCode.BONE_MAP_INSUFFICIENT, 'No FBX bone matches the target skeleton', {sourceBones: scene.models.filter(m => m.isBoneCandidate).slice(0, 24).map(m => m.name)});
  const bones = skel.bones, n = bones.length, source = new Int32Array(n).fill(-1);
  for (const p of mapping.pairs) source[p.target] = p.source;
  if (mapping.unmapped.length) warnings.push(warning('FBX_UNMAPPED_BONES', {count: mapping.unmapped.length}));
  if (mapping.conflicts.length) warnings.push(warning('FBX_DUPLICATE_BONE_MATCH', {count: mapping.conflicts.length}));
  if (mapping.pairs.length < 8) warnings.push(warning('FBX_FEW_BONES_MAPPED', {count: mapping.pairs.length}));

  // --- timing ------------------------------------------------------------------
  const time = timing(prepared, scene.settings.fps, options.fps);
  ensure(time.frames <= PROFILE_LIMITS.maxFrames, ErrorCode.ANIMATION_TOO_LONG, 'Animation has more frames than the write profile holds', {frames: time.frames, max: PROFILE_LIMITS.maxFrames, seconds: time.sourceDuration, maxSeconds: (PROFILE_LIMITS.maxFrames - 1) / time.fps, fps: time.fps});
  if (!(time.sourceDuration > 0)) warnings.push(warning('FBX_STATIC_POSE'));
  else {
    if (Math.abs(scene.settings.fps - time.fps) > 0.01) warnings.push(warning('FBX_RESAMPLED', {sourceFps: +scene.settings.fps.toFixed(3), fps: time.fps}));
    if (Math.abs(time.sourceDuration - time.duration) > 1e-3) warnings.push(warning('FBX_DURATION_ROUNDED', {sourceDuration: time.sourceDuration, duration: time.duration}));
  }

  // --- source rest pose --------------------------------------------------------
  const needed = new Uint8Array(scene.models.length);
  for (const p of mapping.pairs) for (let i = p.source; i >= 0 && !needed[i]; i = scene.models[i].parent) needed[i] = 1;
  const list = scene.order.filter(i => needed[i]);
  const rest = new Map();
  let fromBind = 0;
  for (const i of list) {
    const model = scene.models[i], bind = scene.bindPose.get(i);
    if (bind) { rest.set(i, bind); if (mapping.pairs.some(p => p.source === i)) fromBind++; continue; }
    const local = localTransform(model, model.translation, model.rotation, model.scaling);
    rest.set(i, model.parent >= 0 ? affineMul(rest.get(model.parent), local) : local);
  }
  const restPose = fromBind === mapping.pairs.length ? 'bindPose' : fromBind === 0 ? 'defaultPose' : 'mixed';
  if (restPose !== 'bindPose') warnings.push(warning('FBX_REST_FROM_DEFAULTS'));
  const ignoredPre = list.filter(i => scene.models[i].ignoredPreRotation).length;
  if (ignoredPre) warnings.push(warning('FBX_PRE_ROTATION_INACTIVE', {count: ignoredPre}));
  const mirrored = () => ensure(false, ErrorCode.FBX_UNSUPPORTED_FEATURE, 'FBX hierarchy is mirrored (negative scale)', {feature: 'mirroredTransform'});
  const restRotation = new Map();
  for (const p of mapping.pairs) { const r = rotationOf(rest.get(p.source).m); if (r.mirrored) mirrored(); restRotation.set(p.source, r.q); }
  const restPosition = t => rest.get(source[t]).t;

  // --- target rest pose, axes and scale ------------------------------------------
  const target = targetRest(skel);
  const index = name => skel.byName.get(name) ?? -1;
  const mapped = name => { const i = index(name); return i >= 0 && source[i] >= 0 ? i : -1; };
  const {settings} = scene;
  const upSource = [0, 0, 0]; upSource[settings.upAxis] = settings.upAxisSign;
  const upTarget = [0, 0, 1];
  let leftTarget = [-1, 0, 0];
  for (const [l, r] of SIDE_PAIRS) { const a = index(l), b = index(r); if (a >= 0 && b >= 0) { const s = snapHorizontal(sub(target.position[a], target.position[b]), upTarget); if (s.valid) { leftTarget = s.axis; break; } } }
  let leftSource = null, orientation = 'bones', restYawError = 0;
  for (const [l, r] of SIDE_PAIRS) {
    const a = mapped(l), b = mapped(r);
    if (a < 0 || b < 0) continue;
    const s = snapHorizontal(sub(restPosition(a), restPosition(b)), upSource);
    if (!s.valid) continue;
    leftSource = s.axis; restYawError = s.degrees; break;
  }
  if (!leftSource) {
    orientation = 'declared';
    const front = [0, 0, 0]; front[settings.frontAxis] = settings.frontAxisSign;
    leftSource = cross(upSource, front); // character faces the front axis
    warnings.push(warning('FBX_ORIENTATION_ASSUMED'));
  } else if (restYawError > 15) warnings.push(warning('FBX_REST_NOT_AXIS_ALIGNED', {degrees: restYawError}));
  const forwardSource = cross(leftSource, upSource), forwardTarget = cross(leftTarget, upTarget);
  const C = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = leftTarget[r] * leftSource[c] + upTarget[r] * upSource[c] + forwardTarget[r] * forwardSource[c];
  const Cq = quatFromMatrix(C), CqInverse = conjugate(Cq);

  let unit = settings.unitScaleFactor / 100, scaleSource = 'units';
  {
    let sum = 0, sumTarget = 0;
    for (const chain of LEGS) {
      const [a, b, c] = chain.map(mapped);
      if (a < 0 || b < 0 || c < 0) continue;
      sum += length3(sub(restPosition(a), restPosition(b))) + length3(sub(restPosition(b), restPosition(c)));
      sumTarget += length3(sub(target.position[a], target.position[b])) + length3(sub(target.position[b], target.position[c]));
    }
    if (sum > 1e-9 && sumTarget > 0) { unit = sumTarget / sum; scaleSource = 'legs'; }
    else warnings.push(warning('FBX_SCALE_FROM_UNITS'));
  }

  // --- rest-pose alignment -------------------------------------------------------
  // For a mapped bone with one clear mapped child, rotate the target rest so the bone points
  // where the source bone points at rest. Identity when both rigs share the rest pose.
  const align = options.alignRestPose !== false;
  const nearestMapped = (t, out = []) => { for (let c = 0; c < n; c++) if (bones[c].parent === t) { if (source[c] >= 0) out.push(c); else nearestMapped(c, out); } return out; };
  const post = new Array(n); // per mapped target bone: restSource^-1 * C^-1 * alignment * restTarget
  let alignedBones = 0, maxAlignment = 0;
  for (const p of mapping.pairs) {
    const t = p.target;
    let alignment = IDENTITY;
    if (align && !NO_ALIGNMENT.has(bones[t].name)) {
      const kids = nearestMapped(t), preferred = index(DIRECTION_CHILD[bones[t].name]);
      const kid = kids.length === 1 ? kids[0] : (kids.includes(preferred) ? preferred : -1);
      if (kid >= 0) {
        const from = sub(target.position[kid], target.position[t]), to = mulVec3(C, sub(restPosition(kid), restPosition(t)));
        if (length3(from) > 1e-6 && length3(to) * unit > 1e-6) {
          alignment = shortestArc(normalize3(from), normalize3(to));
          const degrees = 2 * Math.acos(Math.min(1, Math.abs(alignment[3]))) * 180 / Math.PI;
          if (degrees > 2) { alignedBones++; maxAlignment = Math.max(maxAlignment, degrees); }
        }
      }
    }
    post[t] = multiply(multiply(multiply(conjugate(restRotation.get(p.source)), CqInverse), alignment), target.rotation[t]);
  }
  if (alignedBones) warnings.push(warning('FBX_REST_POSE_ALIGNED', {count: alignedBones, maxDegrees: maxAlignment}));

  // --- which target bones get a track --------------------------------------------
  // Mapped bones, plus every unmapped bone above a mapped one (pinned to its rest rotation
  // so the result does not depend on whatever pose the game had before), plus the root.
  const written = new Uint8Array(n);
  for (const p of mapping.pairs) for (let i = p.target; i >= 0 && !written[i]; i = bones[i].parent) written[i] = 1;
  const rootIndex = skel.order[0];
  written[rootIndex] = 1;
  const trackBones = skel.order.filter(i => written[i]);
  const rotations = new Map(trackBones.map(i => [i, new Float64Array(time.frames * 4)]));
  const driver = skel.order.find(i => source[i] >= 0); // root-most mapped bone moves the body
  const driverIsHips = driver === rootIndex || bones[driver].parent === rootIndex;
  if (!driverIsHips) warnings.push(warning('FBX_NO_HIPS'));
  const rootRest = bones[rootIndex].translation, driverRest = rest.get(source[driver]).t;
  const rootPosition = new Float64Array(time.frames * 3);

  // --- frames ----------------------------------------------------------------------
  const world = new Map(), worldRotation = new Array(n);
  for (let f = 0; f < time.frames; f++) {
    if ((f & 63) === 0) checkSignal();
    const t = Math.min(prepared.start + f / time.fps, Math.max(prepared.stop, prepared.start));
    worldTransforms(scene, list, prepared, t, world);
    for (const i of skel.order) {
      const b = bones[i];
      if (source[i] >= 0) {
        const r = rotationOf(world.get(source[i]).m);
        if (r.mirrored) mirrored();
        worldRotation[i] = multiply(multiply(Cq, r.q), post[i]);
      } else worldRotation[i] = b.parent < 0 ? IDENTITY : multiply(worldRotation[b.parent], b.rotation);
      const track = rotations.get(i);
      if (track) track.set(b.parent < 0 ? worldRotation[i] : multiply(conjugate(worldRotation[b.parent]), worldRotation[i]), f * 4);
    }
    if (driverIsHips) {
      const d = mulVec3(C, sub(world.get(source[driver]).t, driverRest));
      rootPosition[f * 3] = rootRest[0] + d[0] * unit; rootPosition[f * 3 + 1] = rootRest[1] + d[1] * unit; rootPosition[f * 3 + 2] = rootRest[2] + d[2] * unit;
    } else rootPosition.set(rootRest, f * 3);
  }
  checkSignal();

  // --- root motion -------------------------------------------------------------------
  let travel = 0;
  for (let f = 1; f < time.frames; f++) travel = Math.max(travel, Math.hypot(rootPosition[f * 3] - rootPosition[0], rootPosition[f * 3 + 1] - rootPosition[1]));
  const tracks = [];
  if (rootMotion === 'mover') {
    const mover = new Float64Array(time.frames * 3);
    for (let f = 0; f < time.frames; f++) {
      mover[f * 3] = rootPosition[f * 3] - rootPosition[0]; mover[f * 3 + 1] = rootPosition[f * 3 + 1] - rootPosition[1];
      rootPosition[f * 3] -= mover[f * 3]; rootPosition[f * 3 + 1] -= mover[f * 3 + 1];
    }
    tracks.push({bone: 0, type: 'moverPosition', values: mover});
    warnings.push(warning('FBX_ROOT_MOTION_MOVER', {distance: travel}));
  } else if (travel > 0.5) warnings.push(warning('FBX_ROOT_TRAVEL', {distance: travel}));
  tracks.push({bone: bones[rootIndex].tag, type: 'position', values: rootPosition});
  for (const i of trackBones) tracks.push({bone: bones[i].tag, type: 'rotation', values: rotations.get(i)});

  // --- things the game will not receive ----------------------------------------------
  const varies = (entry, tolerance) => entry?.curves.some(c => { if (!c) return false; let lo = Infinity, hi = -Infinity; for (const v of c.values) { if (v < lo) lo = v; if (v > hi) hi = v; } return hi - lo > tolerance; });
  let scaled = 0, stretched = 0;
  for (const i of list) {
    const ch = prepared.channels.get(i);
    if (varies(ch?.S, 1e-3)) scaled++;
    if (i !== source[driver] && mapping.pairs.some(p => p.source === i) && varies(ch?.T, 0.002 / unit)) stretched++;
  }
  if (scaled) warnings.push(warning('FBX_SCALE_ANIMATION_IGNORED', {count: scaled}));
  if (stretched) warnings.push(warning('FBX_BONE_TRANSLATION_IGNORED', {count: stretched}));
  const {stats} = prepared;
  const sparse = stats.minKeySpacing > 1.5 / time.fps;
  if (stats.tcbKeys) warnings.push(warning('FBX_TCB_AS_LINEAR'));
  if (stats.cubicKeys && sparse) warnings.push(warning('FBX_SPARSE_CUBIC_KEYS'));

  let name = options.clipName;
  if (name === undefined || name === null || name === '') name = clipNameFrom(take.name.split('|').pop() || take.name); // Blender names takes "Object|Action"
  else { ensure(typeof name === 'string', ErrorCode.INVALID_INPUT, 'clipName must be text'); const clean = clipNameFrom(name); if (clean !== name) warnings.push(warning('CLIP_NAME_ADJUSTED', {name: clean})); name = clean; }

  const pinned = trackBones.filter(i => source[i] < 0).map(i => bones[i].name);
  const report = {
    profile: FBX_PROFILE_ID,
    skeleton: {id: skeletonId, bones: n},
    take: {index: take.index, name: take.name, available: scene.takes.map(t => t.name)},
    source: {format: scene.format, version: scene.version, fps: scene.settings.fps, duration: time.sourceDuration, start: prepared.start, rangeFrom: prepared.rangeSource, curves: stats.curves, keys: stats.keys, cubicKeys: stats.cubicKeys, constantKeys: stats.constantKeys, tcbKeys: stats.tcbKeys, bakedKeys: !sparse},
    output: {clipName: name, fps: time.fps, frames: time.frames, duration: time.duration, tracks: tracks.length},
    mappedBones: mapping.pairs.map(p => ({source: p.sourceName, target: p.targetName, tag: p.tag, via: p.via})),
    ignoredBones: [...mapping.unmapped.map(name => ({source: name, reason: 'unknown'})), ...mapping.excluded.map(name => ({source: name, reason: 'excluded'})), ...mapping.conflicts.map(c => ({source: c.sourceName, reason: 'duplicate', target: c.targetName, kept: c.keptSourceName}))],
    pinnedBones: pinned,
    conversion: {
      axes: {matrix: C.map(v => Math.round(v)), upAxis: 'XYZ'[settings.upAxis], orientation, restYawError},
      scale: unit, scaleFrom: scaleSource, restPose, restAlignment: {enabled: align, bones: alignedBones, maxDegrees: maxAlignment},
      rootBone: driverIsHips ? scene.models[source[driver]].name : null,
    },
    rootMotion: {mode: rootMotion, horizontalTravel: travel},
    warnings,
  };
  return {input: {name, fps: time.fps, frames: time.frames, tracks}, report};
}
