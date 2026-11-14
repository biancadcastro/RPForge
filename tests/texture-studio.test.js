// RPForge Texture Studio: engine and panel tests.
// Synthetic tests always run. Real-vehicle tests run when RPFORGE_VEHICLE_DIR points to a
// folder with <name>.yft and <name>.ytd (GTA V Legacy); they never modify that folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const E = '../photoshop/texture-studio/engine/';
const { inflateRaw } = require(E + 'inflate.js');
const { deflateRaw } = require(E + 'deflate.js');
const bc = require(E + 'bc.js');
const ytd = require(E + 'ytd.js');
const rsc7 = require(E + 'rsc7.js');
const { VehicleSession, replaceTexture } = require(E + 'index.js');
const { loadPanel } = require('./texture-studio-panel-sim.cjs');

function pseudoRandom(n, seed = 7) { const out = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; out[i] = x >>> 24; } return out; }
function gradient(w, h, alpha = 255) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; px[o] = x * 255 / (w - 1); px[o + 1] = y * 255 / (h - 1); px[o + 2] = (x + y) % 256; px[o + 3] = alpha; }
  return px;
}
function psnr(a, b, skipAlpha = false) {
  let se = 0, n = 0;
  for (let i = 0; i < a.length; i++) { if (skipAlpha && i % 4 === 3) continue; const d = a[i] - b[i]; se += d * d; n++; }
  return se === 0 ? Infinity : 10 * Math.log10(255 * 255 / (se / n));
}
async function syntheticYtd() {
  const base = { name: 'vehicle_sign_1', struct: new Uint8Array(ytd.TEXTURE_SIZE) };
  base.struct[4] = 1; base.struct[0x30] = 1;
  const a = await ytd.buildTexture(base, gradient(64, 64), 64, 64, 'DXT5');
  const b = await ytd.buildTexture({ name: 'carbon', struct: base.struct.slice() }, gradient(128, 64), 128, 64, 'DXT1');
  const root = new Uint8Array(0x40); root[4] = 1; root[0x18] = 1;
  return ytd.writeYtd({ root, textures: [a, b] });
}

test('own DEFLATE interoperates with zlib both ways', () => {
  for (const data of [new Uint8Array(0), new Uint8Array([42]), new Uint8Array(100000).fill(3), pseudoRandom(150000), gradient(256, 256)]) {
    const ours = deflateRaw(data);
    assert.deepEqual(new Uint8Array(inflateRawSync(ours)), data);
    const theirs = deflateRawSync(data, { level: 9 });
    assert.deepEqual(inflateRaw(new Uint8Array(theirs), data.length), data);
  }
});

test('RSC7 page packing keeps blocks inside pages and the root first', () => {
  const blocks = [{ size: 0x40, align: 16 }, ...[0x9000, 0x20, 0x3000, 0x1ff0, 0x10].map(size => ({ size, align: 16 }))];
  const r = rsc7.packRegion(blocks);
  const pages = rsc7.pageSizes(r.flags), page = pages[0];
  assert.equal(blocks[0].offset, 0);
  assert.equal(pages.reduce((a, b) => a + b, 0), r.size);
  for (const b of blocks) assert.equal(Math.floor(b.offset / page), Math.floor((b.offset + b.size - 1) / page), 'block crosses a page');
});

test('BC codecs round-trip with good quality', () => {
  const img = gradient(64, 64);
  assert.ok(psnr(bc.decode('DXT1', bc.encode('DXT1', img, 64, 64), 64, 64), img, true) > 30);
  assert.ok(psnr(bc.decode('DXT5', bc.encode('DXT5', img, 64, 64), 64, 64), img) > 30);
  assert.ok(psnr(bc.decode('BC7', bc.encode('BC7', img, 64, 64), 64, 64), img) > 34);
  assert.deepEqual(bc.decode('A8R8G8B8', bc.encode('A8R8G8B8', img, 64, 64), 64, 64), img);
  assert.equal(bc.gtaLevels(512, 512), 8);
  assert.equal(bc.gtaLevels(128, 512), 6);
  assert.equal(bc.gtaLevels(4, 4), 1);
  assert.equal(bc.strideOf('DXT5', 512), 512);
  assert.equal(bc.strideOf('DXT1', 512), 256);
});

