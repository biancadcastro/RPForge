// Runtime-neutral benchmark core: imports only the engine and the synthetic generator,
// so the same code runs in Node and inside a local workerd isolate.
import {writeSkeletalYcd} from '../../../src/animation-engine/ycd-write.js';
import {readYcd} from '../../../src/animation-engine/ycd-read.js';
import {reencodeYcd} from '../../../src/animation-engine/convert.js';
import {sampleTrack} from '../../../src/animation-engine/sample.js';
import {decodeEnvelope} from '../../../src/animation-engine/envelope.js';
import {DEFAULT_LIMITS} from '../../../src/animation-engine/limits.js';
import {deflateRawSync} from 'node:zlib';
import {syntheticAnimation} from '../../../tests/animation-engine/synthetic.js';

export const CASES = [
  {id: 'small_s21_f31', params: {bones: 21, frames: 31}},
  {id: 'emote_s128_f300', params: {bones: 128, frames: 300, mover: true}},
  {id: 'long_s128_f1800', params: {bones: 128, frames: 1800}},
];

export function prepare(extra = []) {
  const cases = CASES.map(c => {
    const {animation} = syntheticAnimation({name: c.id, seed: 7, ...c.params});
    const quantized = writeSkeletalYcd(animation).bytes, raw = writeSkeletalYcd(animation, {encoding: {mode: 'raw'}}).bytes;
    return {id: c.id, animation, quantized, raw, frames: animation.frames, tracks: animation.tracks.length};
  });
  for (const e of extra) {
    const m = readYcd(e.bytes);
    cases.push({id: e.id, quantized: e.bytes, external: true, frames: m.animations[0].frames, tracks: m.animations[0].tracks.length});
  }
  return cases;
}

/** Operations measured per case. Each returns something so work is not optimized away. */
export function operations(c) {
  const ops = {
    'read.quantized': () => readYcd(c.quantized, {strict: !c.external}).animations.length,
    'inflate': () => decodeEnvelope(c.quantized, 46, DEFAULT_LIMITS).decodedBytes,
  };
  const model = readYcd(c.quantized).animations[0];
  ops['sample.all@30Hz'] = () => {
    let s = 0; const step = 1 / 30;
    for (let t = 0; t <= model.duration + 1e-9; t += step) for (const tr of model.tracks) s += sampleTrack(model, tr, t)[0];
    return s;
  };
  if (!c.external) {
    const region = decodeEnvelope(c.quantized, 46, DEFAULT_LIMITS).system;
    Object.assign(ops, {
      'write.quantized': () => writeSkeletalYcd(c.animation).bytes.length,
      'write.raw': () => writeSkeletalYcd(c.animation, {encoding: {mode: 'raw'}}).bytes.length,
      'read.raw': () => readYcd(c.raw, {strict: true}).animations.length,
      'deflate.level6': () => deflateRawSync(region, {level: 6}).length,
    });
  }
  ops['reencode.quantized'] = () => reencodeYcd(c.quantized, {discard: ['clipTags', 'clipProperties', 'animationMetadata', 'unsupportedTracks'], clip: c.external ? undefined : undefined}).bytes.length;
  return ops;
}

export function stats(samples) {
  const s = [...samples].sort((a, b) => a - b), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {n: s.length, min: s[0], p50: q(0.5), p90: q(0.9), p95: q(0.95), max: s[s.length - 1], mean, stdev: Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length)};
}

/**
 * Time each operation: `warmup` untimed runs, then `repeats` timed batches of `k`
 * calls (k chosen so a batch lasts >= minBatchMs, because some runtimes only expose
 * coarse timers). Reported values are milliseconds per call (batch time / k).
 */
export function measure(cases, {now, warmup = 5, repeats = 30, minBatchMs = 20, cpu} = {}) {
  const out = [];
  for (const c of cases) {
    const row = {case: c.id, frames: c.frames, tracks: c.tracks, quantizedBytes: c.quantized.length, rawBytes: c.raw?.length, external: !!c.external, ops: {}};
    for (const [name, fn] of Object.entries(operations(c))) {
      for (let i = 0; i < warmup; i++) fn();
      let k = 1;
      for (;;) { const t0 = now(); for (let i = 0; i < k; i++) fn(); if (now() - t0 >= minBatchMs || k >= 4096) break; k *= 2; }
      const wall = [], cpuPer = [];
      for (let r = 0; r < repeats; r++) {
        const c0 = cpu?.(), t0 = now();
        for (let i = 0; i < k; i++) fn();
        const dt = now() - t0; wall.push(dt / k);
        if (cpu) cpuPer.push((cpu() - c0) / k);
      }
      row.ops[name] = {batch: k, wallMs: stats(wall), ...(cpu ? {cpuMs: stats(cpuPer)} : {})};
    }
    out.push(row);
  }
  return out;
}
