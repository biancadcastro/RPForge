'use strict';
// RPForge texture engine — software 3D renderer for the preview panel.
// Perspective-correct texturing, z-buffer, two-sided soft lighting, livery overlay (UV1),
// per-pixel triangle ids for picking. Pure JavaScript, no GPU.

const FOV = 38 * Math.PI / 180, NEAR = 1e-3;

function axisSwap(up) {
  // Model -> world (Y up). GTA models are Z-up (X right, Y forward).
  return up === 'z' ? (x, y, z, o, i) => { o[i] = x; o[i + 1] = z; o[i + 2] = -y; } : (x, y, z, o, i) => { o[i] = x; o[i + 1] = y; o[i + 2] = z; };
}

class Scene {
  // meshes: [{ id, positions, normals, uv:[uv0, uv1], indices, diffuse, livery }]
  constructor(meshes, up = 'z') {
    this.meshes = meshes.filter(m => m.positions && m.indices && m.indices.length);
    this.textures = new Map();
    this.setUp(up);
  }
  setUp(up) {
    this.up = up;
    const swap = axisSwap(up);
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], triangles = 0;
    for (const m of this.meshes) {
      const n = m.positions.length / 3;
      m.world = new Float32Array(n * 3); m.worldN = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        swap(m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2], m.world, i * 3);
        if (m.normals) swap(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2], m.worldN, i * 3);
        for (let k = 0; k < 3; k++) { const v = m.world[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
      }
      if (!m.normals) computeNormals(m);
      triangles += m.indices.length / 3;
    }
    if (!Number.isFinite(min[0])) { min = [-1, -1, -1]; max = [1, 1, 1]; }
    // Frame on the bulk of the model: stray vertices far away (helpers, proxies) are ignored.
    const robust = robustBounds(this.meshes);
    if (robust) { min = robust.min; max = robust.max; }
    this.center = min.map((v, i) => (v + max[i]) / 2);
    this.radius = Math.max(1e-3, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
    this.triangles = triangles;
  }
  // tex: { rgba, width, height } or null. Names are matched case-insensitively.
  setTexture(name, tex) {
    const key = String(name).toLowerCase();
    if (!tex) { this.textures.delete(key); return; }
    // Fully transparent (unpainted) images draw as untextured; cut-outs only when alpha is mixed.
    let opaque = 0, clear = 0;
    const step = Math.max(1, Math.floor(tex.rgba.length / 4 / 20000)) * 4;
    for (let i = 3; i < tex.rgba.length; i += step) { if (tex.rgba[i] < 64) clear++; else opaque++; }
    if (!opaque) { this.textures.delete(key); return; }
    this.textures.set(key, { ...tex, cutout: clear > 0 });
  }
  texture(name) { return name ? this.textures.get(name.toLowerCase()) || null : null; }
}

// 1st–99th percentile box of the referenced vertices (sampled), then grown 4% per side.
function robustBounds(meshes) {
  const xs = [], ys = [], zs = [];
  let total = 0;
  for (const m of meshes) total += m.indices.length;
  const step = Math.max(1, Math.floor(total / 60000));
  let k = 0;
  for (const m of meshes) for (let i = 0; i < m.indices.length; i++, k++) {
    if (k % step) continue;
    const v = m.indices[i] * 3, x = m.world[v], y = m.world[v + 1], z = m.world[v + 2];
    if (Number.isFinite(x + y + z)) { xs.push(x); ys.push(y); zs.push(z); }
  }
  if (xs.length < 8) return null;
  const q = (a, f) => { a.sort((p, r) => p - r); return a[Math.min(a.length - 1, Math.max(0, Math.round(f * (a.length - 1))))]; };
  const min = [q(xs, 0.01), q(ys, 0.01), q(zs, 0.01)], max = [q(xs, 0.99), q(ys, 0.99), q(zs, 0.99)];
  for (let i = 0; i < 3; i++) { const pad = (max[i] - min[i]) * 0.04; min[i] -= pad; max[i] += pad; }
  return { min, max };
}

function computeNormals(m) {
  const n = m.worldN, p = m.world, idx = m.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
}

