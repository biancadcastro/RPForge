import {mkdir,appendFile,stat,rename} from 'node:fs/promises';
import path from 'node:path';
// Local status only: never persist tokens, identities, paths, passwords or keys.
export function createAuthDiagnostics(directory){
 let queue=Promise.resolve();const file=path.join(directory,'session.jsonl');
 const allowed=['event','status','code','valid','plan','present','error','loggedIn','action','mode','packaged'];
 return event=>{const safe=Object.fromEntries(allowed.filter(key=>Object.hasOwn(event,key)).map(key=>[key,event[key]]));
  queue=queue.catch(()=>{}).then(async()=>{await mkdir(directory,{recursive:true});if((await stat(file).catch(()=>({size:0}))).size>262144)await rename(file,file+'.previous').catch(()=>{});await appendFile(file,JSON.stringify({at:new Date().toISOString(),...safe})+'\n');}).catch(()=>{});
 };
}
