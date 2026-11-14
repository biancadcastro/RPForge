// Builds a FiveM test resource with three edited copies of one vehicle, to validate in game
// what phase 0 proved only against the offline oracle. Output must be OUTSIDE the repo.
//   <prefix>assento : seat_dside_f raised 30 cm (sit in the driver seat: ped sits higher)
//   <prefix>capo    : bonnet bone raised 30 cm (bonnet visibly floats above the body)
//   <prefix>ossos   : bone array relocated to an appended page (must look and drive like the original)
//   <prefix>reemp   : whole file repacked into a new page layout by the full writer (must be identical in game)
// Usage: node scripts/vehicle-engine/make-game-check.mjs <resource-dir> <out-dir> [prefix]
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync} from 'node:fs';
import {join, basename} from 'node:path';
import {readYft} from '../../src/vehicle-engine/yft-read.js';
import {writeYft, relocateBlock} from '../../src/vehicle-engine/yft-write.js';
import {repackYftBytes} from '../../src/vehicle-engine/yft-repack.js';
import {encodeYftResource} from '../../src/vehicle-engine/resource.js';

const [src, out, prefix = 'rpf0'] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: make-game-check.mjs <resource-dir> <out-dir> [prefix]');
if (existsSync(out)) throw new Error('Output folder already exists');
const model = basename(src);
const yft = readFileSync(join(src, 'stream', `${model}.yft`));
mkdirSync(join(out, 'stream'), {recursive: true}); mkdirSync(join(out, 'data'));

function raise(boneName, meters) {
  const r = readYft(yft), bone = r.model.skeleton.bones.find(b => b.name === boneName);
  if (!bone) throw new Error(`Bone ${boneName} not found`);
  bone.translation[2] = Math.fround(bone.translation[2] + meters); bone.dirty = true; // rebuild its matrices too
  return writeYft(r).bytes;
}
const variants = {
  [`${prefix}assento`]: raise('seat_dside_f', 0.3),
  [`${prefix}capo`]: raise('bonnet', 0.3),
  [`${prefix}ossos`]: (() => { const r = readYft(yft), sk = r.model.skeleton; return encodeYftResource(relocateBlock(r.resource, sk.at + 0x20, sk.count * 0x50)); })(),
  [`${prefix}reemp`]: repackYftBytes(readYft(yft)).bytes,
};
for (const [name, bytes] of Object.entries(variants)) {
  readYft(bytes); // must re-read cleanly with our own reader before shipping
  writeFileSync(join(out, 'stream', `${name}.yft`), bytes);
}
copyFileSync(join(src, 'stream', `${model}.ytd`), join(out, 'stream', `${model}.ytd`));

// vehicles.meta: clone the original entry per variant; textures stay in the original .ytd.
const meta = readFileSync(join(src, 'data', 'vehicles.meta'), 'utf8');
const item = meta.match(/<InitDatas>\s*(<Item>[\s\S]*?<\/Item>)\s*<\/InitDatas>/)?.[1];
if (!item) throw new Error('Could not find the vehicle entry in vehicles.meta');
const tag = (xml, t, v) => xml.replace(new RegExp(`<${t}>[^<]*</${t}>`), `<${t}>${v}</${t}>`);
const entries = Object.keys(variants).map(n => tag(tag(tag(item, 'modelName', n), 'gameName', n.toUpperCase()), 'txdName', model)
  .replace(/<kits>[\s\S]*?<\/kits>/, '<kits />'));
writeFileSync(join(out, 'data', 'vehicles.meta'), `<?xml version="1.0" encoding="UTF-8"?>
<CVehicleModelInfo__InitDataList>
  <residentTxd>vehshare</residentTxd>
  <residentAnims />
  <InitDatas>
${entries.join('\n')}
  </InitDatas>
  <txdRelationships>
    <Item><parent>vehicles_race_generic</parent><child>${model}</child></Item>
  </txdRelationships>
</CVehicleModelInfo__InitDataList>
`);
copyFileSync(join(src, 'data', 'handling.meta'), join(out, 'data', 'handling.meta'));
writeFileSync(join(out, 'fxmanifest.lua'), `-- Teste da fase 0 do motor de veículos do RPForge. Não distribuir.
fx_version 'cerulean'
game 'gta5'

files {
    'data/handling.meta',
    'data/vehicles.meta',
}

data_file 'HANDLING_FILE' 'data/handling.meta'
data_file 'VEHICLE_METADATA_FILE' 'data/vehicles.meta'
`);
console.log(JSON.stringify({out, models: Object.keys(variants)}));