// Orbit camera. distance is a multiple of the scene radius.
function cameraBasis(scene, cam, width, height) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const dir = [cp * sy, sp, cp * cy]; // from target to eye
  const fwd = [-dir[0], -dir[1], -dir[2]];
  let right = [fwd[2], 0, -fwd[0]]; // cross(fwd, up=(0,1,0)) → (−fz, 0, fx) negated for right-handed screen
  right = [-right[0], -right[1], -right[2]];
  const rl = Math.hypot(right[0], right[2]) || 1; right = [right[0] / rl, 0, right[2] / rl];
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  const r = scene.radius, dist = r * cam.distance;
  const target = [0, 1, 2].map(k => scene.center[k] + (right[k] * cam.panX + up[k] * cam.panY) * r);
  const eye = target.map((v, k) => v + dir[k] * dist);
  const focal = (height / 2) / Math.tan(FOV / 2);
  return { eye, fwd, right, up, focal, width, height };
}

const isGlassMesh = m => /glass|vidro/i.test(m.shader || '') || /glass|vidro|_window/i.test(m.diffuse || '');

// World-space bounding sphere of every mesh (for culling and front-to-back order).
function meshSpheres(scene) {
  for (const m of scene.meshes) {
    const P = m.world, n = P.length / 3;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (!(x === x && y === y && z === z)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    m.sphere = Number.isFinite(x0) ? [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2] : null;
  }
}

// Simplified triangle lists for frames drawn while the camera moves: vertex clustering on a
// world grid. Indices still point at the mesh's own vertices, so UVs and normals stay valid.
function buildLod(scene, cellsAcross = 110) {
  const inv = cellsAcross / scene.radius, c = scene.center, OFF = 65536, SPAN = 131072;
  const cell = v => { const k = Math.floor(v); return (k < -OFF ? -OFF : k >= OFF ? OFF - 1 : k) + OFF; };
  let total = 0;
  for (const m of scene.meshes) {
    const P = m.world, n = P.length / 3, rep = new Int32Array(n), cells = new Map();
    for (let i = 0; i < n; i++) {
      const x = (P[i * 3] - c[0]) * inv, y = (P[i * 3 + 1] - c[1]) * inv, z = (P[i * 3 + 2] - c[2]) * inv;
      const key = x === x && y === y && z === z ? (cell(x) * SPAN + cell(y)) * SPAN + cell(z) : -1 - i; // < 2^51: exact
      const hit = cells.get(key);
      if (hit === undefined) { cells.set(key, i); rep[i] = i; } else rep[i] = hit;
    }
    const idx = m.indices, out = [], seen = new Set();
    for (let t = 0; t < idx.length; t += 3) {
      const a = rep[idx[t]], b = rep[idx[t + 1]], d = rep[idx[t + 2]];
      if (a === b || b === d || a === d) continue;
      let lo = a, mid = b, hi = d, s;
      if (lo > mid) { s = lo; lo = mid; mid = s; } if (mid > hi) { s = mid; mid = hi; hi = s; } if (lo > mid) { s = lo; lo = mid; mid = s; }
      const key = (lo * n + mid) * n + hi;
      if (seen.has(key)) continue;
      seen.add(key); out.push(a, b, d);
    }
    m.lod = out.length < idx.length ? Uint32Array.from(out) : idx;
    total += m.lod.length / 3;
  }
  scene.lodTriangles = total;
  scene.lodReady = true;
}

const BG_TOP = [29, 29, 39], BG_BOTTOM = [20, 20, 27]; // RPForge surface → graphite

// Renders the scene. options: { quality: 'fast'|'full', focus: textureName, untextured: [r,g,b], lod, smooth }
// 'fast' samples textures nearest-neighbour and, on heavy models, draws the simplified mesh.
// Returns { rgba, width, height, meshId, triId, lod, basis, time }.
function render(scene, cam, width, height, options = {}) {
  const t0 = Date.now();
  width = Math.max(1, width | 0); height = Math.max(1, height | 0);
  const full = options.quality !== 'fast';
  const useLod = !full && options.lod !== false && scene.triangles > 80000;
  if (!scene.passes) {
    meshSpheres(scene);
    const all = scene.meshes.map((m, i) => i);
    scene.passes = [all.filter(i => !isGlassMesh(scene.meshes[i])), all.filter(i => isGlassMesh(scene.meshes[i]))];
  }
  if (useLod && !scene.lodReady) buildLod(scene);
  const pixels = width * height;
  const rgba = new Uint8Array(pixels * 4), rgba32 = new Uint32Array(rgba.buffer);
  const zbuf = new Float32Array(pixels); // 1/z, 0 = empty
  const meshId = new Int16Array(pixels).fill(-1), triId = new Int32Array(pixels);
  for (let y = 0; y < height; y++) {
    const t = y / Math.max(1, height - 1);
    const r = Math.round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t), g = Math.round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t), b = Math.round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t);
    rgba32.fill(((255 << 24) | (b << 16) | (g << 8) | r) >>> 0, y * width, (y + 1) * width);
  }
  const B = cameraBasis(scene, cam, width, height);
  const [ex, ey, ez] = B.eye, [fx, fy, fz] = B.fwd, [rx, ry, rz] = B.right, [ux, uy, uz] = B.up, focal = B.focal, hw = width / 2, hh = height / 2;
  // Key light from upper left of the viewer, plus a soft fill.
  let lx = -rx * 0.45 + ux * 0.6 - fx * 0.65, ly = -ry * 0.45 + uy * 0.6 - fy * 0.65, lz = -rz * 0.45 + uz * 0.6 - fz * 0.65;
  const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
  // Half vector for a soft clear-coat highlight on painted parts (so dark paint still shows shape).
  let hx = lx - fx, hy = ly - fy, hz = lz - fz; const hl = Math.hypot(hx, hy, hz) || 1; hx /= hl; hy /= hl; hz /= hl;
  const untextured = options.untextured || [168, 168, 172];
  const focus = options.focus ? options.focus.toLowerCase() : null;
  // Frustum test on bounding spheres.
  const tanX = hw / focal, tanY = hh / focal, kX = Math.sqrt(1 + tanX * tanX), kY = Math.sqrt(1 + tanY * tanY);
  const depthOf = m => { const s = m.sphere; return s ? (s[0] - ex) * fx + (s[1] - ey) * fy + (s[2] - ez) * fz : 0; };
  const visible = m => {
    const s = m.sphere; if (!s) return false;
    const dx = s[0] - ex, dy = s[1] - ey, dz = s[2] - ez, r = s[3];
    const cz = dx * fx + dy * fy + dz * fz;
    if (cz + r <= NEAR) return false;
    return Math.abs(dx * rx + dy * ry + dz * rz) <= cz * tanX + r * kX && Math.abs(dx * ux + dy * uy + dz * uz) <= cz * tanY + r * kY;
  };
  // Opaque front to back (early depth rejects), then glass blended on top without writing depth.
  const opaque = scene.passes[0].filter(i => visible(scene.meshes[i])).sort((a, b) => depthOf(scene.meshes[a]) - depthOf(scene.meshes[b]));
  const glassList = scene.passes[1].filter(i => visible(scene.meshes[i]));
  const S = SAMPLE;
  for (let pass = 0; pass < 2; pass++) for (const mi of pass ? glassList : opaque) {
    const m = scene.meshes[mi], glass = pass === 1;
    const n = m.world.length / 3, P = m.world, N = m.worldN;
    if (!m.scratch || m.scratch.n !== n) m.scratch = { n, sx: new Float32Array(n), sy: new Float32Array(n), iz: new Float32Array(n), shade: new Float32Array(n), spec: new Float32Array(n) };
    const { sx, sy: syy, iz, shade, spec } = m.scratch;
    if (m.paint === undefined) m.paint = /paint/i.test(m.shader || '');
    const glossy = m.paint && !glass;
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      const dx = P[j] - ex, dy = P[j + 1] - ey, dz = P[j + 2] - ez;
      const cz = dx * fx + dy * fy + dz * fz;
      if (cz <= NEAR) { iz[i] = -1; continue; }
      const inv = 1 / cz;
      sx[i] = hw + focal * (dx * rx + dy * ry + dz * rz) * inv;
      syy[i] = hh - focal * (dx * ux + dy * uy + dz * uz) * inv;
      iz[i] = inv;
      const d = N[j] * lx + N[j + 1] * ly + N[j + 2] * lz;
      shade[i] = 0.34 + 0.66 * (d < 0 ? -d : d);
      if (glossy) { let h = N[j] * hx + N[j + 1] * hy + N[j + 2] * hz; if (h < 0) h = -h; h *= h; h *= h; h *= h; h *= h; spec[i] = 70 * h + 18 * (1 - (d < 0 ? -d : d)); }
    }
    const diff = scene.texture(m.diffuse), liv = scene.texture(m.livery);
    const uv0 = m.uv[0], uv1 = m.uv[1] || m.uv[0];
    // Alpha cuts holes only in shaders that use it that way; in paint/mesh/tire shaders the
    // diffuse alpha holds other data (specular), so those parts stay solid.
    if (m.alphaCut === undefined) m.alphaCut = !m.shader || /cutout|decal|badge|alpha|grill|hair|cloth|leaf|tree|track|fence|0x/i.test(m.shader);
    const hasDiff = !!(diff && uv0), cut = !glass && hasDiff && diff.cutout && m.alphaCut;
    const dimmed = focus && m.diffuse !== null && (m.diffuse || '').toLowerCase() !== focus && (m.livery || '').toLowerCase() !== focus;
    const ur = untextured[0], ug = untextured[1], ub = untextured[2];
    const idx = useLod ? m.lod : m.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const za = iz[a], zb = iz[b], zc = iz[c];
      if (za < 0 || zb < 0 || zc < 0) continue;
      const ax = sx[a], ay = syy[a], bx = sx[b], by = syy[b], cx = sx[c], cy = syy[c];
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area === 0 || area !== area) continue;
      // Range of pixel centres (x + 0.5) inside the bounding box: most sub-pixel triangles cover
      // none and are dropped here, before any per-pixel work.
      let lo = ax < bx ? ax : bx, hi = ax < bx ? bx : ax; if (cx < lo) lo = cx; else if (cx > hi) hi = cx;
      let minX = Math.ceil(lo - 0.5), maxX = Math.floor(hi - 0.5);
      if (minX < 0) minX = 0; if (maxX > width - 1) maxX = width - 1;
      if (minX > maxX) continue;
      lo = ay < by ? ay : by; hi = ay < by ? by : ay; if (cy < lo) lo = cy; else if (cy > hi) hi = cy;
      let minY = Math.ceil(lo - 0.5), maxY = Math.floor(hi - 0.5);
      if (minY < 0) minY = 0; if (maxY > height - 1) maxY = height - 1;
      if (minY > maxY) continue;
      const inv = 1 / area;
      // Barycentric weights stepped incrementally across the bounding box.
      const e0dx = (by - cy) * inv, e0dy = (cx - bx) * inv, e1dx = (cy - ay) * inv, e1dy = (ax - cx) * inv;
      const qx = minX + 0.5, qy = minY + 0.5;
      let w0row = ((bx - qx) * (cy - qy) - (by - qy) * (cx - qx)) * inv;
      let w1row = ((cx - qx) * (ay - qy) - (cy - qy) * (ax - qx)) * inv;
      // perspective-correct attributes: a/z
      const ua0 = hasDiff ? uv0[a * 2] * za : 0, va0 = hasDiff ? uv0[a * 2 + 1] * za : 0, ub0 = hasDiff ? uv0[b * 2] * zb : 0, vb0 = hasDiff ? uv0[b * 2 + 1] * zb : 0, uc0 = hasDiff ? uv0[c * 2] * zc : 0, vc0 = hasDiff ? uv0[c * 2 + 1] * zc : 0;
      const ua1 = liv ? uv1[a * 2] * za : 0, va1 = liv ? uv1[a * 2 + 1] * za : 0, ub1 = liv ? uv1[b * 2] * zb : 0, vb1 = liv ? uv1[b * 2 + 1] * zb : 0, uc1 = liv ? uv1[c * 2] * zc : 0, vc1 = liv ? uv1[c * 2 + 1] * zc : 0;
      const sa = shade[a], sb = shade[b], sc = shade[c], pa = glossy ? spec[a] : 0, pb = glossy ? spec[b] : 0, pc = glossy ? spec[c] : 0;
      // Bilinear only where a texel covers more than a screen pixel (magnified); minified texels
      // gain nothing from it, so they are sampled directly.
      const pixArea = area < 0 ? -area : area;
      const linD = full && hasDiff && magnified(uv0, a, b, c, diff, pixArea), linL = full && liv && magnified(uv1, a, b, c, liv, pixArea);
      const e2dx = -e0dx - e1dx, span = maxX - minX;
      for (let py = minY; py <= maxY; py++, w0row += e0dy, w1row += e1dy) {
        // Columns of this row inside all three edges (solved per edge, 1 px slack for rounding;
        // the per-pixel tests below stay exact).
        let k0 = 0, k1 = span;
        const w2row = 1 - w0row - w1row;
        if (e0dx > 0) { const k = Math.ceil(-w0row / e0dx) - 1; if (k > k0) k0 = k; } else if (e0dx < 0) { const k = Math.floor(-w0row / e0dx) + 1; if (k < k1) k1 = k; } else if (w0row < 0) continue;
        if (e1dx > 0) { const k = Math.ceil(-w1row / e1dx) - 1; if (k > k0) k0 = k; } else if (e1dx < 0) { const k = Math.floor(-w1row / e1dx) + 1; if (k < k1) k1 = k; } else if (w1row < 0) continue;
        if (e2dx > 0) { const k = Math.ceil(-w2row / e2dx) - 1; if (k > k0) k0 = k; } else if (e2dx < 0) { const k = Math.floor(-w2row / e2dx) + 1; if (k < k1) k1 = k; } else if (w2row < 0) continue;
        if (k0 > k1) continue;
        let w0 = w0row + e0dx * k0, w1 = w1row + e1dx * k0, p = py * width + minX + k0;
        for (let px = minX + k0, end = minX + k1; px <= end; px++, w0 += e0dx, w1 += e1dx, p++) {
          if (w0 < 0 || w1 < 0) continue;
          const w2 = 1 - w0 - w1;
          if (w2 < 0) continue;
          const z = w0 * za + w1 * zb + w2 * zc;
          if (z <= zbuf[p]) continue;
          const iz1 = 1 / z;
          let r, g, bl;
          if (hasDiff) {
            sample(diff, (w0 * ua0 + w1 * ub0 + w2 * uc0) * iz1, (w0 * va0 + w1 * vb0 + w2 * vc0) * iz1, linD);
            if (cut && S[3] < 64) continue; // cut-out (decals, grilles)
            r = S[0]; g = S[1]; bl = S[2];
          } else { r = ur; g = ug; bl = ub; }
          if (liv) {
            sample(liv, (w0 * ua1 + w1 * ub1 + w2 * uc1) * iz1, (w0 * va1 + w1 * vb1 + w2 * vc1) * iz1, linL);
            const al = S[3] / 255;
            r += (S[0] - r) * al; g += (S[1] - g) * al; bl += (S[2] - bl) * al;
          }
          let light = w0 * sa + w1 * sb + w2 * sc;
          if (dimmed) { const gray = (r + g + bl) / 3; r = gray; g = gray; bl = gray; light *= 0.55; }
          const o = p * 4;
          if (glass) { // tinted see-through glass with a soft sheen
            const k = 0.42, gl = (0.55 + 0.45 * light) * k;
            rgba[o] = rgba[o] * (1 - k) + 70 * gl; rgba[o + 1] = rgba[o + 1] * (1 - k) + 82 * gl; rgba[o + 2] = rgba[o + 2] * (1 - k) + 96 * gl;
            continue;
          }
          zbuf[p] = z;
          if (glossy) { const gl = w0 * pa + w1 * pb + w2 * pc; r = r * light + gl; g = g * light + gl; bl = bl * light + gl; light = 1; }
          // Clamp: rgba is a plain Uint8Array, so values over 255 (bright paint + highlight) would wrap.
          r *= light; g *= light; bl *= light;
          rgba[o] = r > 255 ? 255 : r; rgba[o + 1] = g > 255 ? 255 : g; rgba[o + 2] = bl > 255 ? 255 : bl;
          meshId[p] = mi; triId[p] = t;
        }
      }
    }
  }
  if (full && options.smooth !== false) smoothEdges(rgba, meshId, width, height);
  return { rgba, width, height, meshId, triId, lod: useLod, basis: B, time: Date.now() - t0 };
}

