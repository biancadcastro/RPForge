// Read-only survey of local YCD files with the engine reader (inspect mode).
// Usage: node scripts/animation-engine/survey.mjs <list.txt> <out.json>
// The list holds one absolute path per line. Files are only read; nothing is copied.
// The output contains per-file hashes/verdicts and aggregate statistics; it belongs
// outside the repository when the inputs are third-party assets.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readYcd} from '../../src/animation-engine/ycd-read.js';

const [listPath, outPath] = process.argv.slice(2);
if (!listPath || !outPath) { console.error('usage: survey.mjs <list.txt> <out.json>'); process.exit(2); }
const paths = readFileSync(listPath, 'utf8').split(/\r?\n/).filter(Boolean);
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const agg = {files: 0, accepted: 0, failed: {}, notes: {}, channelTypes: {}, trackIds: {}, encodings: {}, flags: {}, flagsWithMover: {}, flagsWithoutMover: {},
  usageCount: {}, blockCounts: {}, chunkSize: {}, boneIdOrder: {}, clipNamePrefix: {}, clipNameExt: {}, clipsPerFile: {}, rootRefs: {}, moverBoneTag: {}, limitRule: {}, quatIndex: {}, unknown1C: {}, timing: {}, dataTypeByTrack: {}, tracksPerAnim: [], framesPerAnim: []};
const rows = [];
for (const p of paths) {
  agg.files++;
  let bytes;
  try { bytes = readFileSync(p); } catch { inc(agg.failed, 'UNREADABLE'); continue; }
  const row = {path: p, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
  try {
    const m = readYcd(bytes);
    agg.accepted++; row.verdict = 'read';
    row.clips = m.clips.length; row.animations = m.animations.length; row.notes = m.notes.map(n => n.path);
    inc(agg.clipsPerFile, m.clips.length);
    for (const n of m.notes) inc(agg.notes, n.path.replace(/\[\d+\]/g, '[]').replace(/\+0x[0-9a-f]+$/, '+off'));
    for (const c of m.clips) {
      const pre = c.name.match(/^([a-z]+:\/)/i)?.[1] ?? '(none)'; inc(agg.clipNamePrefix, pre);
      inc(agg.clipNameExt, (c.name.match(/\.[a-z]+$/i)?.[0]) ?? '(none)');
    }
    for (const a of m.animations) {
      agg.tracksPerAnim.push(a.tracks.length); agg.framesPerAnim.push(a.frames);
      if (a.duration > 0) { const fpsA = (a.frames - 1) / a.duration, fpsB = a.frames / a.duration; inc(agg.timing, Math.abs(fpsA - Math.round(fpsA)) < 1e-3 ? 'frames-1:' + Math.round(fpsA) : Math.abs(fpsB - Math.round(fpsB)) < 1e-3 ? 'frames:' + Math.round(fpsB) : 'other'); }
      for (const t of a.tracks) inc(agg.dataTypeByTrack, t.track + ':' + t.dataType + ':' + t.kind);
      inc(agg.flags, a.flags); inc(a.hasMoverTracks ? agg.flagsWithMover : agg.flagsWithoutMover, a.flags);
      inc(agg.usageCount, a.usageCount); inc(agg.blockCounts, a.blockCount); inc(agg.unknown1C, a.unknown1C === 0 ? 0 : 'nonzero');
      for (const b of a.blocks) { inc(agg.chunkSize, b.chunkSize); for (const [t, n] of Object.entries(b.channelTypes)) inc(agg.channelTypes, t, n); }
      // SequenceFrameLimit relation to frames (single block files only)
      if (a.blockCount === 1) inc(agg.limitRule, a.sequenceFrameLimit === Math.ceil((a.frames + 1) / 16) * 16 - 1 ? 'ceil16(frames+1)-1' : a.sequenceFrameLimit >= a.frames ? 'other>=frames' : 'other<frames');
      else inc(agg.limitRule, `multi:${a.blocks.map(b => b.numFrames).join('/')}@${a.sequenceFrameLimit}/${a.frames}`.slice(0, 40));
      const keys = a.tracks.map(t => [t.boneTag, t.track]);
      const sortedBy = (cmp) => keys.every((k, i) => i === 0 || cmp(keys[i - 1], k) <= 0);
      inc(agg.boneIdOrder, sortedBy((x, y) => x[1] - y[1] || x[0] - y[0]) ? 'track,bone' : sortedBy((x, y) => x[0] - y[0] || x[1] - y[1]) ? 'bone,track' : 'unsorted');
      for (const t of a.tracks) {
        inc(agg.trackIds, t.track);
        const enc = t.encoding[0].map(e => e.type + (e.quatIndex !== undefined ? `#q${e.quatIndex}` : '')).join('+');
        inc(agg.encodings, `${t.track}:${t.kind}:${enc}`);
        for (const e of t.encoding[0]) if (e.quatIndex !== undefined) inc(agg.quatIndex, e.quatIndex);
        if (t.track === 5 || t.track === 6) inc(agg.moverBoneTag, t.boneTag);
      }
      const rp = a.rootMotion.position.map(x => x.length).join('/'), rr = a.rootMotion.rotation.map(x => x.length).join('/');
      inc(agg.rootRefs, `${a.hasMoverTracks ? 'mover' : 'nomover'} pos=${rp} rot=${rr}`.slice(0, 50));
    }
  } catch (e) {
    row.verdict = 'refused'; row.error = {code: e.code ?? 'INTERNAL', message: e.message};
    inc(agg.failed, `${e.code ?? 'INTERNAL'}: ${e.message}`);
    if (!e.code) console.error(p, e);
  }
  rows.push(row);
}
const stats = arr => { const s = [...arr].sort((a, b) => a - b); return s.length ? {n: s.length, min: s[0], p50: s[s.length >> 1], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1]} : null; };
agg.tracksPerAnim = stats(agg.tracksPerAnim); agg.framesPerAnim = stats(agg.framesPerAnim);
writeFileSync(outPath, JSON.stringify({generatedAt: new Date().toISOString(), aggregate: agg, files: rows}, null, 1));
console.log(JSON.stringify(agg, null, 1));
