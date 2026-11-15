// Clothing engine: pure JS replacement of the desktop CodeWalker adapters (ClothingDecoder/Neon/Skin),
// used by the website tools in the browser. See docs/CLOTHING_ENGINE.md.
export {readYddResource, readYtdResource, lodGeometries, statsOf, LODS, LOD_LABELS, YDD_RESOURCE_VERSION, YTD_RESOURCE_VERSION, CLOTHING_LIMITS} from './ydd-read.js';
export {repackYdd} from './ydd-write.js';
export {geometryArrays, componentReader} from './vertex.js';
export {buildClothingObj, OBJ_LIMITS} from './obj.js';
export {convertNeon, refuseSkin, NEON_SHADER, NEON_COLOUR} from './neon.js';
export {analyseSkin, applyOverrides, splitSkin, summarize, previewOf, ROLE, SKIN_LIMITS} from './skin.js';
export {referenceSet, genderOf, triangleFingerprint} from './skin-reference.js';
