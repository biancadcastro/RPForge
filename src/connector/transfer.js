// Windows connector transfer layer. Infrastructure only: no GTA parsing, codecs or conversion here.
// Network calls go through an injected `api` so the Electron shell keeps tokens in the OS vault.
import { createReadStream } from 'node:fs';
import { lstat, realpath, readdir, open, link, unlink, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';

// Local copy on purpose: the connector must not import engine modules (rpf.js and friends stay out of its payload).
function safeName(name) {
  if (!name || name === '.' || name === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) {
    throw new TransferError('UNSAFE_NAME', JSON.stringify(name));
  }
  return name;
}

export const CONNECTOR_LIMITS = Object.freeze({ maxFiles: 200, maxFileBytes: 256 * 1024 * 1024, maxDepth: 8 });
export class TransferError extends Error { constructor(code, detail) { super(detail ? `${code}: ${detail}` : code); this.code = code; } }

/** Rejects symlinks and junctions (lstat reports both as links on Windows) and paths whose real location differs. */
async function plainEntry(target) {
  const info = await lstat(target);
  if (info.isSymbolicLink()) throw new TransferError('LINK_NOT_ALLOWED', path.basename(target));
  // The entry must really live in its parent folder. Compare canonical forms on both sides, never the
  // literal path: the same folder can be spelled with 8.3 short names (C:\Users\RUNNER~1\..., PASTAC~1)
  // and would otherwise be mistaken for a link.
  const resolved = path.resolve(target);
  const [real, parent] = await Promise.all([realpath(resolved), realpath(path.dirname(resolved))]);
  if (path.dirname(path.resolve(real)).toLowerCase() !== path.resolve(parent).toLowerCase()) throw new TransferError('LINK_NOT_ALLOWED', path.basename(target));
  return info;
}

/**
 * Explicit selection only. A folder is expanded only when `recursive` is set (policy chosen by the user,
 * shown as a preview before sending); links/junctions anywhere abort the inventory instead of being followed.
 */
export async function inventory(selection, { recursive = false, limits = CONNECTOR_LIMITS } = {}) {
  const files = [];
  async function visit(target, depth) {
    const info = await plainEntry(target);
    if (info.isFile()) {
      if (info.size > limits.maxFileBytes) throw new TransferError('FILE_TOO_LARGE', path.basename(target));
      files.push({ path: path.resolve(target), name: path.basename(target), bytes: info.size, mtimeMs: info.mtimeMs });
    } else if (info.isDirectory()) {
      if (!recursive) throw new TransferError('FOLDER_REQUIRES_RECURSIVE_POLICY', path.basename(target));
      if (depth >= limits.maxDepth) throw new TransferError('FOLDER_TOO_DEEP', path.basename(target));
      for (const entry of (await readdir(target)).sort()) await visit(path.join(target, entry), depth + 1);
    } else throw new TransferError('UNSUPPORTED_ENTRY', path.basename(target));
    if (files.length > limits.maxFiles) throw new TransferError('TOO_MANY_FILES');
  }
  for (const item of selection) await visit(item, 0);
  return files;
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const identity = async (file) => { const info = await lstat(file); return { bytes: info.size, mtimeMs: info.mtimeMs, sha256: await sha256File(file) }; };
const same = (a, b) => a.bytes === b.bytes && a.mtimeMs === b.mtimeMs && a.sha256 === b.sha256;

/** Small JSON journal (one record per local file) so a transfer can resume after restart or loss of connection. */
export class TransferJournal {
  constructor(file) { this.file = file; }
  async read() { try { return JSON.parse(await readFile(this.file, 'utf8')); } catch { return {}; } }
  async write(state) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state)); await rename(temporary, this.file);
  }
}

/**
 * Uploads one file as a new immutable version. Resumes the same server upload when the local file is
 * unchanged; a file modified during or after sending becomes a new version (the old upload expires).
 */
