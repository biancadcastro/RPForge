'use strict';
// RPForge texture engine — UV guide rasterizer. Draws UV triangles into an RGBA8 image:
// translucent fill plus anti-aliased edges, on a transparent background.

const DEFAULT_STYLE = { fill: [0, 200, 255, 46], edge: [0, 235, 255, 235] };

function blendMax(img, w, h, x, y, color, coverage) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const o = (y * w + x) * 4, a = Math.round(color[3] * coverage);
  if (a <= img[o + 3]) return;
  img[o] = color[0]; img[o + 1] = color[1]; img[o + 2] = color[2]; img[o + 3] = a;
}

// Xiaolin Wu anti-aliased line.
function line(img, w, h, x0, y0, x1, y1, color) {
  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  if (steep) { [x0, y0] = [y0, x0]; [x1, y1] = [y1, x1]; }
  if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
  const dx = x1 - x0, dy = y1 - y0, gradient = dx === 0 ? 1 : dy / dx;
  const plot = (x, y, c) => steep ? blendMax(img, w, h, y, x, color, c) : blendMax(img, w, h, x, y, color, c);
  let xs = Math.round(x0), xe = Math.round(x1);
  let inter = y0 + gradient * (xs - x0);
  if (xe - xs > 4 * (w + h)) return; // degenerate
  for (let x = xs; x <= xe; x++) {
    const yi = Math.floor(inter), f = inter - yi;
    plot(x, yi, 1 - f); plot(x, yi + 1, f);
    inter += gradient;
  }
}

// Scanline fill (no anti-aliasing; edges cover the boundary).
function fillTriangle(img, w, h, ax, ay, bx, by, cx, cy, color) {
  if (ay > by) { [ax, ay, bx, by] = [bx, by, ax, ay]; }
  if (ay > cy) { [ax, ay, cx, cy] = [cx, cy, ax, ay]; }
  if (by > cy) { [bx, by, cx, cy] = [cx, cy, bx, by]; }
  const y0 = Math.max(0, Math.ceil(ay - 0.5)), y1 = Math.min(h - 1, Math.floor(cy - 0.5));
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    const xa = cy === ay ? ax : ax + (cx - ax) * (py - ay) / (cy - ay);
    const xb = py < by ? (by === ay ? ax : ax + (bx - ax) * (py - ay) / (by - ay)) : (cy === by ? bx : bx + (cx - bx) * (py - by) / (cy - by));
    let l = Math.max(0, Math.ceil(Math.min(xa, xb) - 0.5)), r = Math.min(w - 1, Math.floor(Math.max(xa, xb) - 0.5));
    for (let x = l; x <= r; x++) blendMax(img, w, h, x, y, color, 1);
  }
}

// uses: [{uv: Float32Array, indices: Uint16Array}]; returns { rgba, skipped, drawn }.
function drawGuide(uses, w, h, style = DEFAULT_STYLE) {
  const img = new Uint8Array(w * h * 4);
  const tris = [];
  let skipped = 0;
  for (const u of uses) {
    const { uv, indices } = u;
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = indices[i] * 2, b = indices[i + 1] * 2, c = indices[i + 2] * 2;
      const u0 = uv[a], v0 = uv[a + 1], u1 = uv[b], v1 = uv[b + 1], u2 = uv[c], v2 = uv[c + 1];
      if (!(Number.isFinite(u0) && Number.isFinite(v0) && Number.isFinite(u1) && Number.isFinite(v1) && Number.isFinite(u2) && Number.isFinite(v2))) { skipped++; continue; }
      // Tiling materials repeat the texture inside one triangle: not paintable 1:1, leave them out.
      if (Math.max(u0, u1, u2) - Math.min(u0, u1, u2) > 1 || Math.max(v0, v1, v2) - Math.min(v0, v1, v2) > 1) { skipped++; continue; }
      const ou = Math.floor((u0 + u1 + u2) / 3), ov = Math.floor((v0 + v1 + v2) / 3);
      tris.push((u0 - ou) * w, (v0 - ov) * h, (u1 - ou) * w, (v1 - ov) * h, (u2 - ou) * w, (v2 - ov) * h);
    }
  }
  for (let i = 0; i < tris.length; i += 6) fillTriangle(img, w, h, tris[i], tris[i + 1], tris[i + 2], tris[i + 3], tris[i + 4], tris[i + 5], style.fill);
  for (let i = 0; i < tris.length; i += 6) {
    const [ax, ay, bx, by, cx, cy] = [tris[i], tris[i + 1], tris[i + 2], tris[i + 3], tris[i + 4], tris[i + 5]];
    line(img, w, h, ax, ay, bx, by, style.edge); line(img, w, h, bx, by, cx, cy, style.edge); line(img, w, h, cx, cy, ax, ay, style.edge);
  }
  return { rgba: img, skipped, drawn: tris.length / 6 };
}