// Cheap anti-aliasing for 1x frames: softens only silhouettes and part borders (where the mesh
// under the pixel changes) with enough contrast; textures inside a part stay sharp.
function smoothEdges(rgba, meshId, w, h) {
  const src = rgba.slice(), W4 = w * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1, p = y * w + 1; x < w - 1; x++, p++) {
      const m = meshId[p];
      if (m === meshId[p - 1] && m === meshId[p + 1] && m === meshId[p - w] && m === meshId[p + w]) continue;
      const o = p * 4, L = src[o] * 2 + src[o + 1] * 5 + src[o + 2];
      let lo = L, hi = L;
      for (let q = 0; q < 4; q++) {
        const s = q === 0 ? o - 4 : q === 1 ? o + 4 : q === 2 ? o - W4 : o + W4;
        const v = src[s] * 2 + src[s + 1] * 5 + src[s + 2]; if (v < lo) lo = v; if (v > hi) hi = v;
      }
      if (hi - lo < 96) continue;
      for (let k = 0; k < 3; k++) rgba[o + k] = (src[o + k] * 4 + src[o + k - 4] + src[o + k + 4] + src[o + k - W4] + src[o + k + W4] + 4) >> 3;
    }
  }
}

const SAMPLE = new Float32Array(4);
function magnified(uv, a, b, c, tex, pixArea) {
  const du1 = uv[b * 2] - uv[a * 2], dv1 = uv[b * 2 + 1] - uv[a * 2 + 1], du2 = uv[c * 2] - uv[a * 2], dv2 = uv[c * 2 + 1] - uv[a * 2 + 1];
  const texels = Math.abs(du1 * dv2 - dv1 * du2) * tex.width * tex.height;
  return texels < pixArea * 1.2;
}
function sample(tex, u, v, bilinear) {
  const w = tex.width, h = tex.height, d = tex.rgba;
  u -= Math.floor(u); v -= Math.floor(v);
  if (!bilinear) {
    let x = (u * w) | 0, y = (v * h) | 0; if (x >= w) x = w - 1; if (y >= h) y = h - 1;
    const o = (y * w + x) << 2;
    SAMPLE[0] = d[o]; SAMPLE[1] = d[o + 1]; SAMPLE[2] = d[o + 2]; SAMPLE[3] = d[o + 3];
    return SAMPLE;
  }
  const fx = u * w - 0.5, fy = v * h - 0.5;
  let x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  let x1 = x0 + 1, y1 = y0 + 1;
  if (x0 < 0) x0 += w; if (y0 < 0) y0 += h; if (x1 >= w) x1 -= w; if (y1 >= h) y1 -= h;
  const a = (y0 * w + x0) << 2, b = (y0 * w + x1) << 2, c = (y1 * w + x0) << 2, e = (y1 * w + x1) << 2;
  const k00 = (1 - tx) * (1 - ty), k10 = tx * (1 - ty), k01 = (1 - tx) * ty, k11 = tx * ty;
  SAMPLE[0] = d[a] * k00 + d[b] * k10 + d[c] * k01 + d[e] * k11;
  SAMPLE[1] = d[a + 1] * k00 + d[b + 1] * k10 + d[c + 1] * k01 + d[e + 1] * k11;
  SAMPLE[2] = d[a + 2] * k00 + d[b + 2] * k10 + d[c + 2] * k01 + d[e + 2] * k11;
  SAMPLE[3] = d[a + 3] * k00 + d[b + 3] * k10 + d[c + 3] * k01 + d[e + 3] * k11;
  return SAMPLE;
}

