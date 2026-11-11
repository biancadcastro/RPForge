// FBX container reader (own implementation, no SDK): binary FBX 7.0-7.7 and ASCII FBX 7.x
// into one generic node tree {name, props, children}. Pure: bytes in, plain data out.
// Arrays are kept lazy (most of a character file is mesh data the animation import never
// touches) and every size read from the file is checked against a budget before use.
//
// Binary layout (public knowledge, see docs/animation-engine/FBX-AND-RETARGET.md):
//   "Kaydara FBX Binary  \0" 0x1A 0x00, u32 version, then node records:
//   endOffset, propertyCount, propertyListLength (u32 before 7500, u64 from 7500), u8 nameLength, name,
//   properties, nested records closed by an all-zero record. Property type codes:
//   C bool, Y i16, I i32, L i64, F f32, D f64, S string, R raw, and arrays b/i/l/f/d as
//   {u32 count, u32 encoding (0 raw, 1 zlib), u32 byteLength, data}.
import {inflateSync} from 'node:zlib';
import {ErrorCode, ensure, fail} from '../errors.js';

export const FBX_LIMITS = Object.freeze({
  maxFbxBytes: 96 * 1024 * 1024,        // whole file (characters with meshes and textures are large)
  maxNodes: 600000,                     // node records in the file
  maxDepth: 48,                         // nesting of node records
  maxNodeProperties: 4096,              // properties of one node
  maxArrayBytes: 64 * 1024 * 1024,      // one decoded array
  maxInflatedBytes: 256 * 1024 * 1024,  // all arrays decoded during one operation
  maxStringBytes: 1024 * 1024,          // one string/raw property that is actually decoded
  maxModels: 8192,                      // scene nodes (bones, nulls, meshes)
  maxTakes: 256,                        // animation stacks
  maxCurves: 100000,                    // animation curves
  maxKeysPerCurve: 1000000,
  maxBones: 1024,                       // bone candidates offered for mapping
});

/** Merge caller limits; a caller may only tighten the engine budgets. */
export function resolveFbxLimits(overrides) {
  if (overrides === undefined || overrides === null) return FBX_LIMITS;
  if (typeof overrides !== 'object') throw new TypeError('limits must be an object');
  const out = {...FBX_LIMITS};
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in FBX_LIMITS)) continue; // limits of other stages (YCD writer) travel in the same object
    if (!Number.isSafeInteger(value) || value < 1 || value > FBX_LIMITS[key]) throw new RangeError(`Invalid limit ${key}`);
    out[key] = value;
  }
  return Object.freeze(out);
}

const MAGIC = 'Kaydara FBX Binary  ';
const ELEMENT_SIZE = {b: 1, c: 1, i: 4, l: 8, f: 4, d: 8};
const utf8 = new TextDecoder('utf-8');

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  fail(ErrorCode.INVALID_INPUT, 'Input must be bytes');
}

/** Lazy array property. `read(ctx)` decodes it (bounded) into a numeric typed array. */
class LazyArray {
  constructor(kind, type, length, encoding, start, end) { this.kind = kind; this.type = type; this.length = length; this.encoding = encoding; this.start = start; this.end = end; }
}
export function isArray(value) { return value instanceof LazyArray; }

function spend(doc, bytes) {
  ensure(bytes <= doc.limits.maxArrayBytes, ErrorCode.LIMIT_EXCEEDED, 'FBX array above budget', {bytes, limit: doc.limits.maxArrayBytes});
  doc.inflated += bytes;
  ensure(doc.inflated <= doc.limits.maxInflatedBytes, ErrorCode.LIMIT_EXCEEDED, 'FBX decoded data above budget', {limit: doc.limits.maxInflatedBytes});
}

