import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {decodeYftResource, encodeYftResource, YFT_RESOURCE_VERSION} from '../src/vehicle-engine/resource.js';
import {ResourceView, coverage} from '../src/vehicle-engine/view.js';
import {readYft, geometryPositions, geometryIndices, MAX_BONES} from '../src/vehicle-engine/yft-read.js';
import {writeYft, appendSystemPage, relocateBlock} from '../src/vehicle-engine/yft-write.js';
import {rsc7PageSizes} from '../src/rsc7.js';
import {shaderFileName, parameterName} from '../src/vehicle-engine/names.js';
import {joaat} from '../src/animation-engine/hash.js';
import {EngineError} from '../src/animation-engine/errors.js';

// Real vehicle used for the phase-0 proof. Client asset: never copied into the repo; tests skip without it.
const M3 = process.env.RPFORGE_TEST_YFT ?? 'D:/RedHorn/Loja/Carros/Clientes/Bibis/M3&M/REDHORNM3BIBIS/stream/REDHORNM3BIBIS.yft';
const hasM3 = existsSync(M3);
const code = c => err => err instanceof EngineError && err.code === c;

// Two system pages (32 KiB + 16 KiB, base 4 KiB), version-162 flags; graphics empty.
function syntheticRegions() {
  const systemFlags = ((YFT_RESOURCE_VERSION >>> 4) << 28 | 1 << 25 | 1 << 24 | 3) >>> 0;
  const graphicsFlags = ((YFT_RESOURCE_VERSION & 15) << 28) >>> 0;
  const size = rsc7PageSizes(systemFlags).reduce((a, b) => a + b, 0);
  const system = new Uint8Array(size); const dv = new DataView(system.buffer);
  // Minimal root with a page-info block at 0x40 (header 16 + 8 per page).
  dv.setUint32(8, 0x50000040, true); system[0x48] = rsc7PageSizes(systemFlags).length;
  return {system, graphics: new Uint8Array(0), systemFlags, graphicsFlags};
}

test('envelope: explicit page flags survive encode/decode with identical regions', () => {
  const r = syntheticRegions(); r.system.fill(7, 0x100, 0x180);
  const back = decodeYftResource(encodeYftResource(r));
  assert.equal(back.systemFlags, r.systemFlags);
  assert.deepEqual(Buffer.from(back.system), Buffer.from(r.system));
  assert.throws(() => encodeYftResource({...r, system: r.system.subarray(1)}), code('INVALID_INPUT'));
});

test('appendSystemPage keeps every existing offset and relocates the page info', () => {
  const r = syntheticRegions(); r.system[0x200] = 42;
  const before = rsc7PageSizes(r.systemFlags);
  const p = appendSystemPage(r.system, r.systemFlags, 64);
  const after = rsc7PageSizes(p.systemFlags);
  assert.equal(after.length, before.length + 1);
  assert.deepEqual(after.slice(0, before.length), before, 'existing pages keep their order and size');
  assert.equal(p.pageOffset, r.system.length);
  assert.equal(p.system[0x200], 42);
  const dv = new DataView(p.system.buffer);
  assert.equal(dv.getUint32(8, true), 0x50000000 + p.pageOffset, 'root points to the new page info');
  assert.equal(p.system[p.pageOffset + 8], before.length + 1);
  assert.ok(p.cursor >= p.pageOffset + 16 + 8 * after.length);
});

test('relocateBlock moves bytes into the new page, repoints and zeroes the old copy', () => {
  const r = syntheticRegions(), dv = new DataView(r.system.buffer);
  dv.setUint32(0x30, 0x50000300, true); r.system.fill(9, 0x300, 0x340);
  const m = relocateBlock(r, 0x30, 0x40), ndv = new DataView(m.system.buffer);
  assert.equal(ndv.getUint32(0x30, true), 0x50000000 + m.movedTo);
  assert.ok(m.system.subarray(m.movedTo, m.movedTo + 0x40).every(x => x === 9));
  assert.ok(m.system.subarray(0x300, 0x340).every(x => x === 0));
});

test('view refuses pointers outside the regions and unterminated strings', () => {
  const r = syntheticRegions(), dv = new DataView(r.system.buffer), v = new ResourceView(r);
  dv.setUint32(0x10, 0x50000000 + r.system.length + 16, true);
  assert.throws(() => v.ptr(0x10), code('POINTER_OUT_OF_RANGE'));
  dv.setUint32(0x18, 0x12345678, true);
  assert.throws(() => v.pointer(0x18), code('POINTER_OUT_OF_RANGE'));
  dv.setUint32(0x20, 0x50000000 + r.system.length - 4, true); r.system.fill(65, r.system.length - 4);
  assert.throws(() => v.stringAt(0x20, 8), code('INCONSISTENT_REFERENCE'));
});

