import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {distributionEngine,engineNames} from '../scripts/distribution-engine.mjs';
test('distribution includes every verified clothing component and notices but excludes game/private files',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'forge-distribution-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const source=path.join(root,'source');await mkdir(source);const records=[];
 for(const name of [...engineNames,'CodeWalker-NOTICE.txt','DirectXTex-LICENSE.txt']){await writeFile(path.join(source,name),name);records.push({name,sha256:createHash('sha256').update(name).digest('hex')});}
 await writeFile(path.join(source,'manifest.json'),JSON.stringify({files:records}));await writeFile(path.join(source,'private.key'),'private');await writeFile(path.join(source,'piece.ydd'),'game');
 const destination=path.join(root,'payload');await distributionEngine(source,destination);
 const result=JSON.parse(await readFile(path.join(destination,'manifest.json'),'utf8'));assert.equal(result.developmentOnly,false);assert.equal(result.files.length,11);
 await assert.rejects(access(path.join(destination,'private.key')));await assert.rejects(access(path.join(destination,'piece.ydd')));
 await assert.rejects(distributionEngine(source,destination),{code:'EEXIST'});
 await writeFile(path.join(source,'ClothingDecoder.exe'),'tampered');const bad=path.join(root,'bad');await assert.rejects(distributionEngine(source,bad),/alterado/);await assert.rejects(access(bad));
});
