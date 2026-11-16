// Builds the phase-0 write proofs for one YFT into <out-dir> (outside the repo):
//   noop.yft      : in-place rewrite of every understood field, no edits
//   edit.yft      : seat_dside_f moved +0.05 m in Z, shader 0 first vector parameter changed
//   relocate.yft  : bone array moved to a newly appended page (pointer repointed, old bytes zeroed)
// plus expect.json describing what an independent reader (the CodeWalker oracle) must see.
// Usage: node scripts/vehicle-engine/make-edit-fixtures.mjs <yft> <out-dir>
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {readYft} from '../../src/vehicle-engine/yft-read.js';
import {writeYft, relocateBlock} from '../../src/vehicle-engine/yft-write.js';
import {encodeYftResource} from '../../src/vehicle-engine/resource.js';

const [input, out] = process.argv.slice(2);
mkdirSync(out, {recursive: true});
const bytes = readFileSync(input);
const noop = writeYft(readYft(bytes));
writeFileSync(join(out, 'noop.yft'), noop.bytes);

const r = readYft(bytes), seat = r.model.skeleton.bones.find(b => b.name === 'seat_dside_f');
seat.translation[2] = Math.fround(seat.translation[2] + 0.05);
const shader = r.model.drawable.shaderGroup.shaders[0], param = shader.parameters.find(p => p.kind === 'vector');
param.value = [0.25, 0.5, 0.75, 1];
const edit = writeYft(r);
writeFileSync(join(out, 'edit.yft'), edit.bytes);

const r2 = readYft(bytes), sk = r2.model.skeleton;
const moved = relocateBlock(r2.resource, sk.at + 0x20, sk.count * 0x50);
writeFileSync(join(out, 'relocate.yft'), encodeYftResource(moved));
writeFileSync(join(out, 'expect.json'), JSON.stringify({
  edit: {bone: seat.name, boneIndex: seat.index, translation: seat.translation, shaderIndex: 0, paramHash: param.hash, value: param.value},
  relocate: {movedTo: moved.movedTo, systemBytes: moved.system.length, bones: sk.count},
}, null, 1));
console.log(JSON.stringify({noop: noop.bytes.length, edit: edit.bytes.length, relocateSystem: moved.system.length, movedTo: moved.movedTo}));
