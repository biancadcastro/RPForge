// Compare src/vehicle-engine reads against CodeWalker oracle dumps (Invoke-YftOracle.ps1).
// Usage: node scripts/vehicle-engine/compare-oracle.mjs <oracle-dir>
// Prints one JSON line per file: {file, ok, checks, mismatches:[...first 20]}.
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {readYft} from '../../src/vehicle-engine/yft-read.js';
import {coverage} from '../../src/vehicle-engine/view.js';

const f32 = Math.fround;
// The oracle decodes names as UTF-8 and we keep latin1: compare with non-ASCII bytes folded (obfuscated mods use them).
const ascii = s => s == null ? s : s.replace(/[^ -~]+/g, '?');
export function compare(oracle, model) {
  const bad = []; let checks = 0;
  const eq = (path, a, b) => { checks++; if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) bad.push({path, engine: a, oracle: b}); };
  eq('name', model.name, oracle.name);
  const od = oracle.drawable, d = model.drawable;
  const ob = od.bones ?? [], bones = model.skeleton?.bones ?? [];
  eq('bones.length', bones.length, ob.length);
  ob.forEach((o, i) => {
    const b = bones[i]; if (!b) return;
    eq(`bones[${i}].name`, ascii(b.name), ascii(o.name));
    for (const k of ['tag', 'index', 'parent', 'sibling', 'flags']) eq(`bones[${i}].${k}`, b[k], o[k]);
    o.t.forEach((x, j) => eq(`bones[${i}].t${j}`, b.translation[j], f32(x)));
    o.r.forEach((x, j) => eq(`bones[${i}].r${j}`, b.rotation[j], f32(x)));
  });
  for (const lod of ['high', 'med', 'low', 'vlow']) {
    const om = od.lods[lod], m = d.lods[lod];
    eq(`lods.${lod}.present`, !!(m && m.length), !!(om && om.length));
    (om ?? []).forEach((o, i) => {
      const x = m?.[i]; if (!x) return;
      for (const k of ['boneIndex:bone', 'hasSkin:skin', 'renderMask:mask']) { const [a, b] = k.split(':'); eq(`${lod}[${i}].${a}`, x[a], o[b]); }
      eq(`${lod}[${i}].geometries`, x.geometries.length, o.geoms.length);
      o.geoms.forEach((og, j) => {
        const g = x.geometries[j]; if (!g) return;
        eq(`${lod}[${i}].g${j}.shader`, g.shaderIndex, og.shader); eq(`${lod}[${i}].g${j}.verts`, g.vertexCount & 0xffff, og.verts);
        eq(`${lod}[${i}].g${j}.idx`, g.indexCount, og.idx); eq(`${lod}[${i}].g${j}.stride`, g.stride, og.stride);
        eq(`${lod}[${i}].g${j}.flags`, g.declaration.flags, og.flags); eq(`${lod}[${i}].g${j}.types`, g.declaration.types, og.types);
        eq(`${lod}[${i}].g${j}.boneIds`, g.boneIds.length, og.boneIds);
      });
    });
  }
  const os = od.shaders ?? [], ss = d.shaderGroup?.shaders ?? [];
  eq('shaders.length', ss.length, os.length);
  os.forEach((o, i) => {
    const s = ss[i]; if (!s) return;
    eq(`shader[${i}].name`, s.nameHash, o.name); eq(`shader[${i}].file`, s.fileHash, o.file); eq(`shader[${i}].bucket`, s.renderBucket, o.bucket);
    eq(`shader[${i}].params`, s.parameters.length, o.params.length);
    o.params.forEach((op, j) => {
      const p = s.parameters[j]; if (!p) return;
      eq(`shader[${i}].p${j}.hash`, p.hash, op.h);
      eq(`shader[${i}].p${j}.kind`, p.kind === 'texture' ? 0 : p.kind === 'vector' ? 1 : (p.value.length), op.type);
      if (op.tex !== undefined) eq(`shader[${i}].p${j}.tex`, ascii(p.texture), ascii(op.tex));
    });
  });
  eq('embedded', (d.shaderGroup?.embeddedTextures ?? []).map(t => t.name).join('|'), (od.embedded ?? []).join('|'));
  eq('drawableArray', model.drawableArray.length, oracle.drawableArray);
  eq('glassWindows', model.glassWindowCount, oracle.glassWindows);
  eq('vehicleGlassWindows', model.vehicleGlassWindows?.count ?? 0, oracle.vehicleGlassWindows);
  eq('lights', model.lights.length, oracle.lights);
  if (oracle.physics) {
    const p = model.physics?.[0];
    eq('physics.groups', p?.groups.length, oracle.physics.groups.length);
    oracle.physics.groups.forEach((o, i) => { const g = p?.groups[i]; if (!g) return;
      eq(`group[${i}].name`, g.name, o.name); eq(`group[${i}].parent`, g.parent, o.parent); eq(`group[${i}].childIndex`, g.childIndex, o.childIndex);
      eq(`group[${i}].childCount`, g.childCount, o.childCount); eq(`group[${i}].glass`, g.glassWindowIndex, o.glass); });
    eq('physics.children', p?.children.length, oracle.physics.children.length);
    oracle.physics.children.forEach((o, i) => { const c = p?.children[i]; if (!c) return;
      eq(`child[${i}].group`, c.group, o.group); eq(`child[${i}].boneTag`, c.boneTag, o.boneTag); eq(`child[${i}].mass`, c.pristineMass, f32(o.mass));
      const om = o.d1?.lods?.high, cm = c.drawable?.lods?.high;
      eq(`child[${i}].d1.high`, cm?.length ?? 0, om?.length ?? 0);
      eq(`child[${i}].d2`, !!c.damagedDrawable, o.d2); });
    const TYPES = {Sphere: 'sphere', Capsule: 'capsule', Box: 'box', Geometry: 'geometry', GeometryBVH: 'bvh', Composite: 'composite', Disc: 'disc', Cylinder: 'cylinder', Cloth: 'cloth'};
    (oracle.physics.boundChildren ?? []).forEach((o, i) => {
      const c = p?.bound?.children?.[i];
      if (o === null) { eq(`bound.child[${i}]`, c, null); return; }
      eq(`bound.child[${i}].type`, c?.type, TYPES[o.t] ?? o.t);
      if (o.v >= 0) { eq(`bound.child[${i}].vertices`, c?.vertices, o.v); eq(`bound.child[${i}].polygons`, c?.polygons, o.p); eq(`bound.child[${i}].materials`, c?.materials, o.m); }
      if (o.bvh >= 0) eq(`bound.child[${i}].bvhNodes`, c?.bvh?.capacity, o.bvh); // CodeWalker lists the allocated capacity
    });
    eq('physics.bound', p?.bound?.type, {Composite: 'composite'}[oracle.physics.bound] ?? oracle.physics.bound);
    eq('physics.lod2', !!model.physics?.[1], oracle.physics.lod2);
  }
  return {checks, mismatches: bad};
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const dir = process.argv[2];
  for (const file of readdirSync(dir).filter(f => /^oracle-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7)))) {
    const oracle = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (oracle.error) { console.log(JSON.stringify({file: oracle.file, oracleError: oracle.error.split('\n')[0]})); continue; }
    try {
      const t = Date.now(), {model, view} = readYft(readFileSync(oracle.file)), ms = Date.now() - t;
      const {checks, mismatches} = compare(oracle, model), cov = coverage(view).system;
      console.log(JSON.stringify({file: oracle.file, ok: mismatches.length === 0, ms, checks, bones: model.stats.bones, lods: Object.keys(model.stats.lods).join('/'),
        triangles: model.stats.lods.high?.triangles, unexplainedNonZero: cov.unexplainedNonZero, nonZero: cov.nonZero, mismatches: mismatches.slice(0, 20)}));
    } catch (e) { console.log(JSON.stringify({file: oracle.file, ok: false, error: `${e.code ?? ''} ${e.message} ${JSON.stringify(e.details ?? {})}`})); }
  }
}
