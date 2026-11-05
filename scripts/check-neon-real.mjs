import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {convertClothingNeon} from '../src/clothing-neon.js';
import {isolateClothingSpec,clothingTestDestination} from './lib/clothing-test-fixtures.mjs';
const [spec,destination]=process.argv.slice(2);
await clothingTestDestination(destination);
const isolated=await isolateClothingSpec(spec),specimens=isolated.specimens;
try {
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
await mkdir(destination,{recursive:true});const evidence=[];
for(const s of specimens){
 const before=await Promise.all([hash(s.model),hash(s.texture)]);
 const result=await convertClothingNeon({...s,destination,clothOnly:true});
 assert.equal(await hash(result.texture),before[1],'YTD copied byte for byte');
 assert.deepEqual(await Promise.all([hash(s.model),hash(s.texture)]),before,'Originals unchanged');
 assert.ok(result.geometryPreserved&&result.rigPreserved&&result.embeddedPreserved);
 assert.equal(result.shader,'ped_emissive.sps');assert.equal(result.lods.filter(l=>l.vertices>0).length,3);
 const originalResultHash=await hash(result.model);
 const repeat=await convertClothingNeon({...s,destination,clothOnly:true});
 assert.notEqual(result.drawableId,repeat.drawableId,'Unique IDs for versions exported together');
 assert.equal(await hash(result.model),originalResultHash,'Previous result preserved');
 const controller=new AbortController();controller.abort();
 await assert.rejects(convertClothingNeon({...s,destination,clothOnly:true,signal:controller.signal}),/cancelad/i);
 assert.ok(!(await readdir(destination)).some(f=>f.startsWith('.rpforge-neon-')));
 evidence.push({gender:s.gender,...result});
}
await writeFile(path.join(destination,'validation.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
} finally {await isolated.cleanup();}