// Overlays like Photoshop's old 3D "Create UV Overlays": 'shaded' (lit model) or 'normal'
// (model-space normal map), rasterized in texture space with per-vertex colours.
function drawOverlay(meshes, channel, kind, w, h, up = 'z') {
  const img = new Uint8ClampedArray(w * h * 4);
  const L = up === 'z' ? [0.35, -0.45, 0.82] : [0.35, 0.82, 0.45];
  const ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
  const color = (n, i, out) => {
    const nx = n ? n[i * 3] : 0, ny = n ? n[i * 3 + 1] : 0, nz = n ? n[i * 3 + 2] : 1;
    if (kind === 'normal') { out[0] = (nx * 0.5 + 0.5) * 255; out[1] = (ny * 0.5 + 0.5) * 255; out[2] = (nz * 0.5 + 0.5) * 255; return; }
    const d = nx * L[0] + ny * L[1] + nz * L[2], h = 0.5 + 0.5 * d, v = 60 + 195 * h * h; // half-Lambert: soft, never black
    out[0] = out[1] = out[2] = v;
  };
  const ca = [0, 0, 0], cb = [0, 0, 0], cc = [0, 0, 0];
  let skipped = 0, drawn = 0;
  for (const m of meshes) {
    const uv = m.uv[channel], idx = m.indices, n = m.normals;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const u0 = uv[a * 2], v0 = uv[a * 2 + 1], u1 = uv[b * 2], v1 = uv[b * 2 + 1], u2 = uv[c * 2], v2 = uv[c * 2 + 1];
      if (Math.max(u0, u1, u2) - Math.min(u0, u1, u2) > 1 || Math.max(v0, v1, v2) - Math.min(v0, v1, v2) > 1 || !Number.isFinite(u0 + v0 + u1 + v1 + u2 + v2)) { skipped++; continue; }
      const ou = Math.floor((u0 + u1 + u2) / 3), ov = Math.floor((v0 + v1 + v2) / 3);
      const ax = (u0 - ou) * w, ay = (v0 - ov) * h, bx = (u1 - ou) * w, by = (v1 - ov) * h, cx = (u2 - ou) * w, cy = (v2 - ov) * h;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (!area) continue;
      color(n, a, ca); color(n, b, cb); color(n, c, cc);
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        // small tolerance closes hairline gaps between neighbouring triangles
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        const o = (y * w + x) * 4;
        img[o] = w0 * ca[0] + w1 * cb[0] + w2 * cc[0]; img[o + 1] = w0 * ca[1] + w1 * cb[1] + w2 * cc[1]; img[o + 2] = w0 * ca[2] + w1 * cb[2] + w2 * cc[2]; img[o + 3] = 255;
      }
      drawn++;
    }
  }
  return { rgba: new Uint8Array(img.buffer), skipped, drawn };
}

module.exports = { drawGuide, drawOverlay, DEFAULT_STYLE };
