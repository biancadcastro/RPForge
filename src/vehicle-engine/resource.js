// RSC7 access for vehicle resources (YFT version 162). Pure: bytes in, bytes out.
// Reuses the animation engine envelope (bounded inflate) with vehicle-sized budgets,
// and adds an encoder that keeps the original page layout so a decode/encode cycle
// preserves every pointer.
import {deflateRawSync} from 'node:zlib';
import {RSC7_MAGIC, rsc7PageSizes} from '../rsc7.js';
import {decodeEnvelope, asBytes, SYSTEM_BASE, GRAPHICS_BASE} from '../animation-engine/envelope.js';
import {ErrorCode, ensure} from '../animation-engine/errors.js';

export const YFT_RESOURCE_VERSION = 162;
export {SYSTEM_BASE, GRAPHICS_BASE, ErrorCode};

// Engine safety budgets, not game limits. A 300k-triangle car decodes to ~22 MiB.
export const VEHICLE_LIMITS = Object.freeze({
  maxInputBytes: 128 * 1024 * 1024,
  maxRegionBytes: 256 * 1024 * 1024,
  maxPages: 213, // every page-count field at its maximum (1+3+15+63+127+1+1+1+1)
});

export function decodeYftResource(input, limits = VEHICLE_LIMITS) {
  return decodeEnvelope(input, YFT_RESOURCE_VERSION, limits);
}

export const YTD_RESOURCE_VERSION = 13;
export function decodeYtdResource(input, limits = VEHICLE_LIMITS) {
  return decodeEnvelope(input, YTD_RESOURCE_VERSION, limits);
}

/**
 * Encode regions with explicit page flags (normally the ones read from the original file).
 * Regions must match the size the flags declare exactly: nothing moves, so every pointer stays valid.
 */
export function encodeYftResource({system, graphics, systemFlags, graphicsFlags, version = YFT_RESOURCE_VERSION}, {level = 6} = {}) {
  const sizeOf = flags => rsc7PageSizes(flags).reduce((a, b) => a + b, 0);
  ensure((systemFlags >>> 28) === (version >>> 4) && (graphicsFlags >>> 28) === (version & 15), ErrorCode.INVALID_ENVELOPE, 'Resource version flags mismatch');
  ensure(system.length === sizeOf(systemFlags), ErrorCode.INVALID_INPUT, 'System region does not match its page flags');
  ensure((graphics?.length ?? 0) === sizeOf(graphicsFlags), ErrorCode.INVALID_INPUT, 'Graphics region does not match its page flags');
  const raw = new Uint8Array(system.length + (graphics?.length ?? 0));
  raw.set(system); if (graphics) raw.set(graphics, system.length);
  const packed = deflateRawSync(raw, {level});
  const out = new Uint8Array(16 + packed.length), dv = new DataView(out.buffer);
  dv.setUint32(0, RSC7_MAGIC, true); dv.setUint32(4, version, true);
  dv.setUint32(8, systemFlags >>> 0, true); dv.setUint32(12, graphicsFlags >>> 0, true);
  out.set(packed, 16);
  return out;
}

export {asBytes};
