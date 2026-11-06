// Node benchmark of the animation engine.
// Usage: node --expose-gc scripts/animation-engine/bench/bench-node.mjs <out.json> [external.ycd ...]
// External files are only read; the report keeps their SHA-256, not their path.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {prepare, measure, operations} from './bench-core.mjs';

const [outPath, ...externals] = process.argv.slice(2);
if (!outPath) { console.error('usage: bench-node.mjs <out.json> [external.ycd ...]'); process.exit(2); }
const extra = externals.map((p, i) => { const bytes = readFileSync(p); return {id: `external_${i}_${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}`, bytes: new Uint8Array(bytes)}; });
const cases = prepare(extra);
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const results = measure(cases, {now: () => performance.now(), cpu, warmup: 5, repeats: 30});

// Memory: retained heap growth for one operation on a fresh heap (after GC), and the
// process max RSS. Approximations: V8 heap only, includes allocator slack.
const memory = [];
if (globalThis.gc) {
  for (const c of cases) for (const [name, fn] of Object.entries(operations(c))) {
    gc(); gc(); const before = process.memoryUsage();
    const keep = fn(); const after = process.memoryUsage();
    memory.push({case: c.id, op: name, heapDeltaMB: (after.heapUsed - before.heapUsed) / 2 ** 20, arrayBuffersDeltaMB: (after.arrayBuffers - before.arrayBuffers) / 2 ** 20, keep: typeof keep});
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  environment: {runtime: `node ${process.version}`, v8: process.versions.v8, zlib: process.versions.zlib, platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGB: +(os.totalmem() / 2 ** 30).toFixed(1)},
  method: 'per case/op: 5 warmup calls, 30 timed batches of k calls (batch >= 20 ms); values are ms per call (batch mean); cpuMs from process.cpuUsage (whole process, includes GC threads)',
  results, memory, maxRssMB: process.resourceUsage().maxRSS / 1024,
};
writeFileSync(outPath, JSON.stringify(report, null, 1));
for (const r of results) console.log(r.case, r.quantizedBytes, Object.entries(r.ops).map(([k, v]) => `${k}=${v.wallMs.p50.toFixed(3)}/${v.wallMs.p95.toFixed(3)}`).join(' '));
