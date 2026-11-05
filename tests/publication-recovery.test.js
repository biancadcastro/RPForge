import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {recoverPublications} from '../src/publication.js';

const moduleUrl=pathToFileURL(path.resolve('src/publication.js')).href;
async function interrupt(root,kind){
  const script=path.join(root,'child.mjs');
  await writeFile(script,`import {publication} from ${JSON.stringify(moduleUrl)};
    import {mkdir,writeFile,link,rename,lstat} from 'node:fs/promises';
    const root=process.env.TEST_ROOT,stage=root+'/.rpforge-stage';
    await mkdir(stage);await writeFile(stage+'/model.obj','new obj');await writeFile(stage+'/model.mtl','new mtl');
    const kind=process.env.TEST_KIND;
    if(kind==='directory'){
      await mkdir(root+'/addon');await writeFile(root+'/addon/old.txt','original');
      await publication(root,stage,[],{output:root+'/addon',backup:root+'/addon.backup',previous:await lstat(root+'/addon')});
      await rename(root+'/addon',root+'/addon.backup');
    }else{
      const journal=await publication(root,stage,[{source:stage+'/model.obj',target:root+'/model.obj'},{source:stage+'/model.mtl',target:root+'/model.mtl'}]);
      await link(stage+'/model.obj',root+'/model.obj');
      if(kind==='committed'){await link(stage+'/model.mtl',root+'/model.mtl');await journal.commit();}
    }
    process.send('ready');setInterval(()=>{},1000);`);
  const child=fork(script,[],{env:{...process.env,TEST_ROOT:root,TEST_KIND:kind},silent:true,windowsHide:true});
  let error='';child.stderr.on('data',bytes=>{error+=bytes;});
  await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('exit',code=>reject(Error(`Child exited ${code}: ${error}`)));setTimeout(()=>reject(Error('Publication fixture timed out')),10000).unref();});
  const closed=new Promise(resolve=>child.once('exit',resolve));child.kill();await closed;
}
for(const kind of ['files','directory','committed'])test(`recovers ${kind} publication after the owner process exits`,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'rpforge-recover-'));
  try{
    await interrupt(root,kind);await recoverPublications(root);
    const entries=await readdir(root);
    assert.equal(entries.some(name=>name.startsWith('.rpforge-')),false);
    if(kind==='files')assert.equal(entries.includes('model.obj'),false);
    if(kind==='directory')assert.equal(await readFile(path.join(root,'addon/old.txt'),'utf8'),'original');
    if(kind==='committed')assert.equal(await readFile(path.join(root,'model.mtl'),'utf8'),'new mtl');
  }finally{await rm(root,{recursive:true,force:true});}
});
test('preserves edited interrupted output and refuses recursive cleanup when extra files appear',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'rpforge-recover-edits-'));
  try{
    await interrupt(root,'files');await writeFile(path.join(root,'model.obj'),'user edit');
    await assert.rejects(recoverPublications(root),/modificados|editado/);
    assert.equal(await readFile(path.join(root,'model.obj'),'utf8'),'user edit');
    await writeFile(path.join(root,'.rpforge-stage/personal.txt'),'keep');
    await assert.rejects(recoverPublications(root),/modificados/);
    assert.equal(await readFile(path.join(root,'.rpforge-stage/personal.txt'),'utf8'),'keep');
  }finally{await rm(root,{recursive:true,force:true});}
});
