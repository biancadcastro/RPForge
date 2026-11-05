import type {ClothingPreview,SkinMesh,SkinRole} from './desktop';
export function skinPreview(meshes:SkinMesh[],overrides:Record<string,'skin'|'cloth'>):ClothingPreview{
 const lines:string[]=[],groups:ClothingPreview['groups']=[];let offset=1;
 for(const mesh of meshes)for(const role of ['cloth','skin','uncertain'] as SkinRole[]){
  const faces=mesh.faceIds.map((id,i)=>({id,index:i,role:overrides[id]||mesh.role})).filter(f=>f.role===role);if(!faces.length)continue;
  const name='selection_'+groups.length;lines.push('o '+name,'usemtl '+name);
  for(let i=0;i<mesh.positions.length;i+=3)lines.push('v '+mesh.positions.slice(i,i+3).join(' '));
  for(let i=0;i<mesh.uv.length;i+=2)lines.push('vt '+mesh.uv.slice(i,i+2).join(' '));
  for(let i=0;i<mesh.normals.length;i+=3)lines.push('vn '+mesh.normals.slice(i,i+3).join(' '));
  for(const face of faces)lines.push('f '+mesh.indices.slice(face.index*3,face.index*3+3).map(i=>`${i+offset}/${i+offset}/${i+offset}`).join(' '));
  groups.push({name,material:name,texture:'',shader:role,color:role==='skin'?'#c08d5e':role==='cloth'?'#5e9bc6':'#c393ff',faceIds:faces.map(f=>f.id)});
  offset+=mesh.positions.length/3;
 }
 return {obj:lines.join('\n'),textures:{},groups};
}
export function skinCounts(meshes:SkinMesh[],overrides:Record<string,'skin'|'cloth'>){
 const counts={skin:0,cloth:0,uncertain:0};for(const mesh of meshes)for(const id of mesh.faceIds)counts[overrides[id]||mesh.role]++;return counts;
}
export function uncertainRegion(meshes:SkinMesh[],id:string,overrides:Record<string,'skin'|'cloth'>):string[]{
 const mesh=meshes.find(m=>m.faceIds.includes(id));if(!mesh||mesh.role!=='uncertain'||overrides[id])return [id];
 const edges=new Map<string,string[]>(),faceEdges=new Map<string,string[]>();
 for(let f=0;f<mesh.faceIds.length;f++){const face=mesh.faceIds[f];if(overrides[face])continue;const v=mesh.indices.slice(f*3,f*3+3),keys=[0,1,2].map(i=>[v[i],v[(i+1)%3]].sort((a,b)=>a-b).join(':'));faceEdges.set(face,keys);for(const key of keys)edges.set(key,[...(edges.get(key)||[]),face]);}
 const found=new Set([id]),pending=[id];while(pending.length){const face=pending.pop()!;for(const edge of faceEdges.get(face)||[])for(const other of edges.get(edge)||[])if(!found.has(other)){found.add(other);pending.push(other);}}
 return [...found];
}