/** Decode a lazy array into Float64Array/Float32Array/Int32Array/Uint8Array (int64 becomes float64). */
export function readArray(doc, array) {
  ensure(isArray(array), ErrorCode.FBX_INVALID, 'Expected an FBX array');
  if (array.kind === 'ascii') {
    const text = doc.text.slice(array.start, array.end);
    spend(doc, array.length * 8);
    const out = new Float64Array(array.length);
    let n = 0, at = 0;
    while (at < text.length) {
      let next = text.indexOf(',', at); if (next < 0) next = text.length;
      const token = text.slice(at, next).trim();
      if (token.length) { ensure(n < array.length, ErrorCode.FBX_INVALID, 'FBX array longer than declared'); const v = Number(token); ensure(!Number.isNaN(v), ErrorCode.FBX_INVALID, 'Invalid number in FBX array'); out[n++] = v; }
      at = next + 1;
    }
    ensure(n === array.length, ErrorCode.FBX_INVALID, 'FBX array shorter than declared', {declared: array.length, found: n});
    return out;
  }
  const size = ELEMENT_SIZE[array.type], byteLength = array.length * size;
  spend(doc, byteLength);
  let raw = doc.bytes.subarray(array.start, array.end);
  if (array.encoding === 1) {
    try { raw = inflateSync(raw, {maxOutputLength: Math.max(byteLength, 1)}); }
    catch (error) { fail(ErrorCode.DECOMPRESSION_FAILED, error?.code === 'ERR_BUFFER_TOO_LARGE' ? 'FBX array inflates beyond its declared size' : 'Corrupt compressed FBX array'); }
  } else ensure(array.encoding === 0, ErrorCode.FBX_INVALID, 'Unknown FBX array encoding', {encoding: array.encoding});
  ensure(raw.length === byteLength, ErrorCode.FBX_INVALID, 'FBX array size mismatch', {declared: byteLength, found: raw.length});
  const copy = new Uint8Array(byteLength); copy.set(raw); // aligned, detached from the input
  switch (array.type) {
    case 'd': return new Float64Array(copy.buffer);
    case 'f': return new Float32Array(copy.buffer);
    case 'i': return new Int32Array(copy.buffer);
    case 'l': { const big = new BigInt64Array(copy.buffer), out = new Float64Array(big.length); for (let i = 0; i < big.length; i++) out[i] = Number(big[i]); return out; }
    default: return copy;
  }
}

