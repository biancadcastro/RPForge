// Real-asset integration check. Only native file dialogs are scripted;
// the installed development decoder, textures, IPC and UI run normally.
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
import {isolateClothingSpec,clothingTestDestination} from '../../scripts/lib/clothing-test-fixtures.mjs';
import {testProAccess} from './lib/test-pro-access.mjs';
const sourceProject=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const project=process.env.RPF_DESKTOP_PROJECT ? path.resolve(process.env.RPF_DESKTOP_PROJECT) : sourceProject;
const [specFile,destination]=process.argv.slice(2);
if(!specFile||!destination)throw Error('Informe spec JSON e pasta de resultados.');
await clothingTestDestination(destination);
const isolated=await isolateClothingSpec(specFile),specimens=isolated.specimens;
await mkdir(destination,{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'rpforge-clothing-ui-'));
const env={...process.env,RPF_TEST_USER_DATA:temporary,RPF_TEST_OUTPUT_ROOT:path.resolve(destination)};delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
 app=await _electron.launch({executablePath:process.env.RPF_ELECTRON_EXECUTABLE || createRequire(import.meta.url)('electron'),args:[project,'--test-mode'],env,timeout:25000});
 await testProAccess(app,project);
 const page=await app.firstWindow();page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('heading',{name:'Ferramentas',exact:true}).waitFor();
 await page.locator('.app-sidebar').getByRole('button',{name:/Roupas para OBJ/}).click();
 await page.getByRole('heading',{name:'Roupas para OBJ'}).waitFor();
 await assert.rejects(page.evaluate(()=>window.rpforge.exportClothingObj('high')),/Selecione a peça/);
 await assert.rejects(page.evaluate(()=>window.rpforge.selectClothingFile('outside')),/Algo deu errado. Feche e abra a ferramenta novamente./);
 assert.equal(await page.locator('main.clothing-workspace:not([hidden])').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 const choose=async (button,file)=>{
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
  if(button==='destination') await page.locator('.clothing-config .clothing-file').nth(2).click();
  else await page.getByRole('button',{name:button}).click();
 };
 for(const specimen of specimens) {
  await choose(/Selecionar peça YDD|jbib_\d{3}_u.ydd/,specimen.model);
  await choose('Selecionar textura YTD',specimen.texture);
  await choose('destination',path.resolve(destination));
  await page.getByRole('button',{name:'Exportar para OBJ',exact:false}).click();
  await page.getByRole('heading',{name:'Pronta para texturizar.'}).waitFor();
  assert.equal(await page.locator('.pixel-output li').count(),2);
  await page.locator('.pixel-result-preview summary').click();
  await page.locator('.clothing-canvas canvas').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.querySelector('.clothing-canvas canvas').width>100);
  // Give the asynchronously decoded texture an event-loop turn before capture.
  await page.waitForTimeout(300);
  const raw=await page.locator('.clothing-canvas canvas').evaluate(c=>c.toDataURL());
  const canvasImage=Buffer.from(raw.split(',')[1],'base64');
  await writeFile(path.join(destination,specimen.gender+'-canvas.png'),canvasImage);
  const changedPixels=await app.evaluate(({nativeImage},base64)=>{
    const bitmap=nativeImage.createFromBuffer(Buffer.from(base64,'base64')).toBitmap();
    let changed=0;for(let i=4;i<bitmap.length;i+=4)if(Math.abs(bitmap[i]-bitmap[0])+Math.abs(bitmap[i+1]-bitmap[1])+Math.abs(bitmap[i+2]-bitmap[2])>35)changed++;
    return changed;
  },canvasImage.toString('base64'));
  assert.ok(changedPixels>1000,'The exported garment must actually render in the canvas');
  await page.screenshot({path:path.join(destination,`${specimen.gender}-app.png`)});
  assert.deepEqual(await page.locator('.clothing-workspace [role="alert"]').allTextContents(),[]);
  assert.equal(await app.evaluate(()=>globalThis.__forgeDiagnostics().workers),0);
  await assert.rejects(page.evaluate(()=>window.rpforge.openFolder('C:\\Windows')),/Nenhum resultado/);
  await page.getByRole('button',{name:'Exportar outra peça',exact:true}).click();
 }
 assert.deepEqual(errors,[]);
 assert.ok((await readdir(destination)).some(name=>name.includes('mp_m_')));
 assert.ok((await readdir(destination)).some(name=>name.includes('mp_f_')));
 const beforeCancel=await readdir(destination);
 const cancelled=await page.evaluate(async()=>{
   const buttons=document.querySelectorAll('main.clothing-workspace:not([hidden]) .clothing-file');
   const selection={model:buttons[0].title,texture:buttons[1].title,destination:buttons[2].title};
   const pending=window.rpforge.exportClothingObj('high',selection).then(()=>null,e=>e.message);
   await window.rpforge.cancelClothingExport();
   return await pending;
 });
 assert.match(cancelled,/cancelad/i,'Cancellation must stop the native decoder and settle the request');
 assert.deepEqual(await readdir(destination),beforeCancel,'Cancelled operation must not publish files or leave staging');
 assert.equal(await app.evaluate(()=>globalThis.__forgeDiagnostics().workers),0);
 await page.setViewportSize({width:1000,height:720});
 assert.equal(await page.locator('main.clothing-workspace:not([hidden])').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 console.log('PASS: real male/female YDD/YTD via UI and decoder, visible OBJ viewer, IPC permissions, cancellation without partial output, no overflow and worker cleanup.');
} finally {await app?.close();await rm(temporary,{recursive:true,force:true});await isolated.cleanup();}
