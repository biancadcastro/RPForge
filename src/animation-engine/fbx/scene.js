// FBX node tree -> scene model for the animation import: global settings, node hierarchy
// (bones, nulls and their ancestors), rest pose (bind pose matrices), takes and curves.
// Only what skeletal animation needs is read; meshes, materials and deformers are ignored.
import {ErrorCode, ensure} from '../errors.js';
import {child, children, isArray, readArray} from './parse.js';
import {prepareCurve, evaluateCurve, KTIME_PER_SECOND} from './curve.js';
import {IDENTITY3, mul3, transpose3, mulVec3, add, sub, eulerToMatrix, affineMul} from './math.js';

// GlobalSettings.TimeMode -> frames per second (public enum of the format).
const TIME_MODES = {1: 120, 2: 100, 3: 60, 4: 50, 5: 48, 6: 30, 7: 30, 8: 29.97, 9: 29.97, 10: 25, 11: 24, 12: 1000, 13: 23.976, 15: 96, 16: 72, 17: 59.94, 18: 119.88};
// Node kinds that can never be a bone. Everything else (LimbNode, Root, Null, unnamed) is a candidate.
const NOT_BONE = new Set(['Mesh', 'Camera', 'CameraStereo', 'CameraSwitcher', 'Light', 'NurbsCurve', 'Nurbs', 'NurbsSurface', 'Line', 'Shape', 'LodGroup', 'Marker']);
const LCL = {'Lcl Translation': 'T', 'Lcl Rotation': 'R', 'Lcl Scaling': 'S'};
const AXIS = {'d|X': 0, 'd|Y': 1, 'd|Z': 2};

/** "Name\0\x01Class" (binary) or "Class::Name" (ASCII) -> name. */
function objectName(value) {
  if (typeof value !== 'string') return '';
  const sep = value.indexOf('\u0000\u0001');
  if (sep >= 0) return value.slice(0, sep);
  const colons = value.indexOf('::');
  return colons >= 0 ? value.slice(colons + 2) : value;
}
const idOf = v => (typeof v === 'number' || typeof v === 'bigint') ? String(v) : null;