test('YTD write/read keeps textures and replaceTexture swaps one', async () => {
  const bytes = await syntheticYtd();
  const d = ytd.readYtd(bytes);
  assert.deepEqual(d.textures.map(t => [t.name, t.width, t.height, t.format]).sort(), [['carbon', 128, 64, 'DXT1'], ['vehicle_sign_1', 64, 64, 'DXT5']]);
  const red = new Uint8Array(256 * 256 * 4); for (let i = 0; i < red.length; i += 4) red.set([200, 10, 30, 255], i);
  const r = await replaceTexture(bytes, 'vehicle_sign_1', red, 256, 256, { format: 'BC7' });
  const s = new VehicleSession({ ytd: r.bytes });
  const t = s.textures().find(x => x.name === 'vehicle_sign_1');
  assert.equal(t.width, 256); assert.equal(t.format, 'BC7'); assert.equal(t.levels, 7);
  const px = Array.from(s.pixels('vehicle_sign_1').rgba.subarray(0, 4));
  assert.equal(px[3], 255, 'opaque alpha stays exact in BC7');
  [200, 10, 30].forEach((v, i) => assert.ok(Math.abs(px[i] - v) <= 2, `channel ${i}: ${px[i]} vs ${v}`));
  assert.deepEqual(s.pixels('carbon').rgba, new VehicleSession({ ytd: bytes }).pixels('carbon').rgba);
  const added = await replaceTexture(bytes, 'brand_new', red, 256, 256);
  assert.equal(added.added, true); assert.equal(added.textures, 3);
});

test('engine refuses non-RSC7 and Enhanced files with clear messages', () => {
  assert.throws(() => new VehicleSession({ ytd: new Uint8Array(64) }), /não é um recurso RSC7/);
  const fake = new Uint8Array(32); fake.set([0x52, 0x53, 0x43, 0x37, 5]);
  assert.throws(() => new VehicleSession({ ytd: fake }), /Enhanced/);
});