function parseBinary(doc) {
  const {bytes, limits} = doc, dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), size = bytes.length;
  ensure(size >= 27 + 13, ErrorCode.FBX_INVALID, 'Truncated FBX file');
  const version = dv.getUint32(23, true);
  ensure(version >= 7000 && version < 7800, ErrorCode.FBX_UNSUPPORTED_VERSION, 'Unsupported FBX version', {version, supported: '7000-7700'});
  doc.version = version;
  const wide = version >= 7500, headerSize = wide ? 25 : 13;
  let nodes = 0;
  const u = at => {
    if (!wide) return dv.getUint32(at, true);
    const hi = dv.getUint32(at + 4, true);
    ensure(hi < 0x200000, ErrorCode.FBX_INVALID, 'FBX offset out of range');
    return hi * 4294967296 + dv.getUint32(at, true);
  };
  const readNode = (at, limit, depth) => {
    ensure(at + headerSize <= limit, ErrorCode.FBX_INVALID, 'Truncated FBX node header', {at});
    const end = u(at), count = u(at + (wide ? 8 : 4)), listLength = u(at + (wide ? 16 : 8)), nameLength = bytes[at + headerSize - 1];
    if (end === 0) {
      ensure(count === 0 && listLength === 0 && nameLength === 0, ErrorCode.FBX_INVALID, 'Malformed FBX end record', {at});
      return null;
    }
    ensure(++nodes <= limits.maxNodes, ErrorCode.LIMIT_EXCEEDED, 'Too many FBX nodes', {limit: limits.maxNodes});
    ensure(depth <= limits.maxDepth, ErrorCode.LIMIT_EXCEEDED, 'FBX nesting too deep', {limit: limits.maxDepth});
    const nameAt = at + headerSize, propsAt = nameAt + nameLength, propsEnd = propsAt + listLength;
    ensure(end > at && end <= limit && propsEnd <= end, ErrorCode.FBX_INVALID, 'FBX node exceeds its parent', {at});
    ensure(count <= limits.maxNodeProperties, ErrorCode.LIMIT_EXCEEDED, 'Too many properties in an FBX node', {count});
    const node = {name: utf8.decode(bytes.subarray(nameAt, propsAt)), props: new Array(count), children: []};
    let p = propsAt;
    const need = n => ensure(p + n <= propsEnd, ErrorCode.FBX_INVALID, 'Truncated FBX property', {at: p});
    for (let i = 0; i < count; i++) {
      need(1);
      const type = String.fromCharCode(bytes[p++]);
      switch (type) {
        case 'C': need(1); node.props[i] = bytes[p] !== 0; p += 1; break;
        case 'Y': need(2); node.props[i] = dv.getInt16(p, true); p += 2; break;
        case 'I': need(4); node.props[i] = dv.getInt32(p, true); p += 4; break;
        case 'F': need(4); node.props[i] = dv.getFloat32(p, true); p += 4; break;
        case 'D': need(8); node.props[i] = dv.getFloat64(p, true); p += 8; break;
        case 'L': { need(8); const v = dv.getBigInt64(p, true), n = Number(v); node.props[i] = Number.isSafeInteger(n) ? n : v; p += 8; break; }
        case 'S': case 'R': {
          need(4); const length = dv.getUint32(p, true); p += 4; need(length);
          if (type === 'S') { ensure(length <= limits.maxStringBytes, ErrorCode.LIMIT_EXCEEDED, 'FBX string above budget', {length}); node.props[i] = utf8.decode(bytes.subarray(p, p + length)); }
          else node.props[i] = {raw: true, start: p, length}; // never decoded by the animation import
          p += length; break;
        }
        case 'b': case 'c': case 'i': case 'l': case 'f': case 'd': {
          need(12);
          const length = dv.getUint32(p, true), encoding = dv.getUint32(p + 4, true), stored = dv.getUint32(p + 8, true);
          p += 12; need(stored);
          node.props[i] = new LazyArray('binary', type, length, encoding, p, p + stored);
          p += stored; break;
        }
        default: fail(ErrorCode.FBX_INVALID, 'Unknown FBX property type', {type: type.charCodeAt(0), at: p - 1});
      }
    }
    ensure(p === propsEnd, ErrorCode.FBX_INVALID, 'FBX property list length mismatch', {at});
    let child = propsEnd;
    while (child < end) {
      const sub = readNode(child, end, depth + 1);
      if (sub === null) { ensure(child + headerSize === end, ErrorCode.FBX_INVALID, 'FBX end record in the middle of a node', {at: child}); break; }
      node.children.push(sub.node); child = sub.end;
    }
    return {node, end};
  };
  const root = {name: '', props: [], children: []};
  let at = 27;
  while (at + headerSize <= size) {
    const top = readNode(at, size, 1);
    if (top === null) break;       // footer follows; it carries no scene data
    root.children.push(top.node); at = top.end;
  }
  return root;
}

