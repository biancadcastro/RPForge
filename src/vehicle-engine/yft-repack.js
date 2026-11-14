// Full writer ("gravador B"), stage 1: repack every block of a decoded YFT into a fresh page
// layout and rewrite every pointer. This is the mechanism that lets later stages grow or add
// structures of any size (new geometries, bones, shaders) instead of being limited to the
// small pages that can be appended at the end of the original layout.
//
// Model of the resource used here:
// - A "span" is a maximal run of bytes covered by decoded blocks (blocks nest and overlap:
//   a models block holds models and geometries, a name lives inside a string table...).
// - Bytes between spans that are not all zero are kept with the span before them ("tail"),
//   so structures the reader only partly understands (EvtSet, dead data) travel intact.
// - Every pointer the reader followed is a known field; the writer refuses to run when the
//   pointer scan finds a pointer-looking value it did not follow (it could not relocate it).
// Spans keep their alignment modulo 16 and never cross a page boundary (game requirement).
import {rsc7PageSizes} from '../rsc7.js';
import {SYSTEM_BASE, GRAPHICS_BASE, encodeYftResource, YFT_RESOURCE_VERSION} from './resource.js';
import {unfollowedPointers} from './view.js';
import {ErrorCode, ensure, fail} from '../animation-engine/errors.js';

// Page-count fields of the RSC7 flags: [bit offset, bit width], largest class first.
const FIELDS = [[4, 1], [5, 2], [7, 4], [11, 6], [17, 7], [24, 1], [25, 1], [26, 1], [27, 1]];
const PAGES_INFO_RESERVE = 16 + 8 * 256; // page-info header + one entry per page, whatever the final count

function spansOf(view, region, deadPointers = [], targets = []) {
  const bytes = region === 'system' ? view.system : view.graphics;
  const list = view.blocks.filter(b => b.region === region).map(b => [b.off, b.off + b.length]).sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const spans = [];
  for (const [s, e] of list) {
    const last = spans[spans.length - 1];
    if (last && s < last.end) last.end = Math.max(last.end, e);
    else spans.push({start: s, end: e});
  }
  // Attach non-zero gap bytes to the preceding span (or to a new span if the gap leads the region).
  for (let i = 0; i < spans.length; i++) {
    const from = spans[i].end, to = i + 1 < spans.length ? spans[i + 1].start : bytes.length;
    let lastNonZero = -1; for (let k = to - 1; k >= from; k--) if (bytes[k] !== 0) { lastNonZero = k; break; }
    // A gap holding pointer-looking values that nothing references is dead data (e.g. an exporter's
    // watermark): it is dropped, since its pointers could not be relocated. If a known pointer
    // targets it, map() below refuses the file.
    if (lastNonZero >= 0 && deadPointers.some(a => a >= from && a < to)) { spans.dropped = (spans.dropped ?? 0) + (to - from); (spans.droppedRanges ??= []).push([from, to]); continue; }
    if (lastNonZero >= 0) spans[i].end = Math.min(to, (lastNonZero + 16) & ~15), spans[i].tail = true;
  }
  if (spans.length && spans[0].start > 0) {
    let nz = false; for (let k = 0; k < spans[0].start; k++) if (bytes[k]) { nz = true; break; }
    if (nz) spans.unshift({start: 0, end: spans[0].start, tail: true});
  }
  // Pointer targets outside every block (e.g. a non-null pointer to an empty array): keep 16 original
  // bytes there as a span of their own, so the pointer stays valid and sees the same bytes.
  const inside = t => { let lo = 0, hi = spans.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (spans[m].end <= t) lo = m + 1; else if (spans[m].start > t) hi = m - 1; else return true; } return false; };
  const orphans = [...new Set(targets)].filter(t => !inside(t)).sort((a, b) => a - b);
  for (const t of orphans) {
    if (inside(t)) continue;
    ensure(!(spans.droppedRanges ?? []).some(([a, b]) => t >= a && t < b), ErrorCode.INCONSISTENT_REFERENCE, 'A known pointer targets dead data', {region, off: t});
    const next = spans.find(x => x.start > t)?.start ?? bytes.length;
    ensure(t < bytes.length, ErrorCode.INCONSISTENT_REFERENCE, 'Pointer to the end of the region', {region, off: t});
    spans.push({start: t, end: Math.min(t + 16, next), orphan: true}); spans.sort((a, b) => a.start - b.start);
  }
  return spans;
}

