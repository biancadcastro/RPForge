import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {desktopProfile} from '../desktop-web/electron/desktop-profile.mjs';
test('normal and packaged launches preserve a single profile and its encryption key',()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'rpforge-profile-'));
 try{
  const legacy=path.join(root,'legacy');mkdirSync(legacy);writeFileSync(path.join(legacy,'Local State'),'existing-key');writeFileSync(path.join(legacy,'desktop-session.bin'),'encrypted-session');mkdirSync(path.join(legacy,'Cache'));writeFileSync(path.join(legacy,'Cache','cache'),'transient');
  const normal=desktopProfile(legacy,path.join(root,'local'));
  const packaged=desktopProfile(path.join(root,'virtualized-missing'),path.join(root,'local'));
  assert.equal(normal,packaged);assert.equal(readFileSync(path.join(packaged,'Local State'),'utf8'),'existing-key');assert.equal(readFileSync(path.join(packaged,'desktop-session.bin'),'utf8'),'encrypted-session');assert.equal(existsSync(path.join(packaged,'Cache')),false);assert.equal(existsSync(path.join(legacy,'desktop-session.bin')),true);
  writeFileSync(path.join(legacy,'Local State'),'different-key');desktopProfile(legacy,path.join(root,'local'));assert.equal(readFileSync(path.join(normal,'Local State'),'utf8'),'existing-key');
 }finally{rmSync(root,{recursive:true,force:true});}
});