function parseAscii(doc) {
  const text = doc.text, limits = doc.limits, length = text.length;
  let at = 0, nodes = 0;
  const skip = () => {
    for (;;) {
      const c = text.charCodeAt(at);
      if (c === 59 /* ; */) { const nl = text.indexOf('\n', at); at = nl < 0 ? length : nl + 1; }
      else if (c === 32 || c === 9 || c === 10 || c === 13) at++;
      else return;
    }
  };
  const isWordChar = c => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45 || c === 43 || c === 46 || c === 124;
  const word = () => { const start = at; while (at < length && isWordChar(text.charCodeAt(at))) at++; return text.slice(start, at); };
  const readValue = () => {
    const c = text[at];
    if (c === '"') {
      const close = text.indexOf('"', at + 1);
      ensure(close >= 0 && close - at <= limits.maxStringBytes, ErrorCode.FBX_INVALID, 'Unterminated FBX string');
      const s = text.slice(at + 1, close); at = close + 1; return s;
    }
    if (c === '*') {
      at++; const count = Number(word());
      ensure(Number.isSafeInteger(count) && count >= 0, ErrorCode.FBX_INVALID, 'Invalid FBX array count');
      skip(); ensure(text[at] === '{', ErrorCode.FBX_INVALID, 'FBX array without data'); at++;
      skip(); ensure(text[at] === 'a', ErrorCode.FBX_INVALID, 'FBX array without data'); at++;
      skip(); ensure(text[at] === ':', ErrorCode.FBX_INVALID, 'FBX array without data'); at++;
      const close = text.indexOf('}', at);
      ensure(close >= 0, ErrorCode.FBX_INVALID, 'Unterminated FBX array');
      const array = new LazyArray('ascii', 'd', count, 0, at, close); at = close + 1; return array;
    }
    const w = word();
    ensure(w.length > 0, ErrorCode.FBX_INVALID, 'Unexpected character in FBX text', {at});
    const n = Number(w);
    return Number.isNaN(n) ? w : n;
  };
  const readNode = depth => {
    ensure(++nodes <= limits.maxNodes, ErrorCode.LIMIT_EXCEEDED, 'Too many FBX nodes', {limit: limits.maxNodes});
    ensure(depth <= limits.maxDepth, ErrorCode.LIMIT_EXCEEDED, 'FBX nesting too deep', {limit: limits.maxDepth});
    const name = word();
    ensure(name.length > 0 && text[at] === ':', ErrorCode.FBX_INVALID, 'Expected an FBX node name', {at});
    at++;
    const node = {name, props: [], children: []};
    for (;;) {
      // Values stay on the node's line; a line break ends the list unless a comma is pending.
      while (text[at] === ' ' || text[at] === '\t') at++;
      const c = text[at];
      if (c === undefined || c === '\n' || c === '\r' || c === '{' || c === '}' || c === ';') break;
      ensure(node.props.length < limits.maxNodeProperties, ErrorCode.LIMIT_EXCEEDED, 'Too many properties in an FBX node');
      node.props.push(readValue());
      while (text[at] === ' ' || text[at] === '\t') at++;
      if (text[at] !== ',') break;
      at++; skip();
    }
    while (text[at] === ' ' || text[at] === '\t') at++;
    if (text[at] === '{') {
      at++;
      for (;;) {
        skip();
        ensure(at < length, ErrorCode.FBX_INVALID, 'Unterminated FBX block');
        if (text[at] === '}') { at++; break; }
        node.children.push(readNode(depth + 1));
      }
    }
    return node;
  };
  const root = {name: '', props: [], children: []};
  for (;;) { skip(); if (at >= length) break; root.children.push(readNode(1)); }
  const header = root.children.find(n => n.name === 'FBXHeaderExtension');
  const version = header?.children.find(n => n.name === 'FBXVersion')?.props[0];
  ensure(Number.isInteger(version), ErrorCode.FBX_INVALID, 'FBX text without a version');
  ensure(version >= 7000 && version < 7800, ErrorCode.FBX_UNSUPPORTED_VERSION, 'Unsupported FBX version', {version, supported: '7000-7700'});
  doc.version = version;
  return root;
}

/**
 * Parse FBX bytes into {format, version, root, limits}. Throws EngineError
 * (INPUT_TOO_LARGE, FBX_INVALID, FBX_UNSUPPORTED_VERSION, LIMIT_EXCEEDED).
 */
export function parseFbx(input, {limits} = {}) {
  const bytes = asBytes(input), resolved = resolveFbxLimits(limits);
  ensure(bytes.length <= resolved.maxFbxBytes, ErrorCode.INPUT_TOO_LARGE, 'FBX file above size limit', {bytes: bytes.length, limit: resolved.maxFbxBytes});
  const doc = {bytes, limits: resolved, inflated: 0, format: 'binary', version: 0, root: null, text: null};
  let binary = bytes.length >= 23;
  for (let i = 0; binary && i < MAGIC.length; i++) binary = bytes[i] === MAGIC.charCodeAt(i);
  if (binary) { doc.root = parseBinary(doc); return doc; }
  // ASCII FBX starts with a comment line ("; FBX 7.4.0 project file") or the header node.
  const head = utf8.decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  ensure(/^﻿?\s*(;|FBXHeaderExtension\s*:)/.test(head) && head.includes('FBX'), ErrorCode.FBX_INVALID, 'Not an FBX file');
  doc.format = 'ascii';
  doc.text = utf8.decode(bytes).replace(/^﻿/, '');
  doc.root = parseAscii(doc);
  return doc;
}

export function child(node, name) { return node?.children.find(n => n.name === name); }
export function children(node, name) { return node ? node.children.filter(n => n.name === name) : []; }
