// Minimal FBX writer for tests only (binary 7.x and ASCII 7.x). It exists so the suite
// can build small, fully known FBX files in code; it is not part of the product.
import {deflateSync} from 'node:zlib';

export const KTIME = 46186158000n;
export const I = v => ({t: 'I', v}), L = v => ({t: 'L', v: BigInt(v)}), D = v => ({t: 'D', v}), F = v => ({t: 'F', v});
export const S = v => ({t: 'S', v}), C = v => ({t: 'C', v}), Y = v => ({t: 'Y', v}), R = v => ({t: 'R', v});
/** Array property: type 'd' | 'f' | 'i' | 'l' | 'b'; `compress` stores it zlib-deflated. */
export const A = (type, values, compress = false) => ({t: type, v: values, compress});
export const node = (name, props = [], children = []) => ({name, props, children});
export const seconds = s => BigInt(Math.round(s * Number(KTIME)));

const SIZE = {b: 1, i: 4, l: 8, f: 4, d: 8};
function arrayBytes(p) {
  const size = SIZE[p.t], out = new Uint8Array(p.v.length * size), dv = new DataView(out.buffer);
  p.v.forEach((v, i) => {
    if (p.t === 'd') dv.setFloat64(i * 8, v, true); else if (p.t === 'f') dv.setFloat32(i * 4, v, true);
    else if (p.t === 'i') dv.setInt32(i * 4, v, true); else if (p.t === 'l') dv.setBigInt64(i * 8, BigInt(v), true); else out[i] = v ? 1 : 0;
  });
  return out;
}

class Out {
  constructor() { this.bytes = new Uint8Array(1 << 16); this.dv = new DataView(this.bytes.buffer); this.at = 0; }
  need(n) { if (this.at + n > this.bytes.length) { let c = this.bytes.length; while (c < this.at + n) c *= 2; const b = new Uint8Array(c); b.set(this.bytes); this.bytes = b; this.dv = new DataView(b.buffer); } }
  u8(v) { this.need(1); this.bytes[this.at++] = v; }
  u32(v) { this.need(4); this.dv.setUint32(this.at, v, true); this.at += 4; }
  put(b) { this.need(b.length); this.bytes.set(b, this.at); this.at += b.length; }
}
const text = s => new TextEncoder().encode(s);

/** Encode a node list as binary FBX. Versions >= 7500 use 64-bit node headers. */
export function encodeBinary(nodes, {version = 7400} = {}) {
  const o = new Out(), wide = version >= 7500;
  o.put(text('Kaydara FBX Binary  ')); o.u8(0); o.u8(0x1a); o.u8(0); o.u32(version);
  const word = v => { o.u32(v); if (wide) o.u32(0); };
  const write = n => {
    const start = o.at;
    word(0); word(n.props.length); word(0);
    const name = text(n.name); o.u8(name.length); o.put(name);
    const propsStart = o.at;
    for (const p of n.props) {
      o.u8(p.t.charCodeAt(0));
      switch (p.t) {
        case 'C': o.u8(p.v ? 1 : 0); break;
        case 'Y': o.need(2); o.dv.setInt16(o.at, p.v, true); o.at += 2; break;
        case 'I': o.need(4); o.dv.setInt32(o.at, p.v, true); o.at += 4; break;
        case 'F': o.need(4); o.dv.setFloat32(o.at, p.v, true); o.at += 4; break;
        case 'D': o.need(8); o.dv.setFloat64(o.at, p.v, true); o.at += 8; break;
        case 'L': o.need(8); o.dv.setBigInt64(o.at, p.v, true); o.at += 8; break;
        case 'S': case 'R': { const b = typeof p.v === 'string' ? text(p.v) : p.v; o.u32(b.length); o.put(b); break; }
        default: { const raw = arrayBytes(p), stored = p.compress ? deflateSync(raw) : raw; o.u32(p.v.length); o.u32(p.compress ? 1 : 0); o.u32(stored.length); o.put(stored); }
      }
    }
    const propsLength = o.at - propsStart;
    if (n.children.length) { n.children.forEach(write); for (let i = 0; i < (wide ? 25 : 13); i++) o.u8(0); }
    o.dv.setUint32(start, o.at, true);
    o.dv.setUint32(start + (wide ? 16 : 8), propsLength, true);
  };
  nodes.forEach(write);
  for (let i = 0; i < (wide ? 25 : 13); i++) o.u8(0);
  o.put(new Uint8Array(40)); // footer stand-in: readers must stop at the end record
  return o.bytes.slice(0, o.at);
}