test('names resolve known vehicle shader files and parameters, unknown hashes stay hex', () => {
  assert.equal(shaderFileName(joaat('vehicle_paint1.sps')), 'vehicle_paint1.sps');
  assert.equal(parameterName(joaat('DiffuseSampler')), 'DiffuseSampler');
  assert.equal(parameterName(0x12345678), '0x12345678');
});

test('M3 (real YFT): reader matches the oracle-verified summary', {skip: !hasM3 && 'M3 not available'}, () => {
  const {model, view} = readYft(readFileSync(M3));
  assert.equal(model.name, 'pack:/REDHORNM3BIBIS');
  assert.equal(model.stats.bones, 119); assert.ok(model.stats.bones <= MAX_BONES);
  assert.deepEqual(model.stats.lods, {high: {models: 1, geometries: 101, triangles: 292515, vertices: 264298}});
  assert.equal(model.stats.shaders, 112);
  assert.equal(model.stats.physicsGroups, 22); assert.equal(model.stats.physicsChildren, 22);
  assert.deepEqual(model.stats.seatBones, ['seat_dside_f', 'seat_pside_f', 'seat_dside_r', 'seat_pside_r']);
  assert.equal(model.skeleton.bones[0].name, 'chassis'); assert.equal(model.skeleton.bones[0].parent, -1);
  const bound = model.physics[0].bound;
  assert.equal(bound.type, 'composite'); assert.equal(bound.children.length, 22);
  assert.deepEqual([bound.children[0].type, bound.children[0].vertices, bound.children[0].polygons, bound.children[0].materials], ['geometry', 943, 1665, 2]);
  assert.equal(bound.children.filter(c => c.type === 'disc').length, 4);
  assert.equal(model.physics[0].groups[0].name, 'chassis');
  assert.ok(model.stats.referencedTextures.includes('x3_spc_02'));
  const shader = model.drawable.shaderGroup.shaders.find(s => s.fileName === 'vehicle_paint1.sps');
  assert.ok(shader, 'vehicle_paint1 present');
  const g = model.drawable.lods.high[0].geometries[0], pos = geometryPositions(view, g), idx = geometryIndices(view, g);
  assert.equal(pos.length, g.vertexCount * 3); assert.equal(idx.length, g.indexCount);
  assert.ok(idx.every(i => i < g.vertexCount));
  const cov = coverage(view).system;
  assert.ok(cov.unexplainedNonZero / cov.nonZero < 0.001, 'reader explains more than 99.9% of non-zero bytes (collision included)');
});

test('M3 (real YFT): no-op in-place rewrite reproduces the decoded pages byte for byte', {skip: !hasM3 && 'M3 not available'}, () => {
  const read = readYft(readFileSync(M3));
  for (const m of read.model.drawable.lods.high) for (const g of m.geometries) g.positions = geometryPositions(read.view, g);
  const out = writeYft(read);
  assert.deepEqual(Buffer.from(out.system), Buffer.from(read.resource.system));
  const again = decodeYftResource(out.bytes);
  assert.deepEqual(Buffer.from(again.system), Buffer.from(read.resource.system));
});

test('M3 (real YFT): in-place edit changes only what was edited', {skip: !hasM3 && 'M3 not available'}, () => {
  const bytes = readFileSync(M3), read = readYft(bytes);
  const seat = read.model.skeleton.bones.find(b => b.name === 'seat_dside_f');
  seat.translation[2] = Math.fround(seat.translation[2] + 0.05);
  const out = writeYft(read), back = readYft(out.bytes).model, orig = readYft(bytes).model;
  orig.skeleton.bones.forEach((b, i) => {
    const e = back.skeleton.bones[i];
    if (i === seat.index) assert.equal(e.translation[2], seat.translation[2]);
    else assert.deepEqual(e.translation, b.translation);
  });
  let changed = 0; for (let i = 0; i < out.system.length; i++) if (out.system[i] !== read.resource.system[i]) changed++;
  assert.ok(changed > 0 && changed <= 4, 'one float changed');
  assert.throws(() => { read.model.skeleton.bones[1].name = 'x'.repeat(200); writeYft(read); }, code('UNSUPPORTED_STRUCTURE'));
});