// Finds what is under pixel (x, y) of a previous render: mesh, triangle and its UVs there.
function pick(scene, frame, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return null;
  const p = y * frame.width + x, mi = frame.meshId[p];
  if (mi < 0) return null;
  const m = scene.meshes[mi], t = frame.triId[p], B = frame.basis;
  // Ray through the pixel centre.
  const px = (x + 0.5 - B.width / 2) / B.focal, py = -(y + 0.5 - B.height / 2) / B.focal;
  const dir = [0, 1, 2].map(k => B.fwd[k] + B.right[k] * px + B.up[k] * py);
  const I = frame.lod && m.lod ? m.lod : m.indices;
  const ia = I[t] * 3, ib = I[t + 1] * 3, ic = I[t + 2] * 3, P = m.world;
  const e1 = [P[ib] - P[ia], P[ib + 1] - P[ia + 1], P[ib + 2] - P[ia + 2]], e2 = [P[ic] - P[ia], P[ic + 1] - P[ia + 1], P[ic + 2] - P[ia + 2]];
  const h = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
  const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
  let b1 = 1 / 3, b2 = 1 / 3;
  if (Math.abs(det) > 1e-12) {
    const s = [B.eye[0] - P[ia], B.eye[1] - P[ia + 1], B.eye[2] - P[ia + 2]];
    b1 = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    b2 = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) / det;
    b1 = Math.min(1, Math.max(0, b1)); b2 = Math.min(1 - b1, Math.max(0, b2));
  }
  const b0 = 1 - b1 - b2;
  const uvAt = uv => uv ? [0, 1].map(k => b0 * uv[I[t] * 2 + k] + b1 * uv[I[t + 1] * 2 + k] + b2 * uv[I[t + 2] * 2 + k]) : null;
  return { mesh: m, uv0: uvAt(m.uv[0]), uv1: uvAt(m.uv[1]), diffuse: m.diffuse, livery: m.livery };
}

