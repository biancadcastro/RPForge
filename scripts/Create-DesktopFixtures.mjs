import { mkdir, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import path from 'node:path';
import { makeRpf, vehicleArchive } from '../tests/fixture.js';
const root = process.argv[2];
await mkdir(root, { recursive: true });
await writeFile(path.join(root, 'dlc.rpf'), vehicleArchive());
const raw = Buffer.alloc(512); raw.writeFloatLE(2, 44);
for (const at of [48, 52, 56]) raw.writeFloatLE(-1, at);
for (const at of [64, 68, 72]) raw.writeFloatLE(1, at);
const header = Buffer.alloc(16); header.write('RSC7'); header.writeUInt32LE(165, 4);
await mkdir(path.join(root, 'props')); await writeFile(path.join(root, 'props/sample.ydr'), Buffer.concat([header, deflateRawSync(raw)]));
const entry = (name, text = name) => ({ name, data: Buffer.from(text) });
await mkdir(path.join(root, 'map-test'));
await writeFile(path.join(root, 'map-test/map.rpf'), makeRpf([entry('interior.ymap'), entry('interior.ytyp'), entry('_manifest.ymf')]));
await mkdir(path.join(root, 'clothing-test'));
await writeFile(path.join(root, 'clothing-test/clothes.rpf'), makeRpf([
  entry('mp_f_freemode_01_ownfixture^jbib_000_u.ydd'), entry('mp_f_freemode_01_ownfixture^jbib_diff_000_a_uni.ytd'),
  entry('mp_f_freemode_01_ownfixture.ymt'), entry('shop.meta', '<ShopPedApparel><pedName>mp_f_freemode_01</pedName></ShopPedApparel>'),
]));
