import path from 'node:path';
import {access,mkdir,writeFile} from 'node:fs/promises';
import {encryptedSessionStorage} from './session-storage.mjs';
export function desktopAccountStorage(userData,localData,safeStorage,onDiagnostic){
 const directory=path.join(localData,'RPForge','account'),marker=path.join(directory,'.migrated');
 const shared=encryptedSessionStorage(directory,safeStorage,onDiagnostic);
 const legacy=encryptedSessionStorage(userData,safeStorage);
 const exists=async file=>{try{await access(file);return true;}catch{return false;}};
 const migrated=async()=>{await mkdir(directory,{recursive:true});await writeFile(marker,'1');};
 return {...shared,
  async write(value){await shared.write(value);await migrated();},
  async clear(){await migrated();await shared.clear();},
  async read(){
   const record=await shared.read();if(record)return record;
   // Never revive an old refresh token after logout, revocation or a failed decryption.
   if(await exists(marker)||await exists(path.join(directory,'desktop-session.bin')))return null;
   const old=await legacy.read();return old?{...old,migrateStorage:true}:null;
  }
 };
}
