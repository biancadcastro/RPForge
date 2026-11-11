// FBX bone name -> GTA skeleton bone. Matching order, per source bone:
//   1. manual map given by the caller ({'source name': 'SKEL_...' | null});
//   2. exact GTA name (case-insensitive, namespace such as "rig:" removed);
//   3. alias table below (documented in docs/animation-engine/FBX-AND-RETARGET.md).
// Nothing is guessed beyond these tables: an unknown name stays unmapped and is listed.
// When two source bones claim the same target, manual beats exact beats alias, then the
// first one in file order wins; the loser is reported.
import {ErrorCode, ensure} from './errors.js';

const SIDES = [['left', 'L'], ['right', 'R']];
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const ALIASES = new Map();
const alias = (name, target) => ALIASES.set(key(name), target);

/** Comparison key: lower case, namespace and separators removed ("mixamorig:LeftUpLeg" -> "leftupleg"). */
export function key(name) {
  return String(name).replace(/^.*[:|]/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Mixamo / HumanIK / Rokoko-style names. The hips drive SKEL_ROOT: that is the bone real
// GTA emotes animate for whole-body rotation and height (SKEL_Pelvis is rarely keyed).
alias('Hips', 'SKEL_ROOT'); alias('Spine', 'SKEL_Spine0'); alias('Spine1', 'SKEL_Spine1'); alias('Spine2', 'SKEL_Spine3');
alias('Chest', 'SKEL_Spine1'); alias('UpperChest', 'SKEL_Spine3');
alias('Neck', 'SKEL_Neck_1'); alias('Head', 'SKEL_Head');
for (const [side, s] of SIDES) {
  const S = side[0].toUpperCase() + side.slice(1);
  alias(`${S}Shoulder`, `SKEL_${s}_Clavicle`); alias(`${S}Arm`, `SKEL_${s}_UpperArm`); alias(`${S}UpperArm`, `SKEL_${s}_UpperArm`);
  alias(`${S}ForeArm`, `SKEL_${s}_Forearm`); alias(`${S}LowerArm`, `SKEL_${s}_Forearm`); alias(`${S}Hand`, `SKEL_${s}_Hand`);
  alias(`${S}UpLeg`, `SKEL_${s}_Thigh`); alias(`${S}UpperLeg`, `SKEL_${s}_Thigh`); alias(`${S}Leg`, `SKEL_${s}_Calf`); alias(`${S}LowerLeg`, `SKEL_${s}_Calf`);
  alias(`${S}Foot`, `SKEL_${s}_Foot`); alias(`${S}ToeBase`, `SKEL_${s}_Toe0`); alias(`${S}Toes`, `SKEL_${s}_Toe0`);
  FINGERS.forEach((finger, f) => { for (let j = 1; j <= 3; j++) alias(`${S}Hand${finger}${j}`, `SKEL_${s}_Finger${f}${j - 1}`); });
  // Unreal Engine mannequin (suffix _l/_r).
  const u = s.toLowerCase();
  alias(`clavicle_${u}`, `SKEL_${s}_Clavicle`); alias(`upperarm_${u}`, `SKEL_${s}_UpperArm`); alias(`lowerarm_${u}`, `SKEL_${s}_Forearm`); alias(`hand_${u}`, `SKEL_${s}_Hand`);
  alias(`thigh_${u}`, `SKEL_${s}_Thigh`); alias(`calf_${u}`, `SKEL_${s}_Calf`); alias(`foot_${u}`, `SKEL_${s}_Foot`); alias(`ball_${u}`, `SKEL_${s}_Toe0`);
  FINGERS.forEach((finger, f) => { for (let j = 1; j <= 3; j++) alias(`${finger}_0${j}_${u}`, `SKEL_${s}_Finger${f}${j - 1}`); });
  // 3ds Max Biped ("Bip01 L Thigh"; the GTA rig descends from it, so names line up).
  for (const prefix of ['Bip01', 'Bip001']) {
    for (const part of ['Clavicle', 'UpperArm', 'Forearm', 'Hand', 'Thigh', 'Calf', 'Foot', 'Toe0']) alias(`${prefix} ${s} ${part}`, `SKEL_${s}_${part}`);
    for (let f = 0; f < 5; f++) { alias(`${prefix} ${s} Finger${f}`, `SKEL_${s}_Finger${f}0`); alias(`${prefix} ${s} Finger${f}1`, `SKEL_${s}_Finger${f}1`); alias(`${prefix} ${s} Finger${f}2`, `SKEL_${s}_Finger${f}2`); }
  }
}
alias('pelvis', 'SKEL_ROOT'); alias('spine_01', 'SKEL_Spine0'); alias('spine_02', 'SKEL_Spine1'); alias('spine_03', 'SKEL_Spine3'); alias('neck_01', 'SKEL_Neck_1');
for (const prefix of ['Bip01', 'Bip001']) {
  alias(`${prefix} Pelvis`, 'SKEL_ROOT'); alias(`${prefix} Spine`, 'SKEL_Spine0'); alias(`${prefix} Spine1`, 'SKEL_Spine1'); alias(`${prefix} Spine2`, 'SKEL_Spine2'); alias(`${prefix} Spine3`, 'SKEL_Spine3');
  alias(`${prefix} Neck`, 'SKEL_Neck_1'); alias(`${prefix} Head`, 'SKEL_Head');
}

/** The alias table as [normalizedSourceKey, targetBoneName] pairs (for documentation and UIs). */
export function aliasTable() { return [...ALIASES.entries()]; }

const RANK = {manual: 0, exact: 1, alias: 2};

/**
 * Map candidate FBX nodes to skeleton bones.
 * Returns {pairs: [{source (model index), sourceName, target (bone index), targetName, tag, via}],
 *          unmapped: [sourceName], conflicts: [{sourceName, targetName, keptSourceName}], excluded: [sourceName]}.
 */
export function mapBones(scene, skel, manual) {
  const candidates = scene.models.filter(m => m.isBoneCandidate);
  ensure(candidates.length <= scene.doc.limits.maxBones, ErrorCode.LIMIT_EXCEEDED, 'Too many FBX bones', {bones: candidates.length, limit: scene.doc.limits.maxBones});
  const exact = new Map(skel.bones.map((b, i) => [b.name.toLowerCase(), i]));
  const stripped = name => name.replace(/^.*[:|]/, '');
  const manualByName = new Map();
  if (manual !== undefined && manual !== null) {
    ensure(typeof manual === 'object' && !Array.isArray(manual), ErrorCode.BONE_MAP_INVALID, 'boneMap must be an object of source name -> target bone name');
    const known = new Set(candidates.flatMap(m => [m.name, stripped(m.name)]));
    const unknownSources = [], unknownTargets = [];
    for (const [source, target] of Object.entries(manual)) {
      if (!known.has(source)) unknownSources.push(source);
      if (target !== null && !(typeof target === 'string' && skel.byName.has(target))) unknownTargets.push(String(target));
      manualByName.set(source, target);
    }
    ensure(!unknownSources.length && !unknownTargets.length, ErrorCode.BONE_MAP_INVALID, 'boneMap names bones that do not exist', {unknownSources: unknownSources.slice(0, 32), unknownTargets: unknownTargets.slice(0, 32)});
  }
  const claims = new Map(), unmapped = [], excluded = [], conflicts = [];
  for (const m of candidates) {
    let target = -1, via = null;
    const manualTarget = manualByName.has(m.name) ? manualByName.get(m.name) : manualByName.get(stripped(m.name));
    if (manualTarget === null) { excluded.push(m.name); continue; }
    if (manualTarget !== undefined) { target = skel.byName.get(manualTarget); via = 'manual'; }
    else if (exact.has(stripped(m.name).toLowerCase())) { target = exact.get(stripped(m.name).toLowerCase()); via = 'exact'; }
    else if (ALIASES.has(key(m.name)) && skel.byName.has(ALIASES.get(key(m.name)))) { target = skel.byName.get(ALIASES.get(key(m.name))); via = 'alias'; }
    if (target < 0) { unmapped.push(m.name); continue; }
    const claim = {source: m.index, sourceName: m.name, target, targetName: skel.bones[target].name, tag: skel.bones[target].tag, via};
    const held = claims.get(target);
    if (!held) claims.set(target, claim);
    else if (RANK[via] < RANK[held.via]) { conflicts.push({sourceName: held.sourceName, targetName: claim.targetName, keptSourceName: m.name}); claims.set(target, claim); }
    else conflicts.push({sourceName: m.name, targetName: claim.targetName, keptSourceName: held.sourceName});
  }
  const pairs = [...claims.values()].sort((a, b) => a.target - b.target);
  return {pairs, unmapped, conflicts, excluded};
}
