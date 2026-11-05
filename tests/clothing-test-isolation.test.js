import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {isolateClothingSpec,clothingTestDestination} from '../scripts/lib/clothing-test-fixtures.mjs';
test('garment tests pass only independent copies to the application',async()=>{
 const base=await mkdtemp(path.join(os.tmpdir(),'rpforge-isolation-check-'));
 let copies;
 try{
  const source=path.join(base,'read-only-corpus');await mkdir(source);
  const model=path.join(source,'original.ydd'),texture=path.join(source,'original.ytd');
  await writeFile(model,'original model');await writeFile(texture,'original texture');
  const spec=path.join(base,'spec.json');await writeFile(spec,JSON.stringify([{gender:'female',model,texture}]));
  copies=await isolateClothingSpec(spec);const isolated=copies.specimens[0];
  assert.notEqual(isolated.model,model);assert.notEqual(isolated.texture,texture);
  await writeFile(isolated.model,'changed disposable copy');
  assert.equal(await readFile(model,'utf8'),'original model');
  assert.equal(await readFile(texture,'utf8'),'original texture');
 }finally{await copies?.cleanup();await rm(base,{recursive:true,force:true});}
});
test('test outputs outside the dedicated areas are refused before directory creation',async()=>{
 await assert.rejects(clothingTestDestination(path.resolve('forbidden-test-corpus-output')),/destino deve ficar/);
});
