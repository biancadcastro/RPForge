// Content checks shared by Neon, Separar pele and the browser: what must not change between the file the
// engine built, the repacked regions and the final bytes (pointers move; content does not).
import {LODS, lodGeometries} from './ydd-read.js';
import {textureDataSize} from '../vehicle-engine/yft-read.js';
import {ErrorCode, ensure} from '../animation-engine/errors.js';

/** FNV-1a over a byte range (32 bits, as hex). Fast and enough to detect any change in a check. */
export function hashBytes(bytes, h = 0x811c9dc5) {
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const regionOf = (read, region) => (region === 'graphics' ? read.view.graphics : read.view.system);
const hashRanges = (read, ranges = []) => ranges.reduce((h, [at, len]) => hashBytes(read.view.system.subarray(at, at + len), h), 0x811c9dc5).toString(16);

/** Rig: bone names/tags/parents, bone transforms, bind matrices and joint limits (not just the names, as the desktop XML check). */
export function rigOf(read, d) {
  return JSON.stringify([d.skeleton?.bones ?? null, hashRanges(read, d.skeleton?.rigRanges), hashRanges(read, d.jointRanges)]);
}

/** Embedded textures with the pixels of every mip level. */
export function embeddedOf(read, d) {
  return JSON.stringify(d.shaderGroup.embeddedTextures.map(t => {
    const size = textureDataSize(t.formatCode, t.width, t.height, t.levels);
    let h = 0;
    if (t.data) {
      const px = regionOf(read, t.data.region).subarray(t.data.off, t.data.off + size);
      ensure(px.length === size, ErrorCode.INCONSISTENT_REFERENCE, 'Embedded texture outside the resource');
      h = hashBytes(px);
    }
    return [t.name, t.width, t.height, t.formatCode, t.levels, size, h];
  }));
}

/** Everything the output must keep, for every drawable: identity, shaders, geometry bytes, rig and textures. */
export function contentSignature(read) {
  return JSON.stringify(read.model.drawables.map(({hash, drawable: d}) => [hash >>> 0, d.name,
    d.shaderGroup.shaders.map(s => [s.nameHash, s.fileHash, s.renderBucket, s.parameters.map(p => [p.hash, p.kind === 'texture' ? p.texture : p.value])]),
    LODS.map(lod => lodGeometries(d, lod).map(({model, geometry: g}) => [model, g.shaderIndex, g.declaration.flags, g.declaration.lo, g.declaration.hi, g.stride,
      g.vertexCount, g.indexCount, g.boneIds.join(','),
      hashBytes(regionOf(read, g.vertexData.region).subarray(g.vertexData.off, g.vertexData.off + g.vertexData.length)),
      hashBytes(regionOf(read, g.indexData.region).subarray(g.indexData.off, g.indexData.off + g.indexData.length))])),
    rigOf(read, d), embeddedOf(read, d)]));
}
