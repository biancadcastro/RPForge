import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { clothingLaunch } from '../desktop-web/electron/clothing-launch.mjs';
test('Explorer suggests only matching adjacent dictionaries and requires a choice for multiple variants',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'rpforge-obj-launch-'));
 const model=path.join(directory,'mp_m_freemode_01^jbib_012_u.ydd');
 const a=path.join(directory,'mp_m_freemode_01^jbib_diff_012_a_uni.ytd');
 try {
  await writeFile(model,'read-only selection');await writeFile(a,'texture');
  await writeFile(path.join(directory,'mp_m_freemode_01^jbib_diff_013_a_uni.ytd'),'other ID');
  await writeFile(path.join(directory,'mp_f_freemode_01^jbib_diff_012_a_uni.ytd'),'other gender');
  assert.deepEqual(await clothingLaunch(model),{model,texture:a,destination:directory,candidates:[a]});
  const b=path.join(directory,'mp_m_freemode_01^jbib_diff_012_b_uni.ytd');await writeFile(b,'variant');
  const multiple=await clothingLaunch(model);assert.equal(multiple.texture,'');assert.deepEqual(multiple.candidates,[a,b]);
  assert.equal((await clothingLaunch(directory)).model,model);
  await writeFile(path.join(directory,'mp_f_freemode_01^jbib_001_u.ydd'),'second model');
  assert.equal((await clothingLaunch(directory)).model,'','Multiple models require explicit selection');
  const empty=path.join(directory,'empty');await mkdir(empty);
  assert.deepEqual(await clothingLaunch(empty),{model:'',texture:'',destination:empty,candidates:[],directory:empty});
  await assert.rejects(clothingLaunch(a),/YDD/);
 } finally {await rm(directory,{recursive:true,force:true});}
});
