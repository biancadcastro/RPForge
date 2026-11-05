import {lstat, realpath, readdir, readFile, open, rename, unlink, rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';

const prefix = '.rpforge-journal-';
const identity = info => `${info.dev}:${info.ino}`;
const exists = async file => lstat(file).catch(error => {if(error.code==='ENOENT')return null;throw error;});
function within(root, relative) {
  if(typeof relative!=='string'||!relative||path.isAbsolute(relative))throw Error('Registro de recuperação inválido.');
  const file=path.resolve(root,relative);
  const offset=path.relative(root,file);
  if(!offset||offset==='..'||offset.startsWith('..'+path.sep)||path.isAbsolute(offset))throw Error('Caminho de recuperação fora do destino.');
  return file;
}
// Canonicalize existing parents too: Windows TEMP may use an 8.3 alias while
// realpath returns the long name. Missing output paths still need that identity.
async function canonical(file) {
  try{return await realpath(file);}catch(error){
    if(error.code!=='ENOENT')throw error;
    const parent=path.dirname(file);if(parent===file)throw error;
    return path.join(await canonical(parent),path.basename(file));
  }
}
async function digest(file) {
  const hash=createHash('sha256');
  for await(const bytes of createReadStream(file))hash.update(bytes);
  return hash.digest('hex');
}
async function inventory(root, folder=root) {
  const result=[];
  for(const entry of await readdir(folder,{withFileTypes:true})){
    const file=path.join(folder,entry.name),info=await lstat(file);
    if(info.isSymbolicLink())throw Error('Temporário redirecionado; recuperação automática recusada.');
    if(info.isDirectory())result.push({name:path.relative(root,file),identity:identity(info),directory:true},...await inventory(root,file));
    else if(info.isFile())result.push({name:path.relative(root,file),identity:identity(info),sha256:await digest(file)});
    else throw Error('Temporário contém um tipo de arquivo inesperado.');
  }
  return result.sort((a,b)=>a.name.localeCompare(b.name));
}
async function durable(file,value) {
  const handle=await open(file,'wx');
  try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}
}
function alive(pid) {
  if(!Number.isInteger(pid)||pid<1)return true;
  try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}
}

/** Recover only our interrupted, recorded operations. Preserve edits/replacements and all backups. */
export async function recoverPublications(destination) {
  const root=await realpath(destination);
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(!entry.isFile()||!/^\.rpforge-journal-[a-f0-9-]{36}\.json$/.test(entry.name))continue;
    const journal=path.join(root,entry.name),info=await lstat(journal);
    if(info.size>32*1024*1024)throw Error('Registro de recuperação muito grande. Confira a pasta de destino.');
    let data;
    try{data=JSON.parse(await readFile(journal,'utf8'));}catch{throw Error('Há um registro de recuperação ilegível na pasta de destino. Preserve-o para revisão.');}
    if(data.schema!==1||data.root!==root||!Array.isArray(data.files)||!Array.isArray(data.targets)||
      typeof data.stage!=='string'||!/^\.rpforge-[a-z0-9-]+$/i.test(data.stage))
      throw Error('Registro de recuperação incompatível. Nenhum arquivo foi removido.');
    if(alive(data.pid))continue;
    const stage=within(root,data.stage),stageInfo=await exists(stage);
    if(stageInfo&&(stageInfo.isSymbolicLink()||identity(stageInfo)!==data.stageIdentity))
      throw Error('O temporário foi substituído. Nenhum arquivo foi removido.');
    // Verify the complete temporary tree before removing any target, including extra files.
    if(stageInfo&&JSON.stringify(await inventory(stage))!==JSON.stringify(data.files))
      throw Error('Uma operação interrompida contém arquivos modificados. Preserve o temporário para revisão.');
    if(data.directory){
      const output=within(root,data.directory.output),current=await exists(output);
      const backup=data.directory.backup?within(root,data.directory.backup):null;
      const previous=backup?await exists(backup):null;
      if(current&&identity(current)!==data.stageIdentity&&previous)
        throw Error('A saída foi substituída após uma interrupção. O backup foi preservado para revisão.');
      if(!current&&previous){
        if(previous.isSymbolicLink()||identity(previous)!==data.directory.previousIdentity)
          throw Error('O backup foi substituído. Recuperação automática recusada.');
        await rename(backup,output);
      }
    }else if(data.state!=='committed'){
      const removable=[];
      for(const target of data.targets){
        const expected=data.files.find(file=>file.name===target.source);
        if(!expected)throw Error('Registro de arquivo incompleto. Recuperação automática recusada.');
        const file=within(root,target.target),current=await exists(file);
        if(!current||current.isSymbolicLink()||identity(current)!==expected.identity)continue;
        if(await digest(file)!==expected.sha256)throw Error('Um resultado interrompido foi editado. Ele foi preservado para revisão.');
        removable.push(file);
      }
      for(const file of removable)await unlink(file);
    }
    if(stageInfo)await rm(stage,{recursive:true,force:true});
    await unlink(journal);
  }
}

export async function publication(destination, stage, targets=[], directory=null) {
  const root=await realpath(destination),resolved=await realpath(stage);
  if(path.dirname(resolved)!==root||!path.basename(resolved).startsWith('.rpforge-'))throw Error('Temporário de publicação inválido.');
  const data={schema:1,root,stage:path.basename(resolved),stageIdentity:identity(await lstat(resolved)),
    pid:process.pid,state:'prepared',files:await inventory(resolved),
    targets:await Promise.all(targets.map(async({source,target})=>({source:path.relative(resolved,await canonical(path.resolve(source))),target:path.relative(root,await canonical(path.resolve(target)))}))),
    directory:directory?{output:path.relative(root,await canonical(path.resolve(directory.output))),backup:directory.backup?path.relative(root,await canonical(path.resolve(directory.backup))):null,
      previousIdentity:directory.previous?identity(directory.previous):null}:null};
  for(const target of data.targets){within(root,target.target);within(resolved,target.source);}
  if(data.directory){within(root,data.directory.output);if(data.directory.backup)within(root,data.directory.backup);}
  const journal=path.join(root,prefix+randomUUID()+'.json');
  await durable(journal,data);
  return {
    async commit(){
      const temporary=journal+'.tmp';await durable(temporary,{...data,state:'committed'});
      await rename(temporary,journal);
      const current=await exists(resolved);
      if(current){
        if(current.isSymbolicLink()||identity(current)!==data.stageIdentity)throw Error('O temporário mudou antes da limpeza. Ele foi preservado.');
        await rm(resolved,{recursive:true,force:true});
      }
      await unlink(journal).catch(error=>{if(error.code!=='ENOENT')throw error;});
    },
    async abort(){await unlink(journal).catch(error=>{if(error.code!=='ENOENT')throw error;});},
  };
}