test('M3 (real YFT): bone array relocated to an appended page reads back identical', {skip: !hasM3 && 'M3 not available'}, () => {
  const read = readYft(readFileSync(M3)), sk = read.model.skeleton;
  const moved = relocateBlock(read.resource, sk.at + 0x20, sk.count * 0x50);
  const back = readYft(encodeYftResource(moved)).model;
  assert.equal(back.skeleton.bones.length, sk.count);
  back.skeleton.bones.forEach((b, i) => {
    const o = sk.bones[i];
    assert.equal(b.name, o.name); assert.equal(b.tag, o.tag); assert.equal(b.parent, o.parent);
    assert.deepEqual(b.translation, o.translation); assert.deepEqual(b.rotation, o.rotation);
    assert.ok(b.at >= read.resource.system.length, 'bones now live in the new page');
  });
});

test('M3 (real YFT): full repack into a new page layout reads back as the same vehicle', {skip: !hasM3 && 'M3 not available'}, async () => {
  const {repackYftBytes} = await import('../src/vehicle-engine/yft-repack.js');
  const read = readYft(readFileSync(M3)), r = repackYftBytes(read);
  const strip = (k, v) => (/^(at|off|.*At|data|secondVertexData|systemFlags|graphicsFlags)$/.test(k) ? undefined : v);
  const back = readYft(r.bytes);
  assert.equal(JSON.stringify(back.model, strip), JSON.stringify(read.model, strip));
  assert.notEqual(r.systemFlags, read.resource.systemFlags, 'a genuinely new page layout');
  assert.ok(r.droppedDeadBytes > 0, 'the unreferenced exporter watermark is dropped');
  // Every page boundary is respected: no decoded block of the new file crosses one.
  const sizes = rsc7PageSizes(r.systemFlags), starts = []; let at = 0; for (const s of sizes) { starts.push([at, at + s]); at += s; }
  for (const b of back.view.blocks.filter(x => x.region === 'system')) {
    const page = starts.find(([s, e]) => b.off >= s && b.off < e);
    assert.ok(b.off + b.length <= page[1], `${b.kind} crosses a page boundary`);
  }
});

test('repack refuses files with pointers the reader does not follow', () => {
  const read = {view: new ResourceView(syntheticRegions()), resource: syntheticRegions()};
  const dv = new DataView(read.view.system.buffer);
  read.view.mark('system', 0, 0x40, 'FragType');
  dv.setUint32(0x20, 0x50000100, true); // pointer-looking value in a known block, never followed
  return import('../src/vehicle-engine/yft-repack.js').then(({repackYft}) => assert.throws(() => repackYft(read), code('UNSUPPORTED_STRUCTURE')));
});

test('embedded texture data size follows block compression and mip levels', async () => {
  const {textureDataSize} = await import('../src/vehicle-engine/yft-read.js');
  const cc = s => s.charCodeAt(0) | s.charCodeAt(1) << 8 | s.charCodeAt(2) << 16 | s.charCodeAt(3) << 24;
  assert.equal(textureDataSize(cc('DXT5'), 4096, 4096, 1), 16 * 1024 * 1024);
  assert.equal(textureDataSize(cc('DXT1'), 256, 256, 3), (64 * 64 + 32 * 32 + 16 * 16) * 8);
  assert.equal(textureDataSize(28, 2, 2, 2), 4 + 1); // A8: 2x2 then 1x1
  assert.throws(() => textureDataSize(0x12345678, 4, 4, 1), code('UNSUPPORTED_STRUCTURE'));
});

test('M3 (real YFT): hiding a geometry and renaming a texture reference are written in place', {skip: !hasM3 && 'M3 not available'}, () => {
  const read = readYft(readFileSync(M3));
  const g = read.model.drawable.lods.high[0].geometries[7];
  g.indices = new Uint16Array(g.indexCount); // all triangles degenerate: the part disappears
  const s = read.model.drawable.shaderGroup.shaders[0], tex = s.parameters.find(p => p.kind === 'texture' && p.texture);
  tex.texture = tex.texture.slice(0, 3);
  const back = readYft(writeYft(read).bytes);
  const g2 = back.model.drawable.lods.high[0].geometries[7];
  assert.ok(geometryIndices(back.view, g2).every(i => i === 0));
  assert.equal(back.model.drawable.shaderGroup.shaders[0].parameters.find(p => p.hash === tex.hash).texture, tex.texture);
});