/** Choose page sizes for the spans (first-fit decreasing) and give each span its new offset. */
function layout(spans, baseShift, {root = null} = {}) {
  let rootCls = null;
  for (let shift = baseShift; shift <= 15; shift++) {
    const base = 512 * 2 ** shift, classes = FIELDS.map((_, i) => base * 2 ** (8 - i));
    const used = FIELDS.map(() => 0), max = FIELDS.map(([, w]) => 2 ** w - 1);
    // Smallest page class that fits and still has room in its count field.
    const pageFor = need => { for (let i = FIELDS.length - 1; i >= 0; i--) if (classes[i] >= need && used[i] < max[i]) return i; return -1; };
    const openPage = cls => { used[cls]++; const p = {cls, size: classes[cls], used: 0}; pages.push(p); return p; };
    const sizeOf = x => Math.max(x.end - x.start, x.reserve ?? 0);
    const order = spans.map((s, i) => i).sort((a, b) => sizeOf(spans[b]) - sizeOf(spans[a]));
    if (root !== null) { order.splice(order.indexOf(root), 1); order.unshift(root); }
    const pages = []; // {cls, size, used}
    const placed = new Array(spans.length);
    let ok = true;
    // The root span opens a page of the largest class needed, so that page can come first (offset 0).
    if (root !== null) {
      const maxLen = Math.max(...spans.map(x => Math.max(x.end - x.start, x.reserve ?? 0) + (x.start & 15)));
      const cls = rootCls ?? pageFor(maxLen); if (cls < 0) continue;
      openPage(cls);
    }
    for (const i of order) {
      const s = spans[i], len = sizeOf(s), mod = s.start & 15;
      let done = false;
      for (const p of pages) {
        const at = ((p.used - mod + 15) & ~15) + mod;
        if (at + len <= p.size) { placed[i] = {page: p, at}; p.used = at + len; done = true; break; }
      }
      if (done) continue;
      const cls = pageFor(len + mod); if (cls < 0) { ok = false; break; }
      const p = openPage(cls);
      const at = mod; placed[i] = {page: p, at}; p.used = at + len;
    }
    if (!ok) continue;
    // Page counts must fit their fields; otherwise retry with a bigger base page.
    const counts = FIELDS.map((_, i) => pages.filter(p => p.cls === i).length);
    if (counts.some((n, i) => n >= 2 ** FIELDS[i][1])) continue;
    // Final order is largest class first; the root's page must come first (offset 0).
    const rootPage = root === null ? null : placed[root].page;
    pages.sort((a, b) => a.cls - b.cls || (b === rootPage) - (a === rootPage));
    if (rootPage && pages[0] !== rootPage) {
      // A bigger page class was opened later: give the root a page of that class and pack again.
      ensure(rootCls === null || pages[0].cls < rootCls, ErrorCode.INCONSISTENT_REFERENCE, 'Root page is not first');
      rootCls = pages[0].cls; shift--; continue;
    }
    let cursor = 0; for (const p of pages) { p.offset = cursor; cursor += p.size; }
    let flags = shift; counts.forEach((n, i) => { flags |= n << FIELDS[i][0]; });
    return {flags: flags >>> 0, size: cursor, pages, newStart: spans.map((s, i) => placed[i].page.offset + placed[i].at)};
  }
  fail(ErrorCode.LIMIT_EXCEEDED, 'No page layout fits these blocks');
}

/**
 * Repack a decoded YFT ({view, resource} from readYft) into a new page layout.
 * Returns {system, graphics, systemFlags, graphicsFlags, map} ready for encodeYftResource.
 */
