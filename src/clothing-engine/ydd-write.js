// Full YDD writer: the vehicle engine's repacker (every block the reader logged is laid out
// again in fresh pages and every followed pointer is rewritten) with the YDD resource version.
// Encoding (deflate) is left to the caller: Node uses encodeYdd below, the browser its own
// CompressionStream-based encoder with the same regions.
import {repackYft} from '../vehicle-engine/yft-repack.js';
import {YDD_RESOURCE_VERSION} from './ydd-read.js';

const withVersion = (flags, nibble) => ((flags & 0x0fffffff) | (nibble << 28)) >>> 0;

/** Repack a read YDD ({view, resource}) into new regions with YDD page flags. */
export function repackYdd(read) {
  const r = repackYft(read);
  return {...r, version: YDD_RESOURCE_VERSION,
    systemFlags: withVersion(r.systemFlags, YDD_RESOURCE_VERSION >>> 4), graphicsFlags: withVersion(r.graphicsFlags, YDD_RESOURCE_VERSION & 15)};
}