/** Encode the same node list as ASCII FBX ("Name\0\x01Class" becomes "Class::Name"). */
export function encodeAscii(nodes, {version = 7400} = {}) {
  const lines = [`; FBX ${Math.floor(version / 1000)}.${Math.floor(version / 100) % 10}.0 project file`, '; test fixture', ''];
  const value = p => {
    if (p.t === 'S') { const i = p.v.indexOf('\u0000\u0001'); return `"${i >= 0 ? `${p.v.slice(i + 2)}::${p.v.slice(0, i)}` : p.v}"`; }
    if (p.t === 'C') return p.v ? 'T' : 'F';
    if (p.t === 'R') return '"raw"';
    return String(p.v);
  };
  const write = (n, depth) => {
    const pad = '\t'.repeat(depth), array = n.props.length === 1 && Array.isArray(n.props[0].v);
    if (array) { lines.push(`${pad}${n.name}: *${n.props[0].v.length} {`, `${pad}\ta: ${n.props[0].v.map(String).join(',')}`, `${pad}}`); return; }
    const head = `${pad}${n.name}: ${n.props.map(value).join(', ')}`;
    if (!n.children.length) { lines.push(head); return; }
    lines.push(`${head} {`); n.children.forEach(c => write(c, depth + 1)); lines.push(`${pad}}`);
  };
  nodes.forEach(n => write(n, 0));
  return text(lines.join('\n') + '\n');
}

const P = (name, type, label, flags, ...values) => node('P', [S(name), S(type), S(label), S(flags), ...values]);
const P3 = (name, v) => P(name, name, '', 'A', D(v[0]), D(v[1]), D(v[2]));

/**
 * Describe a scene and get the FBX node list.
 *   settings: {upAxis, upAxisSign, frontAxis, frontAxisSign, coordAxis, coordAxisSign, unitScaleFactor, timeMode, customFrameRate}
 *   models:   [{name, type, parent, translation, rotation, scaling, preRotation, postRotation, rotationOrder,
 *               rotationActive, rotationPivot, rotationOffset, scalingPivot, scalingOffset}]
 *   takes:    [{name, start, stop (seconds, optional), layers: [[curve...]] or curves: [curve...]}]
 *             curve = {model, channel: 'T'|'R'|'S', axis: 0..2, times (seconds), values, flags?, data?, refs?}
 *   bindPose: [{model, matrix: 16 numbers column-major}]
 */
