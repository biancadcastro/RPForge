import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {_electron} from 'playwright';
import {isolateClothingSpec,clothingTestDestination} from '../../scripts/lib/clothing-test-fixtures.mjs';
import {testProAccess} from './lib/test-pro-access.mjs';
const project=process.env.RPF_DESKTOP_PROJECT||path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const [spec,destination]=process.argv.slice(2);
await clothingTestDestination(destination);
const isolated=await isolateClothingSpec(spec),specimens=isolated.specimens;
await mkdir(destination,{recursive:true});const temporary=await mkdtemp(path.join(os.tmpdir(),'rpforge-neon-ui-'));let app;
try{
 for(const s of specimens){
  const env={...process.env,RPF_TEST_USER_DATA:path.join(temporary,s.gender),RPF_TEST_OUTPUT_ROOT:path.resolve(destination)};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:process.env.RPF_ELECTRON_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[project,'--test-mode','--neon-folder',path.dirname(s.model)],env});
  await testProAccess(app,project);
  const page=await app.firstWindow();page.setDefaultTimeout(20000);
  await page.getByRole('heading',{name:'Converter roupa para Neon'}).waitFor();
  assert.equal(await page.locator('header.header').count(),0);
  await page.getByRole('button',{name:path.basename(s.model)}).waitFor();
  await page.getByRole('button',{name:path.basename(s.texture)}).waitFor();
  assert.equal(await page.getByRole('checkbox').count(),0,'No skin-separation confirmation in Neon');
  assert.ok(await page.getByRole('button',{name:'Converter para Neon',exact:false}).isEnabled());
  await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},path.resolve(destination));
  await page.locator('[aria-label="Configuração Neon"] .clothing-file').nth(2).click();
  await page.getByRole('button',{name:'Converter para Neon',exact:false}).click();
  await page.getByRole('heading',{name:'Versão Neon criada.'}).waitFor();
  assert.equal(await page.locator('.clothing-workspace [role="alert"]').count(),0);
  const stats=await app.evaluate(()=>globalThis.__forgeDiagnostics());assert.equal(stats.profileRequests,0);assert.equal(stats.workers,0);
  await page.screenshot({path:path.join(destination,s.gender+'-neon.png')});
  await app.close();app=null;
 }
 console.log('PASS: independent Neon screen without skin checkbox, real male/female conversion, validation after reopen, no account requests and worker exit.');
}finally{await app?.close();await rm(temporary,{recursive:true,force:true});await isolated.cleanup();}