/** Properties70 block -> Map(name -> values after the four descriptor fields). */
function properties(node, into = new Map()) {
  for (const p of children(child(node, 'Properties70'), 'P')) if (typeof p.props[0] === 'string') into.set(p.props[0], p.props.slice(4));
  return into;
}
function vec3(props, name, fallback) {
  const v = props.get(name);
  if (!v || v.length < 3) return fallback;
  const out = [Number(v[0]), Number(v[1]), Number(v[2])];
  ensure(out.every(Number.isFinite), ErrorCode.NONFINITE_VALUE, 'Non-finite FBX property', {property: name});
  return out;
}
function num(props, name, fallback) {
  const v = props.get(name)?.[0];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build the scene. `doc` is the result of parseFbx. Curves stay unread until a take is
 * prepared (prepareTake), so inspecting a file never decodes more than it reports.
 */
export function buildScene(doc) {
  const {root, limits} = doc;
  const objects = child(root, 'Objects'), connections = child(root, 'Connections');
  ensure(objects && connections, ErrorCode.FBX_INVALID, 'FBX file without Objects/Connections');

  // Property templates: a writer may omit any property equal to its template default.
  const templates = new Map();
  for (const type of children(child(root, 'Definitions'), 'ObjectType')) {
    const template = child(type, 'PropertyTemplate');
    if (template && typeof type.props[0] === 'string') templates.set(type.props[0], properties(template));
  }
  const propsOf = (node, type) => properties(node, new Map(templates.get(type) ?? []));

  const gs = properties(child(root, 'GlobalSettings'));
  const timeMode = num(gs, 'TimeMode', 0), custom = num(gs, 'CustomFrameRate', -1);
  let fps = TIME_MODES[timeMode] ?? (timeMode === 14 && custom > 0 ? custom : null);
  const settings = {
    upAxis: num(gs, 'UpAxis', 1), upAxisSign: num(gs, 'UpAxisSign', 1) < 0 ? -1 : 1,
    frontAxis: num(gs, 'FrontAxis', 2), frontAxisSign: num(gs, 'FrontAxisSign', 1) < 0 ? -1 : 1,
    coordAxis: num(gs, 'CoordAxis', 0), coordAxisSign: num(gs, 'CoordAxisSign', 1) < 0 ? -1 : 1,
    unitScaleFactor: num(gs, 'UnitScaleFactor', 1), timeMode, fps: fps ?? 30, fpsDeclared: fps !== null,
  };
  for (const k of ['upAxis', 'frontAxis', 'coordAxis']) ensure([0, 1, 2].includes(settings[k]), ErrorCode.FBX_INVALID, 'Invalid FBX axis setting', {setting: k});
  ensure(settings.upAxis !== settings.frontAxis, ErrorCode.FBX_INVALID, 'FBX up and front axes coincide');
  ensure(settings.unitScaleFactor > 0 && settings.fps > 0 && settings.fps <= 1000, ErrorCode.FBX_INVALID, 'Invalid FBX unit or frame rate');

  const models = [], modelIndex = new Map(), stacks = new Map(), layers = new Map(), curveNodes = new Map(), curves = new Map(), poses = [];
  for (const o of objects.children) {
    const id = idOf(o.props[0]);
    if (id === null) continue;
    if (o.name === 'Model') {
      ensure(models.length < limits.maxModels, ErrorCode.LIMIT_EXCEEDED, 'Too many FBX scene nodes', {limit: limits.maxModels});
      ensure(!modelIndex.has(id), ErrorCode.FBX_INVALID, 'Duplicate FBX object id');
      const p = propsOf(o, 'Model'), order = num(p, 'RotationOrder', 0), active = num(p, 'RotationActive', 0) !== 0;
      const type = typeof o.props[2] === 'string' ? o.props[2] : '';
      const model = {
        id, index: models.length, name: objectName(o.props[1]), type, parent: -1, isBoneCandidate: !NOT_BONE.has(type),
        translation: vec3(p, 'Lcl Translation', [0, 0, 0]), rotation: vec3(p, 'Lcl Rotation', [0, 0, 0]), scaling: vec3(p, 'Lcl Scaling', [1, 1, 1]),
        rotationOrder: active ? order : 0, rotationActive: active,
        preRotation: vec3(p, 'PreRotation', [0, 0, 0]), postRotation: vec3(p, 'PostRotation', [0, 0, 0]),
        rotationOffset: vec3(p, 'RotationOffset', [0, 0, 0]), rotationPivot: vec3(p, 'RotationPivot', [0, 0, 0]),
        scalingOffset: vec3(p, 'ScalingOffset', [0, 0, 0]), scalingPivot: vec3(p, 'ScalingPivot', [0, 0, 0]),
      };
      ensure(Number.isInteger(model.rotationOrder) && model.rotationOrder >= 0 && model.rotationOrder <= 5, ErrorCode.FBX_UNSUPPORTED_FEATURE, 'Unsupported FBX rotation order', {node: model.name, order: model.rotationOrder, feature: 'rotationOrder'});
      // RotationActive off means pre/post rotation and rotation order are not applied (format rule).
      model.ignoredPreRotation = !active && (model.preRotation.some(v => v !== 0) || model.postRotation.some(v => v !== 0));
      model.pre = active ? eulerToMatrix(model.preRotation, 0) : IDENTITY3;
      model.postInverse = active ? transpose3(eulerToMatrix(model.postRotation, 0)) : IDENTITY3;
      modelIndex.set(id, model.index); models.push(model);
    } else if (o.name === 'AnimationStack') {
      ensure(stacks.size < limits.maxTakes, ErrorCode.LIMIT_EXCEEDED, 'Too many FBX takes', {limit: limits.maxTakes});
      const p = propsOf(o, 'AnimationStack');
      stacks.set(id, {id, name: objectName(o.props[1]), start: num(p, 'LocalStart', NaN), stop: num(p, 'LocalStop', NaN), layers: []});
    } else if (o.name === 'AnimationLayer') layers.set(id, {id, name: objectName(o.props[1]), nodes: []});
    else if (o.name === 'AnimationCurveNode') {
      const p = properties(o);
      curveNodes.set(id, {id, defaults: [num(p, 'd|X', NaN), num(p, 'd|Y', NaN), num(p, 'd|Z', NaN)], curves: [null, null, null], model: -1, channel: null});
    } else if (o.name === 'AnimationCurve') {
      ensure(curves.size < limits.maxCurves, ErrorCode.LIMIT_EXCEEDED, 'Too many FBX curves', {limit: limits.maxCurves});
      curves.set(id, {id, node: o, prepared: null});
    } else if (o.name === 'Pose') poses.push(o);
  }

  for (const c of children(connections, 'C')) {
    const kind = c.props[0], from = idOf(c.props[1]), to = idOf(c.props[2]);
    if (from === null || to === null) continue;
    if (kind === 'OO') {
      if (modelIndex.has(from) && modelIndex.has(to)) { const m = models[modelIndex.get(from)]; if (m.parent < 0) m.parent = modelIndex.get(to); }
      else if (layers.has(from) && stacks.has(to)) stacks.get(to).layers.push(layers.get(from));
      else if (curveNodes.has(from) && layers.has(to)) layers.get(to).nodes.push(curveNodes.get(from));
    } else if (kind === 'OP') {
      const property = c.props[3];
      if (curveNodes.has(from) && modelIndex.has(to) && LCL[property]) { const n = curveNodes.get(from); n.model = modelIndex.get(to); n.channel = LCL[property]; }
      else if (curves.has(from) && curveNodes.has(to) && property in AXIS) curveNodes.get(to).curves[AXIS[property]] = curves.get(from);
    }
  }

  // Hierarchy must be a forest; evaluate parents before children.
  const order = [], state = new Uint8Array(models.length);
  for (let i = 0; i < models.length; i++) {
    const chain = [];
    let j = i;
    while (j >= 0 && state[j] === 0) { state[j] = 1; chain.push(j); j = models[j].parent; }
    ensure(j < 0 || state[j] === 2, ErrorCode.CYCLE, 'FBX node hierarchy loops', {node: models[i].name});
    for (let k = chain.length - 1; k >= 0; k--) { state[chain[k]] = 2; order.push(chain[k]); }
  }

  // Bind pose: world matrices at the moment the mesh was skinned. Column-major 4x4.
  const bindPose = new Map();
  for (const pose of poses) {
    if (pose.props[2] !== 'BindPose') continue;
    for (const pn of children(pose, 'PoseNode')) {
      const id = idOf(child(pn, 'Node')?.props[0]), matrix = child(pn, 'Matrix')?.props[0];
      if (id === null || !modelIndex.has(id) || bindPose.has(modelIndex.get(id))) continue;
      const m = isArray(matrix) ? readArray(doc, matrix) : null;
      if (!m || m.length !== 16) continue;
      for (const v of m) ensure(Number.isFinite(v), ErrorCode.NONFINITE_VALUE, 'Non-finite FBX bind pose');
      bindPose.set(modelIndex.get(id), {m: [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]], t: [m[12], m[13], m[14]]});
    }
  }

  const takes = [...stacks.values()].map((s, index) => {
    const start = Number.isFinite(s.start) ? s.start / KTIME_PER_SECOND : NaN, stop = Number.isFinite(s.stop) ? s.stop / KTIME_PER_SECOND : NaN;
    return {index, name: s.name, start, stop, layers: s.layers, prepared: null};
  });
  return {doc, format: doc.format, version: doc.version, settings, models, order, bindPose, takes};
}

