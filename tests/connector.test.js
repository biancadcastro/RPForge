import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, mkdir, readdir, readFile, rm, symlink, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { inventory, uploadFile, saveArtifact, connectorApi, TransferJournal } from '../src/connector/transfer.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
async function tmp(t) { const d = await mkdtemp(path.join(os.tmpdir(), 'forge-connector-')); t.after(() => rm(d, { recursive: true, force: true })); return d; }

// Minimal stand-in for the workspace API routes the connector uses.
async function fakeApi(t, { failFirstPut = false, artifacts = {} } = {}) {
  const log = [], uploads = new Map(); let puts = 0;
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks), send = (status, json) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
    log.push(`${req.method} ${req.url} ${req.headers.authorization}`);
    if (req.headers.authorization !== 'Bearer ' + 'a'.repeat(64)) return send(401, { code: 'AUTHENTICATION_REQUIRED' });
    let m;
    if (req.method === 'POST' && (m = /^\/v1\/projects\/(\w+)\/uploads$/.exec(req.url))) { const id = `u${uploads.size + 1}`; uploads.set(id, JSON.parse(body)); return send(201, { id }); }
    if (req.method === 'PUT' && (m = /^\/v1\/uploads\/(\w+)\/content$/.exec(req.url))) {
      puts++; if (failFirstPut && puts === 1) return send(503, { code: 'STORAGE_UNAVAILABLE' });
      if (body.length !== uploads.get(m[1]).bytes) return send(413, { code: 'UPLOAD_SIZE_MISMATCH' });
      return send(200, { id: m[1], receivedBytes: body.length, sha256: sha(body) });
    }
    if (req.method === 'POST' && (m = /^\/v1\/uploads\/(\w+)\/complete$/.exec(req.url))) return send(201, { id: `asset-${m[1]}` });
    if (req.method === 'GET' && (m = /^\/v1\/artifacts\/(\w+)\/download$/.exec(req.url))) { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(artifacts[m[1]]); }
    send(404, { code: 'NOT_FOUND' });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const api = connectorApi({ baseUrl: `http://127.0.0.1:${server.address().port}`, authorization: async () => 'a'.repeat(64) });
  return { api, log, uploads };
}

test('connector module carries no engine: only node: built-ins are imported', async () => {
  const source = await readFile(new URL('../src/connector/transfer.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2]);
  assert.ok(imports.length > 0 && imports.every((target) => target.startsWith('node:')), imports.join(', '));
});

test('inventory takes only explicit files; folders need an explicit recursive policy; junctions are refused', async (t) => {
  const root = await tmp(t), dir = path.join(root, 'pasta');
  await mkdir(path.join(dir, 'sub'), { recursive: true });
  await writeFile(path.join(dir, 'a.meta'), 'a'); await writeFile(path.join(dir, 'sub', 'b.meta'), 'bb');
  assert.deepEqual((await inventory([path.join(dir, 'a.meta')])).map((f) => f.name), ['a.meta']);
  await assert.rejects(inventory([dir]), { code: 'FOLDER_REQUIRES_RECURSIVE_POLICY' });
  assert.deepEqual((await inventory([dir], { recursive: true })).map((f) => [f.name, f.bytes]), [['a.meta', 1], ['b.meta', 2]]);
  const outside = path.join(root, 'outside'); await mkdir(outside); await writeFile(path.join(outside, 'secret.txt'), 'x');
  await symlink(outside, path.join(dir, 'atalho'), 'junction');
  await assert.rejects(inventory([dir], { recursive: true }), { code: 'LINK_NOT_ALLOWED' });
});

test('upload resumes the same server upload after a failed send and refuses a modified source', async (t) => {
  const root = await tmp(t), file = path.join(root, 'vehicles.meta'), journal = new TransferJournal(path.join(root, 'state', 'transfers.json'));
  await writeFile(file, '<CVehicleModelInfo__InitDataList/>');
  const { api, log, uploads } = await fakeApi(t, { failFirstPut: true });
  await assert.rejects(uploadFile({ api, journal, projectId: 'p1', file }), { code: 'STORAGE_UNAVAILABLE' });
  const asset = await uploadFile({ api, journal, projectId: 'p1', file });
  assert.equal(asset.id, 'asset-u1');
  assert.equal(uploads.size, 1); // resumed: no second upload session for the same unchanged file
  assert.equal(log.filter((l) => l.startsWith('PUT')).length, 2);
  // Same file again after completion -> new version; modified file -> new version too.
  await writeFile(file, '<CVehicleModelInfo__InitDataList><InitDatas/></CVehicleModelInfo__InitDataList>');
  await utimes(file, new Date(), new Date(Date.now() + 5000));
  assert.equal((await uploadFile({ api, journal, projectId: 'p1', file })).id, 'asset-u2');
  assert.ok(log.every((l) => l.endsWith('Bearer ' + 'a'.repeat(64))));
});

test('saving a result verifies SHA-256, never overwrites, and refuses links and unsafe names', async (t) => {
  const root = await tmp(t), dest = path.join(root, 'destino'); await mkdir(dest);
  const content = Buffer.from("fx_version 'cerulean'\n");
  const { api } = await fakeApi(t, { artifacts: { x1: content, bad: Buffer.from('tampered') } });
  const artifact = { id: 'x1', name: 'fxmanifest.lua', sha256: sha(content) };
  assert.equal(path.basename(await saveArtifact({ api, artifact, destination: dest })), 'fxmanifest.lua');
  assert.equal(path.basename(await saveArtifact({ api, artifact, destination: dest })), 'fxmanifest (1).lua');
  assert.deepEqual(await readFile(path.join(dest, 'fxmanifest.lua')), content);
  await assert.rejects(saveArtifact({ api, artifact: { id: 'bad', name: 'x.meta', sha256: sha(content) }, destination: dest }), { code: 'HASH_MISMATCH' });
  assert.deepEqual((await readdir(dest)).sort(), ['fxmanifest (1).lua', 'fxmanifest.lua']); // no staging leftovers
  await assert.rejects(saveArtifact({ api, artifact: { ...artifact, name: '../escape.lua' }, destination: dest }));
  await assert.rejects(saveArtifact({ api, artifact: { ...artifact, name: 'data/../../x.lua' }, destination: dest }));
  const junction = path.join(root, 'junction'); await symlink(dest, junction, 'junction');
  await assert.rejects(saveArtifact({ api, artifact, destination: junction }), { code: 'LINK_NOT_ALLOWED' });
  // data/vehicles.meta is saved by its file name only.
  assert.equal(path.basename(await saveArtifact({ api, artifact: { ...artifact, name: 'data/vehicles.meta' }, destination: dest })), 'vehicles.meta');
});

test('a folder reached through its 8.3 short name is not mistaken for a link', { skip: process.platform !== 'win32' }, async (t) => {
  const { execFileSync } = await import('node:child_process');
  const long = path.join(await tmp(t), 'pasta com nome bem longo');
  await mkdir(long);
  await writeFile(path.join(long, 'a.meta'), 'x');
  const short = execFileSync('cmd.exe', ['/d', '/c', `for %I in ("${long}") do @echo %~sI`], { encoding: 'utf8', windowsVerbatimArguments: true }).trim();
  if (short.toLowerCase() === long.toLowerCase()) return t.skip('8.3 names are disabled on this volume');
  assert.deepEqual((await inventory([path.join(short, 'a.meta')])).map((f) => f.name), ['a.meta']);
  assert.deepEqual((await inventory([short], { recursive: true })).map((f) => f.name), ['a.meta']);
});
