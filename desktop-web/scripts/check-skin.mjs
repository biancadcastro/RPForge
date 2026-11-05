import assert from 'node:assert/strict';import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {_electron} from 'playwright';
import {isolateClothingSpec,clothingTestDestination} from '../../scripts/lib/clothing-test-fixtures.mjs';
import {testProAccess} from './lib/test-pro-access.mjs';
const [spec,artifacts]=process.argv.slice(2);await clothingTestDestination(artifacts);const isolated=await isolateClothingSpec(spec),temporary=await mkdtemp(path.join(os.tmpdir(),'rpforge-skin-ui-'));
const project=process.env.RPF_DESKTOP_PROJECT||path.resolve(fileURLToPath(new URL('../',import.meta.url)));let app;
try{
 for(const s of [...isolated.specimens].sort((a,b)=>a.gender==='female'?-1:1)){
  const folder=path.dirname(s.model),before=await readdir(folder),env={...process.env,RPF_TEST_USER_DATA:path.join(temporary,s.gender)};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:process.env.RPF_ELECTRON_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[project,'--test-mode','--skin-folder',folder],env});
  await testProAccess(app,project);
  const page=await app.firstWindow();page.setDefaultTimeout(25000);
  const rendererErrors=[];page.on('pageerror',error=>rendererErrors.push(error.message));
  await page.setViewportSize({width:820,height:720});
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;globalThis.__skinContexts=0;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl'||type==='webgl2')globalThis.__skinContexts++;return original.call(this,type,...args);};});
  await page.locator('.desktop.quick').waitFor();await page.getByRole('heading',{name:'Separar pele',exact:true}).waitFor();assert.equal(await page.locator('header.header').count(),0);
  await page.getByRole('button',{name:path.basename(s.model)}).waitFor();
  await page.evaluate(()=>{globalThis.__sawSkinProgress=false;new MutationObserver(()=>{if(document.querySelector('.skin-progress-dialog [role="progressbar"]'))globalThis.__sawSkinProgress=true;}).observe(document.body,{childList:true,subtree:true});});
  assert.equal(await page.locator('[aria-label="Configuração da separação"] .clothing-file').nth(2).getAttribute('title'),folder);
  const progressCapture=page.getByRole('dialog',{name:'Analisando a peça'}).waitFor({timeout:1500}).then(()=>page.screenshot({path:path.join(artifacts,`${s.gender}-progress.png`)})).catch(()=>{});
  await page.getByRole('button',{name:'Analisar peça',exact:false}).click();await progressCapture;
  await page.getByRole('region',{name:'Revisão da separação',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>globalThis.__sawSkinProgress),true,'Native analysis must show the progress dialog');
  assert.deepEqual(await readdir(folder),before,'Analysis cannot write into the input directory, even for temporary copies');
  const chooseLod=async value=>page.getByRole('button',{name:{high:'Alta',medium:'Média',low:'Baixa',verylow:'Muito baixa'}[value],exact:true}).click();
  const canvas=page.locator('.skin-review canvas');await canvas.waitFor();await page.waitForFunction(()=>document.querySelector('.skin-review canvas')?.width>100);
  await page.getByRole('button',{name:'Enquadrar',exact:true}).click();
  const canvasBox=await canvas.boundingBox();assert.ok(canvasBox.height>=300,'Editor must have a usable viewport');
  const button=page.getByRole('button',{name:'Separar arquivos',exact:true});
  assert.match(await button.evaluate(element=>getComputedStyle(element).fontFamily),/Pixelify/,'The editor primary action must use the website control font');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.atelier-output-preview img')).filter(img=>img.complete&&img.naturalWidth>0).length===2);
  assert.equal(await page.locator('.atelier-source').count(),1);assert.equal(await page.locator('.atelier-inspector').count(),1);
  if(s.gender==='female'){
   await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Separar arquivos'))?.disabled);
   await assert.rejects(page.evaluate(input=>window.rpforge.separateClothingSkin(input,'forged',{}),{model:s.model,texture:s.texture,destination:folder}),/Refaça a análise/);
   const originalSkin=await page.locator('.skin-counts tbody tr').first().locator('td').nth(0).innerText();assert.equal(originalSkin,'746');
   const originalThumbnails=await page.locator('.atelier-output-preview img').evaluateAll(imgs=>imgs.map(img=>img.src));
   await page.getByRole('button',{name:'Selecionar face',exact:true}).click();
   await page.screenshot({path:path.join(artifacts,'before-mark.png')});
   const box=await canvas.boundingBox(),png=await page.screenshot(),point=await app.evaluate(({nativeImage},{base64,box})=>{
    const image=nativeImage.createFromBuffer(Buffer.from(base64,'base64')),size=image.getSize(),pixels=image.toBitmap();let best=null;
    const blue=(x,y)=>{const i=(y*size.width+x)*4;return pixels[i]>pixels[i+2]+35&&pixels[i+1]>pixels[i+2]+8;};
    for(let y=Math.ceil(box.y)+8;y<Math.min(size.height-8,box.y+box.height-8);y++)for(let x=Math.ceil(box.x)+8;x<Math.min(size.width-8,box.x+box.width-8);x++){if(blue(x,y)&&[-5,0,5].every(d=>[-5,0,5].every(e=>blue(x+d,y+e)))){const distance=(x-box.x-box.width/2)**2+(y-box.y-box.height/2)**2;if(!best||distance<best.distance)best={x,y,distance};}}
    return {point:best,size};
   },{base64:png.toString('base64'),box});assert.ok(point.point,'Cloth must render in blue');
   const contextsBefore=await page.evaluate(()=>globalThis.__skinContexts||0);
   await page.mouse.click(point.point.x,point.point.y);
   await page.waitForFunction(()=>document.querySelector('.selection-count')?.getAttribute('data-count')==='1');
   assert.equal(await page.locator('.skin-counts tbody tr').first().locator('td').nth(0).innerText(),'746','Selecting a face must not classify it');
   assert.deepEqual(await page.locator('.atelier-output-preview img').evaluateAll(imgs=>imgs.map(img=>img.src)),originalThumbnails,'Selection alone must not change the output thumbnails');
   await page.getByRole('button',{name:'Marcar pele',exact:true}).click();
   page.once('dialog',dialog=>dialog.dismiss());
   await page.getByRole('button',{name:'Trocar peça',exact:true}).click();
   assert.equal(await page.getByRole('region',{name:'Revisão da separação',exact:true}).isVisible(),true,'Cancelling discard must preserve the edited review');
   await page.waitForFunction(()=>document.querySelector('.skin-counts tbody tr td')?.textContent==='747').catch(async e=>{console.log('counts',await page.locator('.skin-counts').innerText());throw e;});
   await page.getByRole('button',{name:'Desfazer',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.skin-counts tbody tr td')?.textContent==='746');
   await page.waitForFunction(original=>Array.from(document.querySelectorAll('.atelier-output-preview img')).every((img,i)=>img.src===original[i]),originalThumbnails);
   await page.getByRole('button',{name:'Limpar seleção',exact:true}).click();
   assert.equal(await page.evaluate(()=>globalThis.__skinContexts||0),contextsBefore,'Editing must reuse the same WebGL context');
   await page.getByRole('button',{name:'Malha',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Malha',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Malha',exact:true}).click();
   await page.getByRole('button',{name:'Costas',exact:true}).click();await page.getByRole('button',{name:'Frente',exact:true}).click();
   const selectedCount=async()=>Number(await page.locator('.selection-count').getAttribute('data-count'));
   async function selectBox(){const b=await canvas.boundingBox();await page.mouse.move(b.x+2,b.y+2);await page.mouse.down();await page.mouse.move(b.x+b.width-2,b.y+b.height-2,{steps:8});await page.mouse.up();}
   await canvas.focus();await page.keyboard.press('b');assert.equal(await page.getByRole('button',{name:'Selecionar área',exact:true}).getAttribute('aria-pressed'),'true');await selectBox();const visible=await selectedCount();assert.ok(visible>10&&visible<1212,'Visible selection must exclude occluded faces');
   await page.getByRole('switch',{name:'Somente faces visíveis',exact:true}).uncheck();await selectBox();assert.equal(await selectedCount(),1212,'Through box selection must cover front and back of the complete mesh');
   await page.getByRole('button',{name:'Ocultar roupa',exact:true}).click();assert.equal(await selectedCount(),0);await selectBox();assert.equal(await selectedCount(),746,'Hidden cloth must not be selectable, even through the model');await page.getByRole('button',{name:'Mostrar roupa',exact:true}).click();await selectBox();assert.equal(await selectedCount(),1212);
   await page.keyboard.down('Shift');const blank=await canvas.boundingBox();await page.mouse.move(blank.x+2,blank.y+2);await page.mouse.down();await page.mouse.move(blank.x+5,blank.y+5);await page.mouse.up();await page.keyboard.up('Shift');assert.equal(await selectedCount(),1212,'Shift plus an empty area must preserve the previous selection');
   await page.screenshot({path:path.join(artifacts,'area-selection.png')});
   await page.keyboard.down('Alt');await selectBox();await page.keyboard.up('Alt');assert.equal(await selectedCount(),0,'Alt must subtract from the current selection');
   await page.getByRole('switch',{name:'Somente faces visíveis',exact:true}).check();await page.getByRole('button',{name:'Pincel',exact:true}).click();await page.getByLabel('Raio do pincel',{exact:true}).focus();await page.keyboard.press('End');
   const b=await canvas.boundingBox();async function stroke(){await page.mouse.move(b.x+b.width*.35,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.65,b.y+b.height*.5,{steps:12});await page.mouse.up();}
   await stroke();assert.ok(await selectedCount()>1,'A brush stroke must select multiple faces');
   await page.keyboard.press('[');assert.equal(await page.getByLabel('Raio do pincel',{exact:true}).inputValue(),'116');await page.keyboard.press(']');assert.equal(await page.getByLabel('Raio do pincel',{exact:true}).inputValue(),'120');
   assert.equal(await page.locator('.skin-counts tbody tr').first().locator('td').nth(0).innerText(),'746','Brush selection must not change classification before assignment');
   await page.screenshot({path:path.join(artifacts,'brush-selection.png')});await page.getByRole('button',{name:'Marcar roupa',exact:true}).click();await page.getByRole('button',{name:'Desfazer',exact:true}).click();assert.equal(await page.locator('.skin-counts tbody tr').first().locator('td').nth(0).innerText(),'746');
   await page.keyboard.down('Alt');await stroke();await page.keyboard.up('Alt');assert.equal(await selectedCount(),0,'Alt brush must remove faces');
   await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await selectedCount(),0,'Escape must cancel a brush gesture and restore the preceding selection');
   await page.getByRole('button',{name:'Selecionar área',exact:true}).click();await page.getByRole('switch',{name:'Somente faces visíveis',exact:true}).uncheck();await selectBox();await chooseLod('medium');assert.equal(await selectedCount(),0,'Changing LOD must clear the current selection');await chooseLod('high');await page.getByRole('switch',{name:'Somente faces visíveis',exact:true}).check();
   assert.equal(await page.evaluate(()=>globalThis.__skinContexts||0),contextsBefore,'Wireframe and camera controls must reuse the context');
   await page.screenshot({path:path.join(artifacts,'female-review.png')});
   await button.click();await page.getByRole('heading',{name:'Separação concluída'}).waitFor();
   assert.equal(await page.locator('.pixel-result img').count(),0);
   assert.equal(await page.locator('.pixel-output').count(),2);
   assert.equal(await page.locator('.pixel-output li').count(),4);
   assert.match(await page.locator('.pixel-result-heading h1').evaluate(e=>getComputedStyle(e).fontFamily),/Pixelify/);
   assert.match(await page.getByRole('button',{name:'Abrir pasta',exact:true}).evaluate(e=>getComputedStyle(e).fontFamily),/Pixelify/);
   assert.equal(await page.locator('.pixel-result-heading svg[shape-rendering="crispEdges"]').count(),1);
   const cards=await page.locator('.pixel-output').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));assert.equal(cards[0].y,cards[1].y);assert.ok(Math.abs(cards[0].width-cards[1].width)<1);
   const heading=await page.locator('.pixel-result-heading').boundingBox();assert.equal(cards[0].x,heading.x);
   const bounds=await page.locator('.pixel-result').boundingBox();assert.ok(bounds.width<=820&&bounds.height<=680,'Result must fit the quick action window');
   const after=await readdir(folder);assert.equal(after.length-before.length,2);assert.equal(after.filter(f=>f.endsWith('.ydd')).length,1);
   for(const role of ['Roupa','Pele']){const files=await readdir(path.join(folder,role));assert.equal(files.length,2);assert.equal(files.filter(f=>f.endsWith('.ydd')).length,1);assert.equal(files.filter(f=>f.endsWith('.ytd')).length,1);}
   await page.screenshot({path:path.join(artifacts,'female-result.png')});await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(artifacts,'female-result-large.png')});
  }else{
   assert.ok(await button.isDisabled(),'Ambiguous LODs require manual review');
   await chooseLod('medium');await page.getByRole('button',{name:'Enquadrar',exact:true}).click();await page.screenshot({path:path.join(artifacts,'male-ambiguous-review.png')});
   await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'Enquadrar',exact:true}).click();await chooseLod('low');await page.screenshot({path:path.join(artifacts,'male-editor-large.png')});
   assert.deepEqual(await readdir(folder),before,'Ambiguous analysis must not publish files');
   const fullWindow=app.waitForEvent('window');await page.evaluate(()=>window.rpforge.openFull()).catch(()=>{});const full=await fullWindow;full.setDefaultTimeout(25000);await full.setViewportSize({width:1440,height:900});
   await full.getByRole('button',{name:path.basename(s.model),exact:true}).waitFor();await full.getByRole('button',{name:'Analisar peça',exact:false}).click();await full.locator('.desktop.atelier-shell').waitFor();await full.getByRole('region',{name:'Revisão da separação',exact:true}).waitFor();assert.equal(await full.locator('header.header').count(),0,'Full app must use the same editor shell, without a second navigation sidebar');await full.waitForFunction(()=>Array.from(document.querySelectorAll('.atelier-output-preview img')).every(img=>img.complete&&img.naturalWidth>0));await full.screenshot({path:path.join(artifacts,'male-full-editor.png')});
   assert.deepEqual(await readdir(folder),before,'Opening the full editor must remain read-only');
   await full.getByRole('button',{name:'Abrir app completo',exact:true}).click();
   await full.getByRole('heading',{name:'Ferramentas',exact:false}).waitFor();
   assert.equal(full.isClosed(),false,'Home navigation from the full editor must keep its own window alive');
  }
  const stats=await app.evaluate(()=>globalThis.__forgeDiagnostics());assert.equal(stats.workers,0);assert.equal(stats.profileRequests,0);
  assert.deepEqual(rendererErrors,[],'Selection and assignment must not throw renderer errors');
  await app.close();app=null;
 }
 console.log('PASS: real copied female split, read-only analysis, 3D face marking/undo without new WebGL contexts, male ambiguity blocked, distinct outputs, no account requests and worker cleanup.');
}catch(error){if(app){const p=await app.firstWindow();console.log(await p.locator('body').innerText());await p.screenshot({path:path.join(artifacts,'failure.png')});}throw error;}finally{await app?.close();await rm(temporary,{recursive:true,force:true});await isolated.cleanup();}