function prepared(scene, curve) {
  if (curve.prepared) return curve.prepared;
  const get = name => { const a = child(curve.node, name)?.props[0]; return isArray(a) ? readArray(scene.doc, a) : null; };
  const times = get('KeyTime'), values = get('KeyValueFloat');
  ensure(times && values, ErrorCode.FBX_INVALID, 'FBX curve without keys');
  curve.prepared = prepareCurve({times, values, flags: get('KeyAttrFlags'), data: get('KeyAttrDataFloat'), refs: get('KeyAttrRefCount'), asciiBits: scene.format === 'ascii'}, scene.doc.limits);
  return curve.prepared;
}

/**
 * Resolve one take: per-node channels with their curves decoded, the time range and
 * interpolation statistics. Layers beyond the first that also animate the hierarchy
 * are reported in `extraLayers` (the caller refuses them: blending is not implemented).
 */
export function prepareTake(scene, take) {
  if (take.prepared) return take.prepared;
  const channels = new Map(); // model index -> {T, R, S: {curves:[c,c,c], defaults}}
  const stats = {curves: 0, keys: 0, cubicKeys: 0, tcbKeys: 0, constantKeys: 0, minKeySpacing: Infinity, extraLayers: 0};
  let first = Infinity, last = -Infinity, animatedLayers = 0;
  for (const layer of take.layers) {
    const nodes = layer.nodes.filter(n => n.model >= 0 && n.channel && n.curves.some(Boolean));
    if (!nodes.length) continue;
    if (++animatedLayers > 1) { stats.extraLayers++; continue; }
    for (const n of nodes) {
      const entry = channels.get(n.model) ?? {}; channels.set(n.model, entry);
      if (entry[n.channel]) continue; // a second node on the same property: first wins
      const list = n.curves.map(c => {
        if (!c) return null;
        const p = prepared(scene, c);
        if (!p.times.length) return null;
        stats.curves++; stats.keys += p.times.length; stats.cubicKeys += p.cubicKeys; stats.tcbKeys += p.tcbKeys; stats.constantKeys += p.constantKeys;
        first = Math.min(first, p.times[0]); last = Math.max(last, p.times[p.times.length - 1]);
        // Smallest average key spacing tells whether the curves are baked (one key per frame).
        if (p.times.length > 1) stats.minKeySpacing = Math.min(stats.minKeySpacing, (p.times[p.times.length - 1] - p.times[0]) / (p.times.length - 1));
        return p;
      });
      entry[n.channel] = {curves: list, defaults: n.defaults};
    }
  }
  let start = take.start, stop = take.stop, rangeSource = 'take';
  if (!(Number.isFinite(start) && Number.isFinite(stop) && stop > start) && Number.isFinite(first)) { start = first; stop = last; rangeSource = 'keys'; }
  take.prepared = {channels, stats, start, stop, rangeSource, hasCurves: stats.curves > 0};
  return take.prepared;
}

