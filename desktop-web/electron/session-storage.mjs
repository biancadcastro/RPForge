import { readFile, writeFile, mkdir, rename, unlink, open, stat } from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function encryptedSessionStorage(directory,safeStorage,onDiagnostic){
  const filename=path.join(directory,'desktop-session.bin');
  const available=()=>safeStorage.isAsyncEncryptionAvailable?safeStorage.isAsyncEncryptionAvailable():safeStorage.isEncryptionAvailable();
  return {
    async withLock(operation){
      await mkdir(directory,{recursive:true});const lock=filename+'.lock',deadline=Date.now()+30000;let handle;
      while(!handle){
        try{handle=await open(lock,'wx');await handle.writeFile(JSON.stringify({pid:process.pid}));}
        catch(error){
          if(error.code!=='EEXIST')throw error;
          try{const owner=JSON.parse(await readFile(lock,'utf8'));if(Number.isSafeInteger(owner.pid)&&owner.pid>0){try{process.kill(owner.pid,0);}catch(probe){if(probe.code==='ESRCH'){await unlink(lock).catch(()=>{});continue;}}}}catch{try{if(Date.now()-(await stat(lock)).mtimeMs>30000){await unlink(lock).catch(()=>{});continue;}}catch{}}
          if(Date.now()>=deadline)throw new Error('A sessão está sendo atualizada por outro processo. Tente novamente.');
          await new Promise(resolve=>setTimeout(resolve,40));
        }
      }
      try{return await operation();}finally{await handle.close();await unlink(lock).catch(()=>{});}
    },
    async clear(){await unlink(filename).catch(error=>{if(error.code!=='ENOENT')throw error;});},
    async read(){try{if(!await available()){onDiagnostic?.({event:'session_storage_unavailable'});return null;}const bytes=await readFile(filename);const plain=safeStorage.decryptStringAsync?(await safeStorage.decryptStringAsync(bytes)).result:safeStorage.decryptString(bytes);return JSON.parse(plain);}catch(error){onDiagnostic?.({event:'session_read_failed',code:error.code||error.name});return null;}},
    async write(value){
      if(!await available())throw new Error('O Windows não disponibilizou o armazenamento seguro da conta.');
      await mkdir(directory,{recursive:true});
      const temporary=filename+'.'+randomUUID()+'.tmp',plain=JSON.stringify(value),bytes=safeStorage.encryptStringAsync?await safeStorage.encryptStringAsync(plain):safeStorage.encryptString(plain);
      try{await writeFile(temporary,bytes);await rename(temporary,filename);}finally{await unlink(temporary).catch(()=>{});}
    },
  };
}