export function sceneNodes({version = 7400, settings = {}, models = [], takes = [], bindPose = [], compress = false, templateDefaults = null, ascii = false} = {}) {
  const gs = {upAxis: 1, upAxisSign: 1, frontAxis: 2, frontAxisSign: 1, coordAxis: 0, coordAxisSign: 1, unitScaleFactor: 1, timeMode: 6, ...settings};
  const globalProps = [
    P('UpAxis', 'int', 'Integer', '', I(gs.upAxis)), P('UpAxisSign', 'int', 'Integer', '', I(gs.upAxisSign)),
    P('FrontAxis', 'int', 'Integer', '', I(gs.frontAxis)), P('FrontAxisSign', 'int', 'Integer', '', I(gs.frontAxisSign)),
    P('CoordAxis', 'int', 'Integer', '', I(gs.coordAxis)), P('CoordAxisSign', 'int', 'Integer', '', I(gs.coordAxisSign)),
    P('UnitScaleFactor', 'double', 'Number', '', D(gs.unitScaleFactor)), P('TimeMode', 'enum', '', '', I(gs.timeMode)),
  ];
  if (gs.customFrameRate !== undefined) globalProps.push(P('CustomFrameRate', 'double', 'Number', '', D(gs.customFrameRate)));
  let nextId = 1000;
  const ids = new Map(models.map(m => [m.name, nextId++]));
  const objects = [], connections = [];
  const C_OO = (a, b) => connections.push(node('C', [S('OO'), L(a), L(b)]));
  const C_OP = (a, b, p) => connections.push(node('C', [S('OP'), L(a), L(b), S(p)]));
  for (const m of models) {
    const props = [];
    if (m.rotationActive !== undefined || m.preRotation || m.postRotation || m.rotationOrder) props.push(P('RotationActive', 'bool', '', '', I(m.rotationActive === false ? 0 : 1)));
    if (m.rotationOrder) props.push(P('RotationOrder', 'enum', '', '', I(m.rotationOrder)));
    for (const [key, name] of [['preRotation', 'PreRotation'], ['postRotation', 'PostRotation'], ['rotationPivot', 'RotationPivot'], ['rotationOffset', 'RotationOffset'], ['scalingPivot', 'ScalingPivot'], ['scalingOffset', 'ScalingOffset']]) if (m[key]) props.push(P(name, 'Vector3D', 'Vector', '', D(m[key][0]), D(m[key][1]), D(m[key][2])));
    if (m.translation) props.push(P3('Lcl Translation', m.translation));
    if (m.rotation) props.push(P3('Lcl Rotation', m.rotation));
    if (m.scaling) props.push(P3('Lcl Scaling', m.scaling));
    objects.push(node('Model', [L(ids.get(m.name)), S(`${m.name}\u0000\u0001Model`), S(m.type ?? 'LimbNode')], [node('Version', [I(232)]), node('Properties70', [], props)]));
    C_OO(ids.get(m.name), m.parent ? ids.get(m.parent) : 0);
  }
  if (bindPose.length) {
    objects.push(node('Pose', [L(nextId++), S('Pose\u0000\u0001Pose'), S('BindPose')], [node('Type', [S('BindPose')]), node('NbPoseNodes', [I(bindPose.length)]),
      ...bindPose.map(b => node('PoseNode', [], [node('Node', [L(ids.get(b.model))]), node('Matrix', [A('d', b.matrix, compress)])]))]));
  }
  for (const take of takes) {
    const stackId = nextId++, stackProps = [];
    if (take.start !== undefined) stackProps.push(P('LocalStart', 'KTime', 'Time', '', L(seconds(take.start))));
    if (take.stop !== undefined) stackProps.push(P('LocalStop', 'KTime', 'Time', '', L(seconds(take.stop))));
    objects.push(node('AnimationStack', [L(stackId), S(`${take.name}\u0000\u0001AnimStack`), S('')], [node('Properties70', [], stackProps)]));
    for (const curves of take.layers ?? [take.curves ?? []]) {
      const layerId = nextId++;
      objects.push(node('AnimationLayer', [L(layerId), S('Layer\u0000\u0001AnimLayer'), S('')]));
      C_OO(layerId, stackId);
      const curveNodes = new Map();
      for (const c of curves) {
        const key = `${c.model}|${c.channel}`;
        if (!curveNodes.has(key)) {
          const id = nextId++; curveNodes.set(key, id);
          const defaults = c.defaults ?? [0, 0, 0];
          objects.push(node('AnimationCurveNode', [L(id), S(`${c.channel}\u0000\u0001AnimCurveNode`), S('')], [node('Properties70', [], [
            P('d|X', 'Number', '', 'A', D(defaults[0])), P('d|Y', 'Number', '', 'A', D(defaults[1])), P('d|Z', 'Number', '', 'A', D(defaults[2]))])]));
          C_OO(id, layerId);
          C_OP(id, ids.get(c.model), {T: 'Lcl Translation', R: 'Lcl Rotation', S: 'Lcl Scaling'}[c.channel]);
        }
        const id = nextId++, n = c.times.length;
        objects.push(node('AnimationCurve', [L(id), S('\u0000\u0001AnimCurve'), S('')], [
          node('Default', [D(c.values[0] ?? 0)]), node('KeyVer', [I(4009)]),
          node('KeyTime', [A('l', c.times.map(seconds), compress)]), node('KeyValueFloat', [A('f', c.values, compress)]),
          node('KeyAttrFlags', [A('i', c.flags ?? [0x4])]), node('KeyAttrDataFloat', [c.dataBits && ascii ? A('i', c.dataBits) : A('f', c.dataBits ? [...new Float32Array(Int32Array.from(c.dataBits).buffer)] : (c.data ?? [0, 0, 0, 0]))]), node('KeyAttrRefCount', [A('i', c.refs ?? [n])]),
        ]));
        C_OP(id, curveNodes.get(key), ['d|X', 'd|Y', 'd|Z'][c.axis]);
      }
    }
  }
  const definitions = templateDefaults ? [node('Definitions', [], [node('ObjectType', [S('Model')], [node('PropertyTemplate', [S('FbxNode')], [node('Properties70', [], templateDefaults)])])])] : [];
  return [
    node('FBXHeaderExtension', [], [node('FBXHeaderVersion', [I(1003)]), node('FBXVersion', [I(version)]), node('Creator', [S('RPForge test fixture')])]),
    node('GlobalSettings', [], [node('Version', [I(1000)]), node('Properties70', [], globalProps)]),
    ...definitions,
    node('Objects', [], objects),
    node('Connections', [], connections),
  ];
}

/** Scene description -> FBX bytes. `ascii: true` writes the text form. */
export function buildFbx(description = {}) {
  const nodes = sceneNodes(description);
  return description.ascii ? encodeAscii(nodes, description) : encodeBinary(nodes, description);
}
export {P};