test('panel: open YTD, open texture, paint, save with one backup', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rpforge-panel-'));
  try {
    const file = path.join(dir, 'car.ytd');
    writeFileSync(file, await syntheticYtd());
    const p = loadPanel();
    p.queue.open.push(file);
    await p.$('openVehicle').click(); await p.settle();
    assert.match(p.$('message').textContent, /Pronto/);
    // Without a model every texture of the YTD is listed.
    const row = p.$('list').children.find(r => r.className.includes('item') && r.textContent.includes('vehicle_sign_1'));
    assert.ok(row, 'texture row');
    await row.children[1].click(); await p.settle();
    const doc = p.photoshop.app.activeDocument;
    assert.equal(doc.width, 2048); // tiny placeholder grows to 2048
    assert.deepEqual(doc.layers.map(l => l.name), ['Pintura', 'Textura original']);
    const paint = doc.layers[0];
    paint.pixels = new Uint8Array(2048 * 2048 * 4); for (let i = 0; i < paint.pixels.length; i += 4) paint.pixels.set([10, 120, 240, 255], i);
    await p.$('saveBtn').click(); await p.settle();
    assert.match(p.$('message').textContent, /Salvo em car\.ytd/, p.$('message').textContent);
    await p.$('saveBtn').click(); await p.settle();
    const backups = readdirSync(dir).filter(n => n.includes('.backup-'));
    assert.equal(backups.length, 1, 'one backup per session');
    const s = new VehicleSession({ ytd: new Uint8Array(readFileSync(file)) });
    const t = s.textures().find(x => x.name === 'vehicle_sign_1');
    assert.equal(t.width, 2048); assert.equal(t.format, 'DXT5');
    const got = Array.from(s.pixels('vehicle_sign_1').rgba.subarray(0, 4));
    [10, 120, 240, 255].forEach((v, i) => assert.ok(Math.abs(got[i] - v) <= 4, `channel ${i}: ${got[i]} vs ${v}`));
    assert.ok(new VehicleSession({ ytd: new Uint8Array(readFileSync(path.join(dir, backups[0]))) }).textures().find(x => x.name === 'vehicle_sign_1').width === 64, 'backup holds the original');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('panel: a reopened PSD remembers its texture and reloads the files by itself', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rpforge-reopen-'));
  try {
    const file = path.join(dir, 'car.ytd');
    writeFileSync(file, await syntheticYtd());
    const first = loadPanel();
    first.queue.open.push(file);
    await first.$('openVehicle').click(); await first.settle();
    const row = first.$('list').children.find(r => r.className.includes('item') && r.textContent.includes('vehicle_sign_1'));
    await row.children[1].click(); await first.settle();
    const saved = first.photoshop.app.activeDocument;
    assert.match(saved._xmp, /rpforge:link/, 'link written into the document metadata');
    // Photoshop restarted, panel fresh (empty storage), the PSD opened again: new document id.
    const again = loadPanel();
    const doc = await again.photoshop.app.documents.add({ width: saved.width, height: saved.height });
    doc._xmp = saved._xmp;
    await again.photoshop.fire(); await again.settle();
    assert.match(again.$('ytdName').textContent, /car.ytd/, 'the .ytd was reloaded');
    assert.ok(!again.$('docCard').classList.contains('hidden'), 'the document is linked again');
    assert.match(again.$('docInfo').innerHTML, /vehicle_sign_1/);
    assert.match(again.$('message').textContent, /reaberto/, again.$('message').textContent);
    // and it still saves to the same .ytd
    doc.layers[0].pixels = new Uint8Array(doc.width * doc.height * 4).fill(200);
    await again.$('saveBtn').click(); await again.settle();
    assert.match(again.$('message').textContent, /Salvo em car.ytd/, again.$('message').textContent);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const VEHICLE_DIR = process.env.RPFORGE_VEHICLE_DIR;
const vehicle = VEHICLE_DIR && existsSync(VEHICLE_DIR) ? readdirSync(VEHICLE_DIR).find(n => /\.yft$/i.test(n) && !/_hi\.yft$/i.test(n) && existsSync(path.join(VEHICLE_DIR, n.replace(/\.yft$/i, '.ytd')))) : null;

test('real vehicle: opening NAME_hi.yft finds NAME.ytd in the folder', { skip: !vehicle && 'RPFORGE_VEHICLE_DIR not set' }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rpforge-hi-'));
  try {
    const stem = vehicle.replace(/\.yft$/i, '');
    copyFileSync(path.join(VEHICLE_DIR, stem + '.yft'), path.join(dir, stem + '_hi.yft'));
    copyFileSync(path.join(VEHICLE_DIR, stem + '.ytd'), path.join(dir, stem + '.ytd'));
    const p = loadPanel();
    p.queue.open.push(path.join(dir, stem + '_hi.yft'));
    await p.$('openVehicle').click(); await p.settle();
    assert.match(p.$('ytdName').textContent, new RegExp(stem + '\\.ytd', 'i'), p.$('ytdName').textContent);
    // Open the livery, then "reopen the PSD" in a fresh panel: the car comes back by itself.
    const row = p.$('list').children.find(r => r.className.includes('item'));
    await row.children[1].click(); await p.settle();
    const saved = p.photoshop.app.activeDocument;
    const again = loadPanel();
    const doc = await again.photoshop.app.documents.add({ width: saved.width, height: saved.height });
    doc._xmp = saved._xmp;
    await again.photoshop.fire(); await again.settle();
    assert.match(again.$('yftName').textContent, new RegExp(stem + '_hi\\.yft', 'i'), 'model reloaded');
    assert.match(again.$('ytdName').textContent, new RegExp(stem + '\\.ytd', 'i'), 'textures reloaded');
    assert.ok(!again.$('docCard').classList.contains('hidden'), 'document linked again');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('real vehicle: livery opens on UV1 with guides; save keeps the other textures', { skip: !vehicle && 'RPFORGE_VEHICLE_DIR not set' }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rpforge-vehicle-'));
  try {
    const stem = vehicle.replace(/\.yft$/i, '');
    copyFileSync(path.join(VEHICLE_DIR, stem + '.yft'), path.join(dir, stem + '.yft'));
    copyFileSync(path.join(VEHICLE_DIR, stem + '.ytd'), path.join(dir, stem + '.ytd'));
    const before = new VehicleSession({ ytd: new Uint8Array(readFileSync(path.join(dir, stem + '.ytd'))) });
    const p = loadPanel();
    p.queue.open.push(path.join(dir, stem + '.yft'));
    await p.$('openVehicle').click(); await p.settle();
    assert.match(p.$('ytdName').textContent, new RegExp(stem + '\\.ytd', 'i'), 'YTD found next to the YFT');
    assert.equal(p.$('list').children[0].textContent, 'Liveries', 'liveries come first');
    assert.ok(!p.$('list').children.some(r => r.textContent === 'Do jogo'), 'game textures hidden by default');
    const row = p.$('list').children.find(r => r.className.includes('item'));
    const name = row.children[0].children[0].textContent;
    await row.children[1].click(); await p.settle();
    const doc = p.photoshop.app.activeDocument;
    const guides = doc.layers.filter(l => l.name.startsWith('Guia UV'));
    assert.ok(guides.length >= 1 && guides.filter(g => g.visible).length === 1, 'exactly one guide visible');
    await p.$('saveBtn').click(); await p.settle();
    assert.match(p.$('message').textContent, /Salvo em/, p.$('message').textContent);
    const after = new VehicleSession({ ytd: new Uint8Array(readFileSync(path.join(dir, stem + '.ytd'))) });
    for (const t of before.textures()) if (t.name !== name) assert.deepEqual(after.pixels(t.name).rgba, before.pixels(t.name).rgba, t.name);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('OBJ reader flips V and groups by material; MTL finds the diffuse image', () => {
  const { readObj, readMtl } = require(E + 'obj.js');
  const obj = readObj('mtllib m.mtl\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl Pele\nf 1/1 2/2 3/3 4/4\n');
  assert.equal(obj.triangles, 2);
  assert.deepEqual(obj.mtllibs, ['m.mtl']);
  const uv = obj.usage.get('pele').uses[0].uv;
  assert.deepEqual(Array.from(uv.subarray(0, 6)), [0, 1, 1, 1, 1, 0]); // v flipped
  assert.equal(readMtl('newmtl Pele\nmap_Kd -s 1 1 1 textures/pele diff.png\n').get('pele').diffuse, 'textures/pele diff.png');
  assert.throws(() => readObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'), /não tem coordenadas de textura/);
});

test('panel: OBJ opens its PNG with guides and saves the image with a backup', async () => {
  const { encodePng } = require('./texture-studio-panel-sim.cjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'rpforge-obj-'));
  try {
    writeFileSync(path.join(dir, 'shirt.obj'), 'mtllib shirt.mtl\nv 0 0 0\nv 1 0 0\nv 1 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nusemtl Shirt\nf 1/1 2/2 3/3\n');
    writeFileSync(path.join(dir, 'shirt.mtl'), 'newmtl Shirt\nmap_Kd shirt_diff.png\n');
    writeFileSync(path.join(dir, 'shirt_diff.png'), encodePng({ width: 64, height: 32, layers: [{}] }));
    const p = loadPanel();
    p.queue.open.push(path.join(dir, 'shirt.obj'));
    await p.$('openVehicle').click(); await p.settle();
    assert.match(p.$('ytdName').textContent, /shirt_diff\.png/);
    const row = p.$('list').children.find(r => r.className.includes('item'));
    assert.match(row.textContent, /Shirt/);
    await row.children[1].click(); await p.settle();
    const doc = p.photoshop.app.activeDocument;
    assert.deepEqual(doc.layers.map(l => l.name), ['Guia UV 0 (não é salvo)', 'Guia UV sombreado (não é salvo)', 'Pintura', 'Textura original']);
    assert.equal(doc.layers[1].visible, false, 'overlays start hidden');
    assert.equal(doc.width, 64);
    doc.layers[2].pixels = new Uint8Array(64 * 32 * 4).fill(200);
    await p.$('saveBtn').click(); await p.settle();
    assert.match(p.$('message').textContent, /Salvo em shirt_diff\.png/, p.$('message').textContent);
    const saved = p.log.find(x => x[0] === 'savePng');
    assert.ok(saved && !saved[2].some(n => n.startsWith('Guia UV')), 'guides are not saved');
    assert.equal(readdirSync(dir).filter(n => n.includes('.backup-')).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const CLOTHING_DIR = process.env.RPFORGE_CLOTHING_DIR;
test('real clothing: YDD finds its YTD and saves the diffuse', { skip: !(CLOTHING_DIR && existsSync(CLOTHING_DIR)) && 'RPFORGE_CLOTHING_DIR not set' }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rpforge-ydd-'));
  try {
    for (const n of readdirSync(CLOTHING_DIR).filter(n => /\.(ydd|ytd)$/i.test(n))) copyFileSync(path.join(CLOTHING_DIR, n), path.join(dir, n));
    const ydd = readdirSync(dir).find(n => /\.ydd$/i.test(n));
    const p = loadPanel();
    p.queue.open.push(path.join(dir, ydd));
    await p.$('openVehicle').click(); await p.settle();
    assert.match(p.$('ytdName').textContent, /\.ytd/, 'YTD discovered');
    assert.match(p.$('modelKind').textContent, /Roupa/);
    const rows = p.$('list').children.filter(r => r.className.includes('item'));
    const editable = rows.find(r => !/dentro do modelo|do jogo/.test(r.textContent));
    assert.ok(editable, 'a texture from the YTD is listed');
    await editable.children[1].click(); await p.settle();
    await p.$('saveBtn').click(); await p.settle();
    assert.match(p.$('message').textContent, /Salvo em .*\.ytd/, p.$('message').textContent);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('3D renderer draws a textured quad and picking returns its UV', () => {
  const render = require(E + 'render.js');
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const scene = new render.Scene([{ id: 'q', positions, normals: null, uv: [uv, null], indices: new Uint16Array([0, 1, 2, 0, 2, 3]), diffuse: 'tex', livery: null }], 'y');
  const tex = new Uint8Array(4 * 4 * 4); for (let i = 0; i < 16; i++) tex.set(i % 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
  scene.setTexture('tex', { rgba: tex, width: 4, height: 4 });
  const frame = render.render(scene, { yaw: 0, pitch: 0, distance: 3, panX: 0, panY: 0 }, 200, 150);
  const c = (75 * 200 + 100) * 4;
  assert.ok(frame.meshId[75 * 200 + 100] === 0, 'quad covers the centre');
  assert.ok(frame.rgba[c] > 0 || frame.rgba[c + 2] > 0, 'textured colour');
  const hit = render.pick(scene, frame, 100, 75);
  assert.ok(Math.abs(hit.uv0[0] - 0.5) < 0.02 && Math.abs(hit.uv0[1] - 0.5) < 0.02, `uv ${hit.uv0}`);
  const png = render.toPng(frame.rgba, 200, 150);
  assert.deepEqual(Array.from(png.subarray(0, 4)), [137, 80, 78, 71]);
});

test('panel: 3D preview draws the model and marks the clicked point with guides', async () => {
  const { encodePng } = require('./texture-studio-panel-sim.cjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'rpforge-3d-'));
  try {
    writeFileSync(path.join(dir, 'board.obj'), 'mtllib board.mtl\nv -1 -1 0\nv 1 -1 0\nv 1 1 0\nv -1 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl Board\nf 1/1 2/2 3/3 4/4\n');
    writeFileSync(path.join(dir, 'board.mtl'), 'newmtl Board\nmap_Kd board.png\n');
    writeFileSync(path.join(dir, 'board.png'), encodePng({ width: 100, height: 100, layers: [{}] }));
    const p = loadPanel();
    p.queue.open.push(path.join(dir, 'board.obj'));
    await p.$('openVehicle').click(); await p.settle();
    const row = p.$('list').children.find(r => r.className.includes('item'));
    await row.children[1].click(); await p.settle();
    await new Promise(r => setTimeout(r, 300));
    assert.match(p.$('pvImage').src || '', /^data:image\/png;base64,/, 'preview rendered');
    await p.$('pvReset').click(); await new Promise(r => setTimeout(r, 300));
    // Front view so the board faces the camera, then click its centre in "mark point" mode.
    await p.$('pvPick').click();
    const stage = p.$('pvStage');
    for (const fn of stage.listeners.mousedown) fn({ clientX: 240, clientY: 180, button: 0 });
    for (const fn of stage.listeners.mouseup) await fn({ clientX: 240, clientY: 180, button: 0 });
    await new Promise(r => setTimeout(r, 300));
    const guides = p.log.filter(x => x[0] === 'guide');
    assert.equal(guides.length, 2, p.$('pvStatus').textContent);
    for (const [, , coordinate] of guides) assert.ok(coordinate > 20 && coordinate < 80, `guide at ${coordinate}`);
    assert.match(p.$('pvStatus').textContent, /Ponto marcado/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('panel: 3D preview shows what Photoshop composites (fill layers, guides hidden)', async () => {
  const { encodePng } = require('./texture-studio-panel-sim.cjs');
  const { decodePng } = require(E + 'png.js');
  const dir = mkdtempSync(path.join(tmpdir(), 'rpforge-fill-'));
  try {
    writeFileSync(path.join(dir, 'board.obj'), 'mtllib board.mtl\nv -1 -1 0\nv 1 -1 0\nv 1 1 0\nv -1 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl Board\nf 1/1 2/2 3/3 4/4\n');
    writeFileSync(path.join(dir, 'board.mtl'), 'newmtl Board\nmap_Kd board.png\n');
    const white = { width: 2400, height: 2400, layers: [{ pixels: new Uint8Array(2400 * 2400 * 4).fill(255) }] }; // > 1024: the preview reads it reduced
    writeFileSync(path.join(dir, 'board.png'), encodePng(white));
    const p = loadPanel();
    p.queue.open.push(path.join(dir, 'board.obj'));
    await p.$('openVehicle').click(); await p.settle();
    await p.$('list').children.find(r => r.className.includes('item')).children[1].click(); await p.settle();
    const doc = p.photoshop.app.activeDocument;
    // A solid-colour fill layer (red) right above the texture: it has no pixels of its own.
    const fill = p.photoshop.makeLayer(doc, 'Preenchimento', 100, 'fill');
    fill.pixels = new Uint8Array(doc.width * doc.height * 4); for (let i = 3; i < fill.pixels.length; i += 4) fill.pixels.set([220, 30, 30, 255], i - 3);
    doc.layers.splice(doc.layers.length - 1, 0, fill);
    const visibleBefore = doc.layers.map(l => l.visible);
    await p.$('pvRefresh').click(); await new Promise(r => setTimeout(r, 400));
    const shot = decodePng(Uint8Array.from(Buffer.from(p.$('pvImage').src.split(',')[1], 'base64')));
    // The whole board must be black, not only one corner of the texture.
    for (const [fx, fy] of [[0.5, 0.5], [0.42, 0.42], [0.58, 0.42], [0.42, 0.58], [0.58, 0.58]]) {
      const o = (Math.round(shot.height * fy) * shot.width + Math.round(shot.width * fx)) * 4;
      assert.ok(shot.rgba[o] > 100 && shot.rgba[o + 1] < 60, `(${fx}, ${fy}) should be red, got ${shot.rgba.slice(o, o + 3)}`);
    }
    assert.deepEqual(doc.layers.map(l => l.visible), visibleBefore, 'guides visible again');
    assert.ok(p.log.some(x => x[0] === 'resume' && x[1] === false), 'history rolled back');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('TGA decoder reads raw and RLE true-colour images', () => {
  const { decodeTga } = require(E + 'image.js');
  const header = (type) => { const h = new Uint8Array(18); h[2] = type; h[12] = 2; h[14] = 1; h[16] = 24; h[17] = 0x20; return h; };
  const raw = new Uint8Array([...header(2), 10, 20, 30, 40, 50, 60]);
  assert.deepEqual(Array.from(decodeTga(raw).rgba), [30, 20, 10, 255, 60, 50, 40, 255]);
  const rle = new Uint8Array([...header(10), 0x81, 1, 2, 3]);
  assert.deepEqual(Array.from(decodeTga(rle).rgba), [3, 2, 1, 255, 3, 2, 1, 255]);
});

test('real vehicle: wheels are placed on all four wheel bones', { skip: !vehicle && 'RPFORGE_VEHICLE_DIR not set' }, () => {
  const { readModel } = require(E + 'yft.js');
  const model = readModel(new Uint8Array(readFileSync(path.join(VEHICLE_DIR, vehicle))), 'yft');
  const wheels = [...new Set(model.meshes.filter(m => /^wheel_/i.test(m.id)).map(m => m.id.split(':')[0].toLowerCase()))].sort();
  assert.deepEqual(wheels, ['wheel_lf', 'wheel_lr', 'wheel_rf', 'wheel_rr']);
});

test('real clothing: a texture inside the YDD is saved in place', { skip: !(CLOTHING_DIR && existsSync(CLOTHING_DIR)) && 'RPFORGE_CLOTHING_DIR not set' }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rpforge-embedded-'));
  try {
    for (const n of readdirSync(CLOTHING_DIR).filter(n => /\.(ydd|ytd)$/i.test(n))) copyFileSync(path.join(CLOTHING_DIR, n), path.join(dir, n));
    const ydd = readdirSync(dir).find(n => /\.ydd$/i.test(n));
    const p = loadPanel();
    p.queue.open.push(path.join(dir, ydd));
    await p.$('openVehicle').click(); await p.settle();
    const row = p.$('list').children.find(r => /dentro do modelo/.test(r.textContent));
    assert.ok(row, 'embedded texture listed');
    await row.children[1].click(); await p.settle();
    await p.$('saveBtn').click(); await p.settle();
    assert.match(p.$('message').textContent, new RegExp(`Salvo em ${ydd.replace('.', '\.')}`), p.$('message').textContent);
    assert.equal(readdirSync(dir).filter(n => n.includes('.backup-') && n.endsWith('.ydd')).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