export function repackYft({view, resource}) {
  const all = unfollowedPointers(view), unfollowed = all.filter(u => u.owner !== null);
  const dead = all.filter(u => u.owner === null).map(u => u.at);
  ensure(unfollowed.length === 0, ErrorCode.UNSUPPORTED_STRUCTURE, 'File has pointers the reader does not follow; refusing to relocate', {count: unfollowed.length, first: unfollowed[0]});
  ensure(view.graphics.length === 0 || view.blocks.some(b => b.region === 'graphics'), ErrorCode.UNSUPPORTED_STRUCTURE, 'Graphics region without known blocks');
  const pagesInfoAt = view.sdv.getUint32(8, true) - SYSTEM_BASE;
  const out = {};
  for (const region of ['system', 'graphics']) {
    const bytes = region === 'system' ? view.system : view.graphics;
    if (!bytes.length) { out[region] = {bytes: new Uint8Array(0), flags: 0, spans: [], newStart: []}; continue; }
    const targets = [...view.pointerFields.values()].filter(t => t.region === region).map(t => t.off);
    const spans = spansOf(view, region, region === 'system' ? dead : [], targets);
    // The page-info block must be able to list every page of the new layout: give it its own roomy span.
    if (region === 'system') {
      const i = spans.findIndex(s => s.start <= pagesInfoAt && pagesInfoAt < s.end);
      ensure(i >= 0, ErrorCode.INCONSISTENT_REFERENCE, 'Page info outside known blocks');
      const s = spans[i];
      ensure(s.start === pagesInfoAt, ErrorCode.UNSUPPORTED_STRUCTURE, 'Page info shares bytes with another block');
      const after = {start: pagesInfoAt + 16 + 8 * (bytes[pagesInfoAt + 8] + bytes[pagesInfoAt + 9]), end: s.end, tail: s.tail};
      spans.splice(i, 1, {start: pagesInfoAt, end: after.start, reserve: PAGES_INFO_RESERVE});
      if (after.end > after.start) spans.splice(i + 1, 0, after);
    }
    const root = region === 'system' ? spans.findIndex(s => s.start === 0) : null;
    if (region === 'system') ensure(root >= 0, ErrorCode.INCONSISTENT_REFERENCE, 'Root block missing');
    const shift = (region === 'system' ? resource.systemFlags : resource.graphicsFlags) & 15;
    const lay = layout(spans, shift, {root});
    const next = new Uint8Array(lay.size);
    spans.forEach((s, i) => {
      next.set(bytes.subarray(s.start, s.end), lay.newStart[i]);
    });
    out[region] = {bytes: next, flags: lay.flags, spans, newStart: lay.newStart, pages: lay.pages.length, dropped: spans.dropped ?? 0};
  }
  // Address translation: old (region, off) -> new off, via the span that holds it.
  const map = (region, off) => {
    const r = out[region], spans = r.spans;
    let lo = 0, hi = spans.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (spans[m].end <= off) lo = m + 1; else if (spans[m].start > off) hi = m - 1; else return r.newStart[m] + off - spans[m].start; }
    fail(ErrorCode.INCONSISTENT_REFERENCE, 'Pointer target outside every known block', {region, off});
  };
  const sdv = new DataView(out.system.bytes.buffer);
  for (const [field, target] of view.pointerFields) {
    const at = map('system', field), to = map(target.region, target.off);
    sdv.setUint32(at, (target.region === 'system' ? SYSTEM_BASE : GRAPHICS_BASE) + to, true); sdv.setUint32(at + 4, 0, true);
  }
  // Page-info counts of the new layout (every FileBase page-info block the reader saw).
  for (const b of view.blocks.filter(x => x.kind === 'PagesInfo')) {
    const at = map('system', b.off);
    out.system.bytes[at + 8] = out.system.pages; out.system.bytes[at + 9] = out.graphics.pages ?? 0;
  }
  const version = YFT_RESOURCE_VERSION;
  return {
    system: out.system.bytes, graphics: out.graphics.bytes,
    systemFlags: (out.system.flags | ((version >>> 4) << 28)) >>> 0,
    graphicsFlags: ((out.graphics.flags ?? 0) | ((version & 15) << 28)) >>> 0,
    map, pages: {system: out.system.pages, graphics: out.graphics.pages ?? 0}, droppedDeadBytes: out.system.dropped,
  };
}

/** Repack and encode in one step. */
export function repackYftBytes(read, options) {
  const r = repackYft(read);
  return {...r, bytes: encodeYftResource(r, options)};
}

export {rsc7PageSizes};
