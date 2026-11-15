// Node entry points (RSC7 inflate/deflate with node:zlib). The browser decodes and encodes
// asynchronously with DecompressionStream/CompressionStream and calls the *Resource readers.
import {decodeEnvelope} from '../animation-engine/envelope.js';
import {encodeYftResource} from '../vehicle-engine/resource.js';
import {readYddResource, readYtdResource, YDD_RESOURCE_VERSION, YTD_RESOURCE_VERSION, CLOTHING_LIMITS} from './ydd-read.js';

export function decodeYdd(input, limits = CLOTHING_LIMITS) { return decodeEnvelope(input, YDD_RESOURCE_VERSION, limits); }
export function decodeYtd(input, limits = CLOTHING_LIMITS) { return decodeEnvelope(input, YTD_RESOURCE_VERSION, limits); }
export function readYdd(input, {limits} = {}) { return readYddResource(decodeYdd(input, limits)); }
export function readYtd(input, {limits} = {}) { return readYtdResource(decodeYtd(input, limits)); }
/** Encode regions returned by the engine (repackYdd/convertNeon/splitSkin) as an RSC7 file. */
export function encodeYdd(regions, options) { return encodeYftResource({...regions, version: YDD_RESOURCE_VERSION}, options); }
