import {existsSync,mkdirSync,readdirSync,cpSync,writeFileSync} from 'node:fs';
import path from 'node:path';
// Cookie storage and the OS encryption key must use the same profile in both launch identities.
export function desktopProfile(legacy,localData){
 const shared=path.join(localData,'RPForge','desktop-profile'),marker=path.join(shared,'.profile-ready');
 if(!existsSync(marker)){
  mkdirSync(shared,{recursive:true});
  const transient=new Set(['Cache','Code Cache','GPUCache','DawnGraphiteCache','DawnWebGPUCache','GrShaderCache','ShaderCache','blob_storage','lockfile','SingletonLock','SingletonCookie','SingletonSocket','DevToolsActivePort']);
  if(existsSync(legacy))for(const item of readdirSync(legacy)){if(!transient.has(item))cpSync(path.join(legacy,item),path.join(shared,item),{recursive:true,force:false,errorOnExist:false});}
  writeFileSync(marker,'1');
 }
 return shared;
}