/** Local transform of a node from explicit T/R/S values (FBX transform chain, see math.js). */
export function localTransform(model, t, r, s) {
  // M = T * Roff * Rp * Rpre * R * Rpost^-1 * Rp^-1 * Soff * Sp * S * Sp^-1
  const rot = mul3(mul3(model.pre, eulerToMatrix(r, model.rotationOrder)), model.postInverse);
  const m = [rot[0] * s[0], rot[1] * s[1], rot[2] * s[2], rot[3] * s[0], rot[4] * s[1], rot[5] * s[2], rot[6] * s[0], rot[7] * s[1], rot[8] * s[2]];
  const inner = add(sub(add(model.scalingOffset, model.scalingPivot), model.rotationPivot), [-s[0] * model.scalingPivot[0], -s[1] * model.scalingPivot[1], -s[2] * model.scalingPivot[2]]);
  return {m, t: add(add(add(t, model.rotationOffset), model.rotationPivot), mulVec3(rot, inner))};
}

function channelValue(entry, fallback, time) {
  if (!entry) return fallback;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const c = entry.curves[k];
    out[k] = c ? evaluateCurve(c, time) : (Number.isFinite(entry.defaults[k]) ? entry.defaults[k] : fallback[k]);
  }
  return out;
}

/** Local transform of a node at `time` in a prepared take (null take = the file's default pose). */
export function sampleLocal(model, take, time) {
  const ch = take?.channels.get(model.index);
  return localTransform(model, channelValue(ch?.T, model.translation, time), channelValue(ch?.R, model.rotation, time), channelValue(ch?.S, model.scaling, time));
}

/** World transforms (affine) of the listed nodes; `list` must be in parent-first order. */
export function worldTransforms(scene, list, take, time, out = new Map()) {
  for (const i of list) {
    const model = scene.models[i], local = sampleLocal(model, take, time);
    out.set(i, model.parent >= 0 ? affineMul(out.get(model.parent), local) : local);
  }
  return out;
}
