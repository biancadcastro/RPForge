// Local, opt-in verification using authorized real assets; never modifies the corpus.
// Usage: node scripts/check-clothing-real.mjs <spec.json> <output-directory>
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { OBJLoader } from '../desktop-web/node_modules/three/examples/jsm/loaders/OBJLoader.js';
import { exportClothingObj } from '../src/clothing.js';
import {isolateClothingSpec,clothingTestDestination} from './lib/clothing-test-fixtures.mjs';
const hash=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const [specPath, destination]=process.argv.slice(2);
if(!specPath||!destination)throw Error('Informe spec JSON e pasta de resultados.');
await clothingTestDestination(destination);
const isolated=await isolateClothingSpec(specPath),specimens=isolated.specimens;
try {
assert.deepEqual(new Set(specimens.map(s=>s.gender)),new Set(['male','female']));
await mkdir(destination,{recursive:true});
const evidence=[];
for(const specimen of specimens) {
  const inputs=[specimen.model,specimen.texture,specimen.reference].filter(Boolean),before=await Promise.all(inputs.map(hash));
  const result=await exportClothingObj({model:specimen.model,texture:specimen.texture,destination});
  const obj=await readFile(result.objFile,'utf8'),reference=await readFile(specimen.reference,'utf8');
  const loader=new OBJLoader(),actual=loader.parse(obj),expected=loader.parse(reference);
  const expanded=object=>object.children.flatMap(mesh=>{
    const p=mesh.geometry.attributes.position,u=mesh.geometry.attributes.uv,n=mesh.geometry.attributes.normal,out=[];
    for(let i=0;i<p.count;i++)out.push([p.getX(i),p.getY(i),p.getZ(i),u.getX(i),u.getY(i),n.getX(i),n.getY(i),n.getZ(i)]);
    return out;
  });
  const a=expanded(actual),b=expanded(expected);
  assert.equal(a.length,result.triangles*3);assert.equal(a.length,b.length,'Reference triangle count');
  // The reference OBJ uses Y-up: (native X, native Z, -native Y).
  let maxPositionError=0,maxUvError=0,maxNormalError=0;
  const transformed=a.map(v=>[v[0],v[2],-v[1],v[3],v[4],v[5],v[7],-v[6]]);
  for(const [index,v] of transformed.entries()){
    const match=b[index];
    maxPositionError=Math.max(maxPositionError,...v.slice(0,3).map((x,i)=>Math.abs(x-match[i])));
    maxUvError=Math.max(maxUvError,...v.slice(3,5).map((x,i)=>Math.abs(x-match[i+3])));
    const length=Math.hypot(...v.slice(5)),refLength=Math.hypot(...match.slice(5));
    maxNormalError=Math.max(maxNormalError,...v.slice(5).map((x,i)=>Math.abs(x/length-match[i+5]/refLength)));
  }
  assert.ok(maxPositionError<0.000002);assert.ok(maxUvError<0.000002);
  // The historical OBJ has Blender's normalized/rounded normals. Check exact
  // native preservation separately against a fresh decode of the source YDD.
  const decodedFolder=await mkdtemp(path.join(os.tmpdir(),'rpforge-native-reference-'));
  try {
    execFileSync(fileURLToPath(new URL('../.tools/clothing-engine/ClothingDecoder.exe',import.meta.url)),[specimen.model,specimen.texture,decodedFolder,'high'],{windowsHide:true});
    const native=JSON.parse(await readFile(path.join(decodedFolder,'decoded.json'),'utf8'));
    const nativeNormals=native.meshes.flatMap(mesh=>mesh.indices.flatMap(i=>mesh.normals.slice(i*3,i*3+3)));
    assert.equal(nativeNormals.length,a.length*3);
    a.forEach((v,i)=>v.slice(5).forEach((n,c)=>assert.ok(Math.abs(n-nativeNormals[i*3+c])<0.0000001,'Native normals preserved without recalculation')));
  } finally {await rm(decodedFolder,{recursive:true,force:true});}
  // Expanded corners are checked in triangle order: this also verifies topology,
  // winding and the assignment of UVs to each individual face corner.
  assert.deepEqual(await Promise.all(inputs.map(hash)),before,'Source files preserved');
  const second=await exportClothingObj({model:specimen.model,texture:specimen.texture,destination});
  assert.notEqual(second.objFile,result.objFile,'Never overwrite an earlier OBJ');
  const secondObj=await readFile(second.objFile,'utf8');
  assert.equal(secondObj.replace(/^mtllib .*$/m,''),obj.replace(/^mtllib .*$/m,''),'Repeatable geometry');
  assert.deepEqual(result.files.map(f=>path.extname(f)).sort(),['.mtl','.obj']);
  assert.equal(path.resolve(result.output),path.resolve(destination),'No subfolder');
  const withoutTexture=await exportClothingObj({model:specimen.model,destination}).then(()=>null,error=>error);
  assert.ok(withoutTexture,'Missing external texture must fail for this corpus');
  assert.ok(!(await readdir(destination)).some(name=>name.startsWith('.rpforge-obj-')),'No temporary directory after failure');
  evidence.push({gender:specimen.gender,output:result.output,vertices:result.vertices,triangles:result.triangles,elapsedMs:result.elapsedMs,textures:result.textures,maxPositionError,maxUvError,maxNormalErrorVsHistoricalObj:maxNormalError,nativeNormals:'preserved without recalculation',sourceHashes:before,referenceTopology:'matched',sourcePreserved:true});
}
await writeFile(path.join(destination,'validation.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
} finally {await isolated.cleanup();}
