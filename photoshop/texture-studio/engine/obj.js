'use strict';
// RPForge texture engine — Wavefront OBJ/MTL reader: UVs per material for the UV guide,
// plus positions and normals for the 3D preview.
// OBJ texture coordinates have V pointing up; images have Y pointing down, so V is flipped.
const { EngineError, ensure } = require('./binary');

const MAX_TRIANGLES = 4000000;

// Returns { usage, meshes, materials, mtllibs, triangles, missingUv, up }.
function readObj(text) {
  ensure(typeof text === 'string' && text.length, 'Empty OBJ file.');
  const vt = [0, 0], vp = [0, 0, 0], vn = [0, 0, 0]; // 1-based
  const groups = new Map(); // material -> { uv: [], pos: [], nrm: [] } per corner
  const mtllibs = [];
  let current = 'default', tris = 0, missingUv = 0;
  const group = name => { if (!groups.has(name)) groups.set(name, { uv: [], pos: [], nrm: [], hasN: true }); return groups.get(name); };
  const idx = (s, len, stride) => { let i = parseInt(s, 10); if (Number.isNaN(i)) return null; if (i < 0) i = len / stride + i; return i > 0 && i * stride < len ? i : null; };
  let pos = 0;
  const n = text.length;
  while (pos < n) {
    let end = text.indexOf('\n', pos); if (end < 0) end = n;
    let line = text.slice(pos, end); pos = end + 1;
    if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);
    const c0 = line.charCodeAt(0), c1 = line.charCodeAt(1);
    if (c0 === 118 && (c1 === 32 || c1 === 9)) { const p = line.trim().split(/\s+/); vp.push(+p[1] || 0, +p[2] || 0, +p[3] || 0); }
    else if (c0 === 118 && c1 === 116) { const p = line.trim().split(/\s+/); vt.push(parseFloat(p[1]) || 0, parseFloat(p[2]) || 0); }
    else if (c0 === 118 && c1 === 110) { const p = line.trim().split(/\s+/); vn.push(+p[1] || 0, +p[2] || 0, +p[3] || 0); }
    else if (c0 === 102 && (c1 === 32 || c1 === 9)) {
      const p = line.trim().split(/\s+/).slice(1);
      if (p.length < 3) continue;
      const corners = p.map(v => { const parts = v.split('/'); return [idx(parts[0], vp.length, 3), parts.length > 1 ? idx(parts[1], vt.length, 2) : null, parts.length > 2 ? idx(parts[2], vn.length, 3) : null]; });
      if (corners.some(c => c[1] === null)) { missingUv++; continue; }
      if (corners.some(c => c[0] === null)) continue;
      const g = group(current);
      for (let i = 1; i + 1 < corners.length; i++) { // fan triangulation
        const tri = [corners[0], corners[i], corners[i + 1]];
        for (const [pi, ti, ni] of tri) {
          g.uv.push(vt[ti * 2], 1 - vt[ti * 2 + 1]);
          g.pos.push(vp[pi * 3], vp[pi * 3 + 1], vp[pi * 3 + 2]);
          if (ni === null) { g.hasN = false; g.nrm.push(0, 0, 0); } else g.nrm.push(vn[ni * 3], vn[ni * 3 + 1], vn[ni * 3 + 2]);
        }
        if (++tris > MAX_TRIANGLES) throw new EngineError('OBJ model too large (more than 4 million triangles).');
      }
    } else if (line.startsWith('usemtl')) current = line.slice(6).trim() || 'default';
    else if (line.startsWith('mtllib')) { const f = line.slice(6).trim(); if (f) mtllibs.push(f); }
  }
  ensure(tris > 0, missingUv ? 'The OBJ has no texture coordinates (UV). Unwrap it in your 3D software first.' : 'The OBJ has no faces.');
  const usage = new Map(), meshes = [];
  for (const [name, g] of groups) {
    if (!g.uv.length) continue;
    const uv = new Float32Array(g.uv), positions = new Float32Array(g.pos), normals = new Float32Array(g.nrm);
    const count = uv.length / 2, indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    if (!g.hasN) faceNormals(positions, normals);
    usage.set(name.toLowerCase(), { name, uses: [{ geometry: name, shader: 'obj', sampler: 'map_Kd', channel: 0, uv, indices }] });
    meshes.push({ id: name, shader: 'obj', positions, normals, uv: [uv, null], indices, diffuse: name, livery: null, normalMap: null });
  }
  return { usage, meshes, materials: [...usage.values()].map(u => u.name), mtllibs, triangles: tris, missingUv, up: 'y' };
}

function faceNormals(p, out) {
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 9; k += 3) { out[i + k] = nx; out[i + k + 1] = ny; out[i + k + 2] = nz; }
  }
}

// Returns Map(lowercase material -> { name, diffuse: relative path or null }).
function readMtl(text) {
  const out = new Map();
  let current = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('newmtl')) { current = { name: line.slice(6).trim(), diffuse: null }; out.set(current.name.toLowerCase(), current); }
    else if (current && /^map_Kd\s/i.test(line)) {
      // Options like "-s 1 1 1" may precede the file name; the file is the last token(s).
      const tokens = line.replace(/^map_Kd\s+/i, '').split(/\s+/);
      let i = 0;
      while (i < tokens.length && tokens[i].startsWith('-')) { const opt = tokens[i]; i += opt === '-s' || opt === '-o' || opt === '-t' ? 4 : opt === '-mm' ? 3 : 2; }
      current.diffuse = tokens.slice(i).join(' ') || null;
    }
  }
  return out;
}

module.exports = { readObj, readMtl };
