import {copyFile,lstat,mkdir,mkdtemp,readFile,realpath,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const project=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const within=(file,root)=>file.startsWith(root+path.sep);

export async function clothingTestDestination(destination){
 const resolved=path.resolve(destination),roots=[path.join(project,'output'),os.tmpdir()].map(p=>path.resolve(p));
 if(!roots.some(root=>within(resolved,root)))throw Error('Teste de roupas: o destino deve ficar em output/ ou em uma pasta temporária. O acervo não pode receber saídas de teste.');
 for(let current=resolved;current!==path.dirname(current);current=path.dirname(current)){
  const info=await lstat(current).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(info?.isSymbolicLink())throw Error('Destino de teste não pode usar diretórios redirecionados.');
 }
 await mkdir(resolved,{recursive:true});
 const actual=await realpath(resolved),actualRoots=await Promise.all(roots.map(root=>realpath(root).catch(()=>root)));
 if(!actualRoots.some(root=>within(actual,root)))throw Error('Destino de teste redirecionado para fora da área isolada.');
 return resolved;
}

export async function isolateClothingSpec(specPath){
 const source=JSON.parse(await readFile(specPath,'utf8'));
 const directory=await mkdtemp(path.join(os.tmpdir(),'rpforge-clothing-inputs-'));
 try{
  const specimens=[];
  for(const [index,item] of source.entries()){
   const target=path.join(directory,String(index));await mkdir(target);
   const isolated={...item};
   for(const key of ['model','texture','reference'])if(item[key]){
    const info=await lstat(item[key]);if(!info.isFile()||info.isSymbolicLink())throw Error('Entrada de teste deve ser um arquivo real.');
    isolated[key]=path.join(target,path.basename(item[key]));await copyFile(item[key],isolated[key]);
   }
   specimens.push(isolated);
  }
  return {specimens,directory,cleanup:()=>rm(directory,{recursive:true,force:true})};
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
