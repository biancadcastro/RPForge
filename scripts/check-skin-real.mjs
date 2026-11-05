import assert from 'node:assert/strict';import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {isolateClothingSpec,clothingTestDestination} from './lib/clothing-test-fixtures.mjs';import {inspectClothingSkin,separateClothingSkin} from '../src/clothing-skin.js';
const [spec,destination]=process.argv.slice(2);await clothingTestDestination(destination);const isolated=await isolateClothingSpec(spec),hash=async p=>createHash('sha256').update(await readFile(p)).digest('hex'),evidence=[];
try{
 for(const specimen of isolated.specimens){
  const {model,texture}=specimen,before=await Promise.all([hash(model),hash(texture)]),review=await inspectClothingSkin({model,texture}),output=path.join(destination,specimen.gender);await mkdir(output,{recursive:true});
  const overrides={};
  if(!review.canSplit){
   const files=await readdir(output);await assert.rejects(separateClothingSkin({model,texture,destination:output,expectedSource:review.fingerprint}),/ambíguas/);assert.deepEqual(await readdir(output),files);
   // Exercise explicit manual decisions separately from automatic classification.
   // This tests transfer/validation of user choices, not the semantic correctness
   // of a proposed manual selection; those choices still require visual review.
   for(const data of Object.values(review.previews))for(const mesh of data.meshes)if(mesh.role==='uncertain')for(const face of mesh.faceIds)overrides[face]='cloth';
  }
  const result=await separateClothingSkin({model,texture,destination:output,expectedSource:review.fingerprint,overrides});
  assert.ok(result.partitionPreserved&&result.attributesPreserved&&result.rigPreserved&&result.materialsPreserved&&result.texturesPreserved);
  assert.notEqual(result.roles.cloth.id,result.roles.skin.id);assert.equal(result.files.length,4);
  assert.equal(path.dirname(result.roles.cloth.model),path.resolve(output,'Roupa'));assert.equal(path.dirname(result.roles.skin.model),path.resolve(output,'Pele'));
  for(const role of ['cloth','skin'])assert.equal(await hash(result.roles[role].texture),before[1]);
  const blocked=path.join(output,'blocked-subfolder');await mkdir(blocked,{recursive:true});await writeFile(path.join(blocked,'Pele'),'existing user file');const blockedBefore=await readdir(blocked);
  await assert.rejects(separateClothingSkin({model,texture,destination:blocked,expectedSource:review.fingerprint,overrides}),/diretórios reais/);assert.deepEqual(await readdir(blocked),blockedBefore,'Invalid role directories must be preserved without leaving a new empty Roupa folder');
  assert.deepEqual(await Promise.all([hash(model),hash(texture)]),before,'Input copies unchanged');
  const repeat=await separateClothingSkin({model,texture,destination:output,expectedSource:review.fingerprint,overrides});assert.notEqual(repeat.roles.skin.id,result.roles.skin.id);assert.notEqual(repeat.roles.cloth.id,result.roles.cloth.id);
  const old=await readFile(model);const changed=Buffer.from(old);changed[changed.length-1]^=1;await writeFile(model,changed);
  await assert.rejects(separateClothingSkin({model,texture,destination:output,expectedSource:review.fingerprint,overrides}),/mudou/);await writeFile(model,old);
  await assert.rejects(separateClothingSkin({model,texture,destination:output,expectedSource:review.fingerprint,overrides:{'high:999:999':'skin'}}),/inválida/);
  assert.ok(!(await readdir(output)).some(f=>f.startsWith('.rpforge-skin-')));
  evidence.push({gender:specimen.gender,automatic:review.canSplit,manualFaces:Object.keys(overrides).length,manualSemantics:review.canSplit?'not required':'requires user review',...result});
 }
 await writeFile(path.join(destination,'validation.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await isolated.cleanup();}
