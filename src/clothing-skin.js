import {readFile,writeFile,readdir,lstat,stat,mkdtemp,mkdir,rmdir,link,unlink,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {engineFiles,inputFile} from './clothing.js';
import {publication,recoverPublications} from './publication.js';
import {engineError,internalError} from './user-error.js';
const execute=promisify(execFile),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const required=['ClothingSkin.exe','SharpDX.dll','skin-triangles.json'];
export function skinIdentity(model,texture=''){
 const stem=path.basename(model,path.extname(model)),m=stem.match(/^(mp_[mf]_freemode_01(?:_[a-z0-9]+)?\^)([a-z]{4})_(\d{3})_([a-z])$/i);
 if(!m)throw Error('Selecione uma roupa freemode com componente e ID de três dígitos.');
 const [,prefix,component,id,suffix]=m;let variation='';
 if(texture){const name=path.basename(texture,path.extname(texture)),start=`${prefix}${component}_diff_${id}_`;if(!name.toLowerCase().startsWith(start.toLowerCase()))throw Error('O YTD não corresponde à peça selecionada.');variation=name.slice(start.length);if(!/^[a-z]_[a-z0-9_]+$/i.test(variation))throw Error('Variação de textura inválida.');}
 return {prefix,component,sourceId:id,suffix,variation};
}
export function skinOverrides(values={}){
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length>200000)throw internalError('Seleção de faces inválida.');
 for(const [key,value] of Object.entries(values))if(!/^(high|medium|low|verylow):\d{1,5}:\d{1,7}$/.test(key)||!['skin','cloth'].includes(value))throw internalError('Seleção de faces inválida.');
 return values;
}
async function inputs(model,texture){skinIdentity(model,texture);const files=[await inputFile(model,'.ydd',165)];if(texture)files.push(await inputFile(texture,'.ytd',13));return files;}
async function run(engine,args,signal){try{await execute(path.join(engine,'ClothingSkin.exe'),args,{windowsHide:true,signal,timeout:60000,maxBuffer:1024*1024,encoding:'utf8'});}catch(e){throw engineError(e,args[0]==='--split'?'Não foi possível separar esta peça.':'Não foi possível analisar esta peça.','Separação cancelada.');}}
export async function inspectClothingSkin({model,texture='',signal,onProgress=()=>{}}){
 const sources=await inputs(model,texture),engine=await engineFiles(required),stage=await mkdtemp(path.join(os.tmpdir(),'rpforge-skin-analysis-'));
 try{
  onProgress({phase:'read',label:'Identificando pele e roupa nos LODs…'});
  const report=path.join(stage,'analysis.json');await run(engine,['--inspect',model,path.join(engine,'skin-triangles.json'),report],signal);
  if((await stat(report)).size>48*1024*1024)throw Error('Esta peça excede o limite de prévia da ferramenta.');
  const data=JSON.parse(await readFile(report,'utf8'));
  for(const source of sources)if(hash(await readFile(source.file))!==source.sha256)throw Error('A peça mudou durante a leitura. Refaça a análise.');
  return {...data,fingerprint:sources.map(s=>({name:s.name,sha256:s.sha256}))};
 }finally{await rm(stage,{recursive:true,force:true});}
}
export async function separateClothingSkin({model,texture='',destination,expectedSource,overrides={},signal,onProgress=()=>{}}){
 const naming=skinIdentity(model,texture),sources=await inputs(model,texture);skinOverrides(overrides);
 if(!expectedSource||sources.length!==expectedSource.length||sources.some((s,i)=>s.sha256!==expectedSource[i].sha256||s.name!==expectedSource[i].name))throw Error('A peça ou a textura mudou. Refaça a análise antes de separar.');
 const dest=path.resolve(destination),info=await lstat(dest);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Escolha uma pasta de destino real.');
 await recoverPublications(dest);
 const engine=await engineFiles(required),stage=await mkdtemp(path.join(dest,'.rpforge-skin-')),published=[],created=[],started=performance.now();let completed=false;
 let journal;
 try{
  const folders={cloth:path.join(dest,'Roupa'),skin:path.join(dest,'Pele')};
  for(const folder of Object.values(folders)){
   try{await mkdir(folder);created.push(folder);}catch(e){if(e.code!=='EEXIST')throw e;}
   const info=await lstat(folder);if(!info.isDirectory()||info.isSymbolicLink())throw Error('As pastas Roupa e Pele devem ser diretórios reais.');
  }
  const used=new Set([naming.sourceId]);
  for(const directory of new Set([dest,...Object.values(folders),path.dirname(path.resolve(model))]))for(const file of await readdir(directory)){const prefix=(naming.prefix+naming.component+'_').toLowerCase();if(file.toLowerCase().startsWith(prefix)){const id=file.slice(prefix.length).replace(/^diff_/i,'').match(/^(\d{3})_/);if(id)used.add(id[1]);}}
  await writeFile(path.join(stage,'selection.json'),JSON.stringify(overrides));
  for(let attempt=0;attempt<500;attempt++){
   const ids=[];for(let n=0;n<1000&&ids.length<2;n++){const id=String(n).padStart(3,'0');if(!used.has(id)){used.add(id);ids.push(id);}}
   if(ids.length!==2)throw Error('Não há dois IDs livres neste destino.');
   const roles={};for(const [i,role] of ['cloth','skin'].entries()){const short=`${naming.component}_${ids[i]}_${naming.suffix}`;roles[role]={id:ids[i],short,model:path.join(folders[role],naming.prefix+short+'.ydd'),texture:texture?path.join(folders[role],`${naming.prefix}${naming.component}_diff_${ids[i]}_${naming.variation}.ytd`):null};}
   onProgress({phase:'write',label:'Separando as faces e validando os dois YDDs…'});
   await run(engine,['--split',model,path.join(engine,'skin-triangles.json'),path.join(stage,'cloth.ydd'),path.join(stage,'skin.ydd'),roles.cloth.short,roles.skin.short,path.join(stage,'validation.json'),path.join(stage,'selection.json')],signal);
   const validation=JSON.parse(await readFile(path.join(stage,'validation.json'),'utf8'));
   if(!validation.partitionPreserved||!validation.attributesPreserved||!validation.rigPreserved||!validation.materialsPreserved||!validation.texturesPreserved)throw Error('Validação da separação não foi aprovada.');
   if(texture)await writeFile(path.join(stage,'original.ytd'),await readFile(texture));
   for(const source of sources)if(hash(await readFile(source.file))!==source.sha256)throw Error('A origem mudou. Nenhum resultado foi publicado.');
   signal?.throwIfAborted();
   const targets=[];
   for(const role of ['cloth','skin'])targets.push({source:path.join(stage,role+'.ydd'),target:roles[role].model},...(texture?[{source:path.join(stage,'original.ytd'),target:roles[role].texture}]:[]));
   journal=await publication(dest,stage,targets);
   try{
    for(const role of ['cloth','skin'])for(const [source,target] of [[path.join(stage,role+'.ydd'),roles[role].model],...(texture?[[path.join(stage,'original.ytd'),roles[role].texture]]:[])]){await link(source,target);published.push({target,identity:await lstat(target)});}
    await journal.commit();journal=null;
    completed=true;return {output:dest,roles,files:published.map(p=>path.relative(dest,p.target)),elapsedMs:Math.round(performance.now()-started),...validation};
   }catch(e){if(e.code!=='EEXIST')throw e;for(const {target,identity} of published.splice(0)){const now=await lstat(target).catch(()=>null);if(now?.ino===identity.ino&&now?.dev===identity.dev)await unlink(target);}await journal.abort();journal=null;}
  }throw Error('Não foi possível reservar os arquivos de saída.');
 }catch(e){for(const {target,identity} of published){const now=await lstat(target).catch(()=>null);if(now?.ino===identity.ino&&now?.dev===identity.dev)await unlink(target);}if(journal){await journal.abort();journal=null;}throw e;}
 finally{if(!journal)await rm(stage,{recursive:true,force:true});if(!completed)for(const folder of created)await rmdir(folder).catch(()=>{});}
}