export async function uploadFile({ api, journal, projectId, file }) {
  const state = await journal.read(), key = `${projectId}|${file.toLowerCase()}`;
  const before = await identity(file);
  let record = state[key];
  if (!record || !same(record.identity, before) || record.done) {
    const created = await api.json('POST', `/v1/projects/${projectId}/uploads`, { filename: path.basename(file), bytes: before.bytes });
    record = { uploadId: created.id, identity: before, done: false }; state[key] = record; await journal.write(state);
  }
  const sent = await api.put(`/v1/uploads/${record.uploadId}/content`, Readable.toWeb(createReadStream(file)), before.bytes);
  const after = await identity(file);
  if (!same(before, after)) { delete state[key]; await journal.write(state); throw new TransferError('SOURCE_CHANGED_DURING_UPLOAD', path.basename(file)); }
  if (sent.sha256 !== before.sha256) throw new TransferError('HASH_MISMATCH', path.basename(file));
  const asset = await api.json('POST', `/v1/uploads/${record.uploadId}/complete`);
  record.done = true; record.assetId = asset.id; await journal.write(state);
  return asset;
}

/**
 * Saves a downloaded artifact into a folder the user chose. Never follows links, never overwrites:
 * staging file in the same folder, SHA-256 checked against the manifest, folder identity re-validated
 * just before publishing, collision resolved with a numbered name.
 */
export async function saveArtifact({ api, artifact, destination }) {
  // Manifest names are untrusted text: refuse traversal/absolute/drive forms outright instead of normalizing them.
  const name = String(artifact.name), parts = name.split('/');
  if (name.includes('\\') || name.startsWith('/') || parts.some((p) => !p || p === '.' || p === '..' || p.includes(':'))) throw new TransferError('UNSAFE_NAME', name);
  const base = parts.at(-1);
  safeName(base);
  const folder = path.resolve(destination), folderInfo = await plainEntry(folder);
  if (!folderInfo.isDirectory()) throw new TransferError('DESTINATION_NOT_FOLDER');
  const staging = path.join(folder, `.rpforge-${randomUUID()}.part`);
  const handle = await open(staging, 'wx');
  const hash = createHash('sha256');
  try {
    const body = await api.download(`/v1/artifacts/${artifact.id}/download`);
    for await (const chunk of body) { hash.update(chunk); await handle.write(chunk); }
    await handle.sync();
  } finally { await handle.close(); }
  try {
    if (hash.digest('hex') !== artifact.sha256) throw new TransferError('HASH_MISMATCH', base);
    const now = await plainEntry(folder);
    if (now.ino !== folderInfo.ino || now.dev !== folderInfo.dev) throw new TransferError('DESTINATION_CHANGED');
    const ext = path.extname(base), stem = base.slice(0, base.length - ext.length);
    for (let n = 0; n < 1000; n++) {
      const target = path.join(folder, n ? `${stem} (${n})${ext}` : base);
      try { await link(staging, target); return target; } // fails if the name exists: no silent overwrite
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    throw new TransferError('TOO_MANY_COLLISIONS', base);
  } finally { await unlink(staging).catch(() => undefined); }
}

/** fetch-based API adapter. `authorization()` returns the current Bearer token kept by the shell in the OS vault. */
export function connectorApi({ baseUrl, authorization, fetchImpl = fetch }) {
  async function send(method, route, init = {}) {
    const response = await fetchImpl(new URL(route, baseUrl), { method, ...init, headers: { Authorization: `Bearer ${await authorization()}`, ...(init.headers ?? {}) } });
    if (!response.ok) {
      let code = `HTTP_${response.status}`; try { code = (await response.json()).code ?? code; } catch { /* keep status */ }
      throw new TransferError(code);
    }
    return response;
  }
  return {
    json: async (method, route, body) => (await send(method, route, body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })).json(),
    put: async (route, stream, bytes) => (await send('PUT', route, { body: stream, duplex: 'half', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes) } })).json(),
    download: async (route) => Readable.fromWeb((await send('GET', route)).body),
  };
}