// ---- display helpers: 32-bit BMP data URL (works everywhere an <img> does) ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes) {
  let out = '', i = 0;
  const chunk = [];
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    chunk.push(B64[n >> 18], B64[(n >> 12) & 63], B64[(n >> 6) & 63], B64[n & 63]);
    if (chunk.length > 32768) { out += chunk.join(''); chunk.length = 0; }
  }
  out += chunk.join('');
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((i + 1 < bytes.length ? bytes[i + 1] : 0) << 8);
    out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + '=';
  }
  return out;
}
function toBmp(rgba, width, height) {
  const size = 54 + width * height * 4, b = new Uint8Array(size), dv = new DataView(b.buffer);
  b[0] = 66; b[1] = 77; dv.setUint32(2, size, true); dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true); dv.setInt32(18, width, true); dv.setInt32(22, -height, true); // top-down
  dv.setUint16(26, 1, true); dv.setUint16(28, 32, true); dv.setUint32(34, width * height * 4, true);
  for (let i = 0, o = 54; i < width * height; i++, o += 4) { b[o] = rgba[i * 4 + 2]; b[o + 1] = rgba[i * 4 + 1]; b[o + 2] = rgba[i * 4]; b[o + 3] = 255; }
  return b;
}
const toDataUrl = (rgba, width, height) => 'data:image/bmp;base64,' + base64(toBmp(rgba, width, height));

