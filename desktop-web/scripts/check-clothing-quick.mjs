import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
import {isolateClothingSpec,clothingTestDestination} from '../../scripts/lib/clothing-test-fixtures.mjs';
import {testProAccess} from './lib/test-pro-access.mjs';
const source=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const project=process.env.RPF_DESKTOP_PROJECT ? path.resolve(process.env.RPF_DESKTOP_PROJECT) : source;
const [spec,destination]=process.argv.slice(2);
await clothingTestDestination(destination);
const isolated=await isolateClothingSpec(spec),specimens=isolated.specimens;
await mkdir(destination,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'rpforge-obj-quick-'));
let app;
try {
 for(const specimen of specimens) {
  const env={...process.env,RPF_TEST_USER_DATA:path.join(temporary,specimen.gender),RPF_TEST_OUTPUT_ROOT:path.resolve(destination)};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:process.env.RPF_ELECTRON_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[project,'--test-mode',...(process.env.RPF_TEST_OBJ_FOLDER ? ['--obj-folder',path.dirname(specimen.model)] : ['--obj',specimen.model])],env,timeout:25000});
  await testProAccess(app,project);
  const page=await app.firstWindow();page.setDefaultTimeout(20000);
  await page.getByRole('heading',{name:'Roupas para OBJ'}).waitFor();
  assert.equal(await page.locator('header.header').count(),0,'No full app navigation');
  await page.getByRole('button',{name:path.basename(specimen.model)}).waitFor();
  await page.getByRole('button',{name:path.basename(specimen.texture)}).waitFor();
  const stats=await app.evaluate(()=>globalThis.__forgeDiagnostics());
  assert.equal(stats.profileRequests,0);assert.equal(stats.workers,0);assert.equal(stats.windows,1);
  assert.equal(await page.getByRole('heading',{name:'Pronta para texturizar.'}).count(),0,'Explicit export confirmation');
  await assert.rejects(page.evaluate(()=>window.rpforge.selectClothingTexture('C:\\Windows\\outside.ytd')),/textura sugerida/);
  await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},path.resolve(destination));
  await page.locator('.clothing-config .clothing-file').nth(2).click();
  await page.getByRole('button',{name:'Exportar para OBJ',exact:false}).click();
  await page.getByRole('heading',{name:'Pronta para texturizar.'}).waitFor();
  await page.locator('.pixel-result-preview summary').click();
  await page.waitForFunction(()=>document.querySelector('.clothing-canvas canvas')?.width>100);
  await page.waitForTimeout(200);
  assert.equal(await page.locator('main.clothing-workspace').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  assert.equal(await app.evaluate(()=>globalThis.__forgeDiagnostics().profileRequests),0);
  assert.equal(await app.evaluate(()=>globalThis.__forgeDiagnostics().workers),0);
  await page.screenshot({path:path.join(destination,`${specimen.gender}-quick.png`)});
  await app.close();app=null;
 }
 // A real dictionary with two adjacent variation filenames must not be selected
 // implicitly. Source contents are unchanged copies and remain outside the corpus.
 const input=path.join(temporary,'ambiguous');await mkdir(input);
 const s=specimens[0],model=path.join(input,path.basename(s.model)),texture=path.join(input,path.basename(s.texture));
 await copyFile(s.model,model);await copyFile(s.texture,texture);
 await copyFile(s.texture,texture.replace('_a_uni.ytd','_b_uni.ytd'));
 const env={...process.env,RPF_TEST_USER_DATA:path.join(temporary,'ambiguous-profile'),RPF_TEST_OUTPUT_ROOT:path.resolve(destination)};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:process.env.RPF_ELECTRON_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[project,'--test-mode','--obj',model],env});
 await testProAccess(app,project);
 const page=await app.firstWindow();
 await page.getByLabel('Variação encontrada na pasta').waitFor();
 assert.equal(await page.getByLabel('Variação encontrada na pasta').inputValue(),'');
 await page.getByLabel('Variação encontrada na pasta').selectOption(texture);
 await page.getByRole('button',{name:path.basename(texture)}).waitFor();
 console.log('PASS: compact YDD action, matching texture suggestions, manual ambiguity choice, real male/female export, no profile requests, no automatic conversion and worker exit.');
} finally {await app?.close();await rm(temporary,{recursive:true,force:true});await isolated.cleanup();}
