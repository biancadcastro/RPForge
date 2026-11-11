import { readFile, writeFile, readdir, mkdtemp, lstat, link, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { engineFiles, inputFile } from './clothing.js';
import {publication,recoverPublications} from './publication.js';
import {engineError} from './user-error.js';
const execute=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export function neonIdentity(model, texture) {
 if(/(?:^|[\\/])(pele|skin|completo|complete)(?:[\\/]|$)/i.test(model))throw Error('Pele e montagem Completo são preservadas. Selecione a roupa isolada.');
 const stem=path.basename(model,path.extname(model));
 const match=stem.match(/^(mp_[mf]_freemode_01(?:_[a-z0-9]+)?\^)([a-z]{4})_(\d{3})_([a-z])$/i);
 if(!match||match[2].toLowerCase()==='uppr')throw Error('Selecione uma roupa freemode isolada com nome de componente e ID de três dígitos. Torso de pele não recebe Neon.');
 const [,prefix,component,id,suffix]=match;
 let variation='';
 if(texture){
  const name=path.basename(texture,path.extname(texture));
  const expected=`${prefix}${component}_diff_${id}_`;
  if(!name.toLowerCase().startsWith(expected.toLowerCase()))throw Error('O YTD selecionado não corresponde ao componente e ID desta peça.');
  variation=name.slice(expected.length);
  if(!/^[a-z]_[a-z0-9_]+$/i.test(variation))throw Error('Variação de textura não reconhecida.');
 }
 return {prefix,component,sourceId:id,suffix,variation};
}

export async function convertClothingNeon({model,texture='',destination,signal,onProgress=()=>{}}) {
 const naming=neonIdentity(model,texture),started=performance.now();
 const sources=[await inputFile(model,'.ydd',165)];if(texture)sources.push(await inputFile(texture,'.ytd',13));
 const dest=path.resolve(destination),info=await lstat(dest);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Escolha uma pasta de destino real.');
 await recoverPublications(dest);
 const engine=await engineFiles(['ClothingNeon.exe','SharpDX.dll','neon-shader.xml','skin-triangles.json']);
 const stage=await mkdtemp(path.join(dest,'.rpforge-neon-')),published=[];
 let journal;
 try {
  const used=new Set([naming.sourceId]);
  for(const directory of new Set([dest,path.dirname(path.resolve(model))]))for(const file of await readdir(directory)){
   const prefix=(naming.prefix+naming.component+'_').toLowerCase(),name=file.toLowerCase();
   if(name.startsWith(prefix)){const id=name.slice(prefix.length).replace(/^diff_/,'').match(/^(\d{3})_/);if(id)used.add(id[1]);}
  }
  for(let id=0;id<1000;id++) {
   const drawableId=String(id).padStart(3,'0');if(used.has(drawableId))continue;
   const short=`${naming.component}_${drawableId}_${naming.suffix}`,stem=naming.prefix+short;
   const ydd=path.join(dest,stem+'.ydd'),ytd=texture?path.join(dest,`${naming.prefix}${naming.component}_diff_${drawableId}_${naming.variation}.ytd`):null;
   onProgress({phase:'convert',label:'Aplicando Neon e validando todos os LODs…'});
   const native=await execute(path.join(engine,'ClothingNeon.exe'),[model,path.join(stage,'model.ydd'),short,path.join(engine,'neon-shader.xml'),path.join(engine,'skin-triangles.json')],{windowsHide:true,timeout:60000,signal,maxBuffer:2*1024*1024,encoding:'utf8'}).catch(error=>{throw engineError(error,'Não foi possível converter esta peça.','Conversão cancelada.');});
   const validation=JSON.parse(native.stdout);
   if(!validation.geometryPreserved||!validation.rigPreserved||!validation.embeddedPreserved)throw Error('Validação Neon não foi aprovada.');
   if(texture)await writeFile(path.join(stage,'texture.ytd'),await readFile(texture));
   for(const source of sources)if(hash(await readFile(source.file))!==source.sha256)throw Error('A origem mudou durante a conversão. Saída recusada.');
   signal?.throwIfAborted();
   journal=await publication(dest,stage,[{source:path.join(stage,'model.ydd'),target:ydd},...(ytd?[{source:path.join(stage,'texture.ytd'),target:ytd}]:[])]);
   try {
    for(const [source,target] of [[path.join(stage,'model.ydd'),ydd],...(ytd?[[path.join(stage,'texture.ytd'),ytd]]:[])]){
     await link(source,target);published.push({target,identity:await lstat(target)});
    }
    await journal.commit();journal=null;
    return {output:dest,model:ydd,texture:ytd,drawableId,files:published.map(p=>path.basename(p.target)),elapsedMs:Math.round(performance.now()-started),...validation};
   }catch(error){
    if(error.code!=='EEXIST')throw error;
    for(const {target,identity} of published.splice(0)){const current=await lstat(target).catch(()=>null);if(current?.ino===identity.ino&&current?.dev===identity.dev)await unlink(target);}
    await journal.abort();journal=null;
   }
  }
  throw Error('Não existe ID livre entre 000 e 999 neste destino.');
 }catch(error){
  for(const {target,identity} of published){const current=await lstat(target).catch(()=>null);if(current?.ino===identity.ino&&current?.dev===identity.dev)await unlink(target);}
  if(journal){await journal.abort();journal=null;}
  throw error;
 }finally{if(!journal)await rm(stage,{recursive:true,force:true});}
}
