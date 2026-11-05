import test from 'node:test';
import assert from 'node:assert/strict';
import { buildObjPackage, validateGeometry, exportClothingObj } from '../src/clothing.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
const fixture = () => ({ textures: [{id:'texture_000',width:512,height:256}], meshes: [{ positions:[0,0,0,1,0,0,0,1,0], normals:[0,0,1,0,0,1,0,0,1], uv:[-0.25,0,1,0,0,1.5], indices:[0,1,2], texture:'texture_000',shader:'test' }] });
test('OBJ is independently readable with UVs outside tile, normals, material groups and correct second-mesh offsets', () => {
  const data=fixture();data.meshes.push({...structuredClone(data.meshes[0]),positions:[0,0,1,1,0,1,0,1,1]});
  const result=buildObjPackage(data), parsed=new OBJLoader().parse(result.obj);
  assert.equal(parsed.children.length,2);
  assert.deepEqual(Array.from(parsed.children[1].geometry.attributes.position.array),[0,0,1,1,0,1,0,1,1]);
  assert.deepEqual(Array.from(parsed.children[0].geometry.attributes.uv.array),[-0.25,0,1,0,0,1.5]);
  assert.equal(parsed.children[0].material.name,'material_0');assert.equal(parsed.children[1].material.name,'material_1');
  assert.match(result.mtl,/newmtl material_1/);assert.doesNotMatch(result.mtl,/map_Kd|map_d|\.png/);
});
test('malformed geometry is refused rather than inventing UVs or normals', () => {
  for(const edit of [d=>d.meshes[0].indices[2]=3,d=>d.meshes[0].normals=[],d=>d.meshes[0].uv.pop(),d=>d.meshes[0].positions[0]=NaN,d=>d.meshes[0].normals.fill(0),d=>d.meshes[0].texture='missing']) {
    const data=fixture();edit(data);assert.throws(()=>validateGeometry(data));
  }
});
test('texture identifiers cannot inject filesystem paths or duplicate maps', () => {
  const data=fixture();data.textures[0].id='../outside';assert.throws(()=>buildObjPackage(data));
  const duplicate=fixture();duplicate.textures.push({...duplicate.textures[0]});assert.throws(()=>buildObjPackage(duplicate));
});
test('invalid LOD is rejected before any source or output is opened', async () => {
  await assert.rejects(exportClothingObj({lod:'all',model:'absent',destination:'absent'}),/LOD inválido/);
});
