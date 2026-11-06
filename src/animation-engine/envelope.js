// RSC7 envelope for the animation engine. Pure: bytes in, bytes out. The only
// non-ECMAScript dependency is node:zlib (available in Workers with nodejs_compat).
import {deflateRawSync, inflateRawSync} from 'node:zlib';
import {RSC7_MAGIC, rsc7PageSizes} from '../rsc7.js';
import {ErrorCode, ensure, fail} from './errors.js';

export const YCD_RESOURCE_VERSION = 46;
const SYSTEM_BASE = 0x50000000;
const GRAPHICS_BASE = 0x60000000;
export {SYSTEM_BASE, GRAPHICS_BASE};

export function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  fail(ErrorCode.INVALID_INPUT, 'Input must be bytes');
}

function regionLayout(flags, limits) {
  const pages = rsc7PageSizes(flags);
  ensure(pages.length <= limits.maxPages, ErrorCode.INVALID_ENVELOPE, 'Too many resource pages', {pages: pages.length});
  let total = 0; for (const p of pages) total += p;
  ensure(total <= limits.maxRegionBytes, ErrorCode.LIMIT_EXCEEDED, 'Resource region above budget', {bytes: total, limit: limits.maxRegionBytes});
  return {pages, total};
}

/**
 * Decode an RSC7 container. Inflation is bounded by the size the header declares,
 * which is itself bounded by the limits before any decompression happens.
 */
export function decodeEnvelope(input, version, limits) {
  const bytes = asBytes(input);
  ensure(bytes.length <= limits.maxInputBytes, ErrorCode.INPUT_TOO_LARGE, 'Input above size limit', {bytes: bytes.length, limit: limits.maxInputBytes});
  ensure(bytes.length >= 18, ErrorCode.INVALID_ENVELOPE, 'Truncated resource header');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  ensure(dv.getUint32(0, true) === RSC7_MAGIC, ErrorCode.INVALID_ENVELOPE, 'Invalid resource magic');
  const fileVersion = dv.getUint32(4, true);
  ensure(fileVersion === version, ErrorCode.INVALID_ENVELOPE, 'Unsupported resource version', {version: fileVersion, expected: version});
  const sf = dv.getUint32(8, true), gf = dv.getUint32(12, true);
  ensure((sf >>> 28) === (version >>> 4) && (gf >>> 28) === (version & 15), ErrorCode.INVALID_ENVELOPE, 'Resource version flags mismatch');
  const system = regionLayout(sf, limits), graphics = regionLayout(gf, limits);
  ensure(system.total > 0, ErrorCode.INVALID_ENVELOPE, 'Missing system pages');
  const expected = system.total + graphics.total;
  let out;
  try {
    out = inflateRawSync(bytes.subarray(16), {maxOutputLength: expected, info: true});
  } catch (error) {
    // ERR_BUFFER_TOO_LARGE: more data than declared. Anything else: corrupt stream.
    fail(ErrorCode.DECOMPRESSION_FAILED, error?.code === 'ERR_BUFFER_TOO_LARGE' ? 'Decompressed data exceeds declared size' : 'Corrupt compressed data');
  }
  ensure(out.buffer.length === expected, ErrorCode.DECOMPRESSION_FAILED, 'Resource page size mismatch', {decoded: out.buffer.length, declared: expected});
  const data = new Uint8Array(out.buffer.buffer, out.buffer.byteOffset, out.buffer.length);
  // Some third-party tools append the zlib Adler-32 trailer after the raw deflate
  // stream. Accept exactly that (verified checksum); any other trailing byte is refused.
  const trailing = bytes.length - 16 - out.engine.bytesWritten;
  let trailer = null;
  if (trailing === 4) {
    ensure(dv.getUint32(bytes.length - 4, false) === adler32(data), ErrorCode.DECOMPRESSION_FAILED, 'Trailing resource bytes');
    trailer = 'adler32';
  } else ensure(trailing === 0, ErrorCode.DECOMPRESSION_FAILED, 'Trailing resource bytes', {bytes: trailing});
  return {
    system: data.subarray(0, system.total), graphics: data.subarray(system.total),
    systemFlags: sf, graphicsFlags: gf, systemPages: system.pages.length, graphicsPages: graphics.pages.length,
    compressedBytes: bytes.length, decodedBytes: expected, trailer,
  };
}

export function adler32(data) {
  let a = 1, b = 0;
  for (let i = 0; i < data.length;) {
    const end = Math.min(i + 5552, data.length);
    for (; i < end; i++) { a += data[i]; b += a; }
    a %= 65521; b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Smallest single page (base 8 KiB, power of two) holding the region; same scheme as the validated proof. */
function singlePage(length, limits) {
  let size = 8192, shift = 4;
  while (size < length) { size *= 2; shift++; }
  ensure(size <= limits.maxRegionBytes && shift <= 15, ErrorCode.OUTPUT_TOO_LARGE, 'Region above budget', {bytes: length});
  return {size, flags: 0x08000000 + shift};
}

export function encodeEnvelope(version, system, limits, level = 6) {
  const s = singlePage(system.length, limits), header = new Uint8Array(16), dv = new DataView(header.buffer);
  dv.setUint32(0, RSC7_MAGIC, true); dv.setUint32(4, version, true);
  dv.setUint32(8, (s.flags | ((version >>> 4) << 28)) >>> 0, true);
  dv.setUint32(12, ((version & 15) << 28) >>> 0, true);
  const raw = new Uint8Array(s.size); raw.set(system);
  const packed = deflateRawSync(raw, {level});
  const total = 16 + packed.length;
  ensure(total <= limits.maxOutputBytes, ErrorCode.OUTPUT_TOO_LARGE, 'Encoded output above limit', {bytes: total});
  const result = new Uint8Array(total); result.set(header); result.set(packed, 16);
  return result;
}