module.exports = { Scene, render, pick, buildLod, smoothEdges, toBmp, toDataUrl, base64, cameraBasis };

// ---- PNG data URL with stored (uncompressed) deflate blocks: fast to build, valid everywhere ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b, s, e) { let c = 0xffffffff; for (let i = s; i < e; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function toPng(rgba, width, height) {
  const row = width * 3 + 1, raw = height * row, blocks = Math.ceil(raw / 65535);
  const zlen = 2 + raw + blocks * 5 + 4, size = 8 + 25 + 12 + zlen + 12;
  const b = new Uint8Array(size), dv = new DataView(b.buffer);
  b.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let o = 8;
  const chunk = (type, len, fill) => { dv.setUint32(o, len); for (let i = 0; i < 4; i++) b[o + 4 + i] = type.charCodeAt(i); fill(o + 8); dv.setUint32(o + 8 + len, crc32(b, o + 4, o + 8 + len)); o += 12 + len; };
  chunk('IHDR', 13, p => { dv.setUint32(p, width); dv.setUint32(p + 4, height); b[p + 8] = 8; b[p + 9] = 2; });
  chunk('IDAT', zlen, p => {
    b[p] = 0x78; b[p + 1] = 0x01; p += 2;
    let a1 = 1, a2 = 0, left = raw, y = 0, x = -1, blockLeft = 0;
    while (left > 0) {
      const n = Math.min(65535, left); left -= n;
      b[p] = left ? 0 : 1; b[p + 1] = n & 255; b[p + 2] = n >>> 8; b[p + 3] = ~n & 255; b[p + 4] = (~n >>> 8) & 255; p += 5;
      for (blockLeft = n; blockLeft > 0; blockLeft--) {
        let v;
        if (x < 0) v = 0; else { const s = (y * width + (x / 3 | 0)) * 4 + (x % 3); v = rgba[s]; }
        b[p++] = v; a1 = (a1 + v) % 65521; a2 = (a2 + a1) % 65521;
        if (++x >= width * 3) { x = -1; y++; }
      }
    }
    dv.setUint32(p, ((a2 << 16) | a1) >>> 0);
  });
  chunk('IEND', 0, () => {});
  return b;
}
const toPngDataUrl = (rgba, width, height) => 'data:image/png;base64,' + base64(toPng(rgba, width, height));
module.exports.toPng = toPng;
module.exports.toPngDataUrl = toPngDataUrl;