test('M3 (real YTD): texture dictionary lists its textures', {skip: !hasM3 && 'M3 not available'}, async () => {
  const {readYtd} = await import('../src/vehicle-engine/ytd-read.js');
  const {textures} = readYtd(readFileSync(M3.replace(/\.yft$/, '.ytd')));
  assert.equal(textures.length, 98);
  assert.deepEqual([textures[0].name, textures[0].width, textures[0].format], ['light4', 512, 'DXT5']);
});

test('M3 (real YFT): recomputed bone matrices match the stored ones, and a moved bone updates them', {skip: !hasM3 && 'M3 not available'}, async () => {
  const {boneMatrix, invert} = await import('../src/vehicle-engine/yft-write.js');
  const read = readYft(readFileSync(M3)), sk = read.model.skeleton, dv = read.view.sdv;
  const at = (base, i, k) => dv.getFloat32(base + i * 64 + k * 4, true);
  for (const name of ['seat_dside_f', 'door_dside_f', 'bonnet']) {
    const b = sk.bones.find(x => x.name === name), m = boneMatrix(b), inv = invert(m);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(at(sk.transformsAt, b.index, i * 4 + j) - m.r[i][j]) < 1e-4);
    for (let j = 0; j < 3; j++) assert.ok(Math.abs(at(sk.inverseBindAt, b.index, 12 + j) - inv.t[j]) < 1e-4, `${name} inverse t${j}`);
  }
  const seat = sk.bones.find(x => x.name === 'seat_dside_f');
  seat.translation[2] += 0.25; seat.dirty = true;
  const back = readYft(writeYft(read).bytes), s2 = back.model.skeleton, d2 = back.view.sdv;
  assert.ok(Math.abs(d2.getFloat32(s2.transformsAt + seat.index * 64 + 14 * 4, true) - seat.translation[2]) < 1e-6);
  assert.ok(Math.abs(d2.getFloat32(s2.inverseBindAt + seat.index * 64 + 14 * 4, true) - invert(boneMatrix(seat)).t[2]) < 1e-6);
});

test('M3 (real YFT): a new part (cube on the bonnet bone) is attached, repacked and reads back', {skip: !hasM3 && 'M3 not available'}, async () => {
  const {addGeometries} = await import('../src/vehicle-engine/yft-grow.js');
  const read = readYft(readFileSync(M3));
  const s = 0.2, c = [0, 1.4, 0.9];
  const positions = new Float32Array([[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].flatMap(v => v.map((x, k) => c[k] + x * s)));
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7];
  const {regions} = addGeometries(read, [{positions, indices, bone: 'bonnet', shaderIndex: 0}]);
  const back = readYft(encodeYftResource(regions)).model;
  const before = read.model.drawable.lods.high[0], after = back.drawable.lods.high[0];
  assert.equal(after.geometries.length, before.geometries.length + 1);
  const g = after.geometries.at(-1);
  assert.equal(g.vertexCount, 8); assert.equal(g.indexCount, 36); assert.equal(g.shaderIndex, 0);
  assert.equal(back.stats.lods.high.triangles, read.model.stats.lods.high.triangles + 12);
  assert.equal(back.stats.bones, read.model.stats.bones);
});

test('M3 (real YFT): a new rim is attached to the wheel child drawable (not skinned)', {skip: !hasM3 && 'M3 not available'}, async () => {
  const {addGeometries} = await import('../src/vehicle-engine/yft-grow.js');
  const read = readYft(readFileSync(M3));
  const ci = read.model.physics[0].children.findIndex(c => c.drawable?.lods.high?.length);
  const before = read.model.physics[0].children[ci].drawable.lods.high[0].geometries.length;
  const positions = new Float32Array([0, -0.3, -0.3, 0, 0.3, -0.3, 0, 0.3, 0.3, 0, -0.3, 0.3]);
  const {regions} = addGeometries(read, [{positions, indices: [0, 1, 2, 0, 2, 3], bone: 'wheel_lf', shaderIndex: 52, child: ci}]);
  const back = readYft(encodeYftResource(regions)).model;
  const m = back.physics[0].children[ci].drawable.lods.high[0];
  assert.equal(m.geometries.length, before + 1);
  assert.deepEqual([m.geometries.at(-1).vertexCount, m.geometries.at(-1).indexCount, m.geometries.at(-1).shaderIndex], [4, 6, 52]);
  assert.equal(back.drawable.lods.high[0].geometries.length, read.model.drawable.lods.high[0].geometries.length);
});
