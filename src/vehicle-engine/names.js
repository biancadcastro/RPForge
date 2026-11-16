// Readable names for hashes found in vehicle drawables. Only for display and reports:
// the files store hashes, and an unknown hash is reported as hex, never guessed.
import {joaat} from '../animation-engine/hash.js';

const SHADERS = [
  'vehicle_badges', 'vehicle_basic', 'vehicle_blurredrotor', 'vehicle_blurredrotor_emissive', 'vehicle_cloth', 'vehicle_cloth2',
  'vehicle_cutout', 'vehicle_dash_emissive', 'vehicle_dash_emissive_opaque', 'vehicle_decal', 'vehicle_decal2', 'vehicle_detail',
  'vehicle_detail2', 'vehicle_emissive_alpha', 'vehicle_emissive_opaque', 'vehicle_generic', 'vehicle_interior', 'vehicle_interior2',
  'vehicle_licenseplate', 'vehicle_lights', 'vehicle_lightsemissive', 'vehicle_lightsemissive_siren', 'vehicle_mesh',
  'vehicle_mesh_enveff', 'vehicle_mesh2_enveff', 'vehicle_paint1', 'vehicle_paint1_enveff', 'vehicle_paint2', 'vehicle_paint2_enveff',
  'vehicle_paint3', 'vehicle_paint3_enveff', 'vehicle_paint3_lvr', 'vehicle_paint4', 'vehicle_paint4_emissive', 'vehicle_paint4_enveff',
  'vehicle_paint5_enveff', 'vehicle_paint6', 'vehicle_paint6_enveff', 'vehicle_paint7', 'vehicle_paint7_enveff', 'vehicle_paint8',
  'vehicle_paint9', 'vehicle_shuts', 'vehicle_tire', 'vehicle_tire_emissive', 'vehicle_track', 'vehicle_track_ammo',
  'vehicle_track_cutout', 'vehicle_track_emissive', 'vehicle_track_siren', 'vehicle_track2', 'vehicle_track2_emissive',
  'vehicle_vehglass', 'vehicle_vehglass_inner', 'default', 'normal', 'normal_spec', 'emissive', 'emissivestrong', 'spec', 'cutout',
  'decal', 'glass', 'glass_env', 'normal_spec_cutout', 'normal_spec_decal', 'emissive_alpha', 'normal_cutout', 'normal_decal',
];
const PARAMS = [
  'DiffuseSampler', 'BumpSampler', 'SpecSampler', 'DetailSampler', 'DirtSampler', 'DamageSampler', 'EnvironmentSampler',
  'TintPaletteSampler', 'DiffuseSampler2', 'DiffuseSampler3', 'DiffuseHfSampler', 'DiffuseExtraSampler', 'BumpSampler2',
  'matDiffuseColor', 'matDiffuseColor2', 'matDiffuseSpecularRampEnabled', 'specularColorFactor', 'specularFresnel', 'specularFalloffMult',
  'specularIntensityMult', 'specular2Factor', 'specular2ColorIntensity', 'specular2Color', 'specular2Color_DirLerp', 'bumpiness',
  'dirtLevelMod', 'dirtColor', 'detailSettings', 'DamagedWheelOffsets', 'damageTextureOffset', 'envEffScale', 'envEffThickness',
  'envEffTexTileUV', 'emissiveMultiplier', 'HardAlphaBlend', 'Fresnel', 'DiffuseTexTileUV', 'TintPaletteSelector', 'distEpsilonScaleMin',
  'distMapCenterVertical', 'distMapCenterHorizontal', 'distEpsilonScaleMax', 'distMapTilingScale', 'distSize',
  'WheelAngleTrackPosOffset', 'wrinkleMaskStrengths', 'globalAnimUV0', 'globalAnimUV1', 'AlphaTest', 'AlphaTestValue', 'materialDetails',
  'detailUVScale', 'DetailUVScale', 'DetailUVScale2', 'diffuseColor', 'diffuse2SpecMod', 'paintColor', 'dashBoardColor', 'Track2AnimUV',
  'TrackAnimUV', 'texcoord', 'DimmerSet', 'LicensePlateFontExtents', 'LicensePlateFontTint', 'numLetters', 'FontNormalScale',
  'LetterSize', 'LetterIndex1', 'LetterIndex2', 'FontSampler', 'FontNormalSampler', 'parallaxScaleBias', 'ParallaxScaleBias',
];
const SHADER_BY_HASH = new Map(), FILE_BY_HASH = new Map(), PARAM_BY_HASH = new Map();
for (const s of SHADERS) { SHADER_BY_HASH.set(joaat(s), s); FILE_BY_HASH.set(joaat(`${s}.sps`), `${s}.sps`); }
for (const p of PARAMS) PARAM_BY_HASH.set(joaat(p), p);

const hex = h => `0x${(h >>> 0).toString(16).padStart(8, '0')}`;
export function shaderName(hash) { return SHADER_BY_HASH.get(hash >>> 0) ?? hex(hash); }
export function shaderFileName(hash) { return FILE_BY_HASH.get(hash >>> 0) ?? hex(hash); }
export function parameterName(hash) { return PARAM_BY_HASH.get(hash >>> 0) ?? hex(hash); }

// Physics/skeleton bounds types (rage::phBound::eType as numbered in the file).
export const BOUND_TYPES = Object.freeze({0: 'sphere', 1: 'capsule', 3: 'box', 4: 'geometry', 8: 'bvh', 10: 'composite', 12: 'disc', 13: 'cylinder', 15: 'cloth'});

// Vertex declaration: semantic bit index -> name; component type code -> byte size.
export const VERTEX_SEMANTICS = Object.freeze(['position', 'blendWeights', 'blendIndices', 'normal', 'colour0', 'colour1',
  'texcoord0', 'texcoord1', 'texcoord2', 'texcoord3', 'texcoord4', 'texcoord5', 'texcoord6', 'texcoord7', 'tangent', 'binormal']);
// 0 half, 1 half2, 2 half3, 3 half4, 4 float, 5 float2, 6 float3, 7 float4, 8 ubyte4, 9 colour (ubyte4n), 10 dec3n.
export const COMPONENT_SIZES = Object.freeze([2, 4, 6, 8, 4, 8, 12, 16, 4, 4, 4]);
export const COMPONENT_NAMES = Object.freeze(['half', 'half2', 'half3', 'half4', 'float', 'float2', 'float3', 'float4', 'ubyte4', 'colour', 'dec3n']);
