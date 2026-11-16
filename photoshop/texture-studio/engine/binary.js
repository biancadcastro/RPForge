'use strict';
// RPForge texture engine — binary helpers. Pure JavaScript: no Buffer, no Node APIs,
// so it runs the same inside Photoshop (UXP) and in Node tests.

class EngineError extends Error {
  constructor(message, code = 'invalid') { super(message); this.name = 'EngineError'; this.code = code; }
}
function ensure(value, message, code) { if (!value) throw new EngineError(message, code); }

function view(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
function w16(b, o, v) { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; }
function w32(b, o, v) { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; }

const SYSTEM_BASE = 0x50000000, GRAPHICS_BASE = 0x60000000;

// 64-bit resource pointer as {region, offset}; null pointer -> null.
function pointerAt(b, o) {
  const lo = u32(b, o), hi = u32(b, o + 4);
  if (lo === 0 && hi === 0) return null;
  ensure(hi === 0, 'Invalid resource pointer.');
  const region = lo >>> 28;
  ensure(region === 5 || region === 6, 'Invalid resource pointer.');
  return { region: region === 5 ? 'system' : 'graphics', offset: lo & 0x0fffffff };
}
function writePointer(b, o, region, offset) {
  w32(b, o, offset === null ? 0 : ((region === 'graphics' ? GRAPHICS_BASE : SYSTEM_BASE) + offset) >>> 0);
  w32(b, o + 4, 0);
}

// Jenkins one-at-a-time hash on the lowercase name (GTA "joaat").
function joaat(text) {
  let h = 0;
  const s = String(text).toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (h + (s.charCodeAt(i) & 0xff)) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  return (h + (h << 15)) >>> 0;
}

function cstring(b, o, max = 256) {
  let s = '';
  for (let i = 0; i < max; i++) {
    const c = b[o + i];
    ensure(c !== undefined, 'Name without terminator.');
    if (c === 0) return s;
    s += String.fromCharCode(c);
  }
  throw new EngineError('Name too long in the resource.');
}

// Gives the event loop a chance to breathe during long work (keeps Photoshop responsive).
const tick = () => new Promise(r => setTimeout(r, 0));

module.exports = { EngineError, ensure, view, u16, u32, w16, w32, pointerAt, writePointer, joaat, cstring, tick, SYSTEM_BASE, GRAPHICS_BASE };
