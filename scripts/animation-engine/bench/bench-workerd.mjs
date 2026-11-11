// Run the benchmark core inside a local workerd process, fully offline: no account,
// no wrangler config, no bindings, no outbound network (no "internet" service exists).
// Usage:
//   node scripts/animation-engine/bench/bench-workerd.mjs <toolsNodeModules> <outDir> [external.ycd]
//   toolsNodeModules: a node_modules folder that already contains esbuild and
//   @cloudflare/workerd-windows-64 (only executed/imported, never modified).
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const [modules, outDir, external] = process.argv.slice(2);
if (!modules || !outDir) { console.error('usage: bench-workerd.mjs <toolsNodeModules> <outDir> [external.ycd]'); process.exit(2); }
mkdirSync(outDir, {recursive: true});
const pkg = name => JSON.parse(readFileSync(join(modules, name, 'package.json'), 'utf8'));
const esbuild = await import(pathToFileURL(join(modules, 'esbuild', pkg('esbuild').main)).href);
const here = fileURLToPath(new URL('.', import.meta.url));
const entry = join(outDir, 'entry.mjs');
writeFileSync(entry, `import {prepare, measure} from ${JSON.stringify(resolve(here, 'bench-core.mjs').replace(/\\/g, '/'))};
export default {
  async fetch(request) {
    const url = new URL(request.url), extra = [];
    if (url.pathname === '/ping') return new Response('ok');
    if (request.method === 'POST') extra.push({id: url.searchParams.get('id'), bytes: new Uint8Array(await request.arrayBuffer())});
    let net = 'blocked';
    try { const r = await fetch('http://example.com/'); net = r.status === 503 && (await r.text()) === 'offline' ? 'stubbed (no network service)' : 'reachable'; } catch { net = 'blocked'; }
    const cases = prepare(extra);
    const results = measure(cases, {now: () => performance.now(), warmup: 3, repeats: Number(url.searchParams.get('repeats') ?? 15), minBatchMs: 50});
    return Response.json({network: net, results});
  },
};
`);
const bundlePath = join(outDir, 'worker-bundle.mjs');
await esbuild.build({entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', outfile: bundlePath, external: ['node:*'], logLevel: 'warning'});
const bundle = readFileSync(bundlePath);
const port = 18795;
writeFileSync(join(outDir, 'offline.mjs'), 'export default { fetch() { return new Response("offline", {status: 503}); } };\n');
// Outbound fetches from the engine isolate go to a local stub that answers 503: there is
// no service with network access in this config.
writeFileSync(join(outDir, 'config.capnp'), [
  'using Workerd = import "/workerd/workerd.capnp";',
  'const config :Workerd.Config = (',
  '  services = [ (name = "main", worker = .engine), (name = "offline", worker = .offline) ],',
  `  sockets = [ (name = "http", address = "127.0.0.1:${port}", http = (), service = "main") ]`,
  ');',
  'const engine :Workerd.Worker = (',
  '  modules = [ (name = "worker", esModule = embed "worker-bundle.mjs") ],',
  '  compatibilityDate = "2026-11-01",',
  '  compatibilityFlags = ["nodejs_compat"],',
  '  globalOutbound = "offline"',
  ');',
  'const offline :Workerd.Worker = (',
  '  modules = [ (name = "offline", esModule = embed "offline.mjs") ],',
  '  compatibilityDate = "2026-11-01"',
  ');', ''].join('\n'));
const exe = join(modules, '@cloudflare', 'workerd-windows-64', 'bin', 'workerd.exe');
const child = spawn(exe, ['serve', join(outDir, 'config.capnp'), '--verbose'], {cwd: outDir, stdio: ['ignore', 'pipe', 'pipe']});
let log = ''; child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
try {
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) { try { await fetch(`http://127.0.0.1:${port}/ping`, {method: 'HEAD'}); ready = true; } catch { await new Promise(r => setTimeout(r, 100)); } }
  if (!ready) throw new Error('workerd did not start: ' + log.slice(0, 500));
  const t0 = performance.now();
  let res;
  if (external) {
    const bytes = readFileSync(external), id = `external_${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}`;
    res = await fetch(`http://127.0.0.1:${port}/?id=${id}`, {method: 'POST', body: bytes});
  } else res = await fetch(`http://127.0.0.1:${port}/`);
  const body = await res.json();
  const requestWallMs = performance.now() - t0;
  const report = {
    generatedAt: new Date().toISOString(),
    environment: {runtime: 'workerd (local process, workerd serve)', workerd: pkg('workerd').version, compatibilityDate: '2026-11-01', flags: ['nodejs_compat'], bundleBytes: bundle.length, bundleSha256: createHash('sha256').update(bundle).digest('hex'), outboundNetworkFromIsolate: body.network},
    method: 'inside one isolate: 3 warmup calls, 15 batches of k calls (batch >= 50 ms) per case/op, performance.now(); values are ms per call (wall time inside the isolate). Not billed CPU; one local isolate; no concurrency.',
    results: body.results, requestWallMs,
  };
  writeFileSync(join(outDir, 'bench-workerd.json'), JSON.stringify(report, null, 1));
  for (const r of body.results) console.log(r.case, Object.entries(r.ops).map(([k, v]) => `${k}=${v.wallMs.p50.toFixed(3)}/${v.wallMs.p95.toFixed(3)}`).join(' '));
  console.log('network from isolate:', body.network, '| request wall ms', requestWallMs.toFixed(0), '| bundle bytes', bundle.length);
} finally { child.kill(); }
