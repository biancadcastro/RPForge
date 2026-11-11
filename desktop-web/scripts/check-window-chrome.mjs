import assert from 'node:assert/strict';import {mkdtemp,rm,mkdir} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import {_electron} from 'playwright';import {fileURLToPath} from 'node:url';
const project=process.env.RPF_DESKTOP_PROJECT||path.resolve(fileURLToPath(new URL('../',import.meta.url))),temporary=await mkdtemp(path.join(os.tmpdir(),'rpforge-window-chrome-')),artifacts=path.resolve(fileURLToPath(new URL('../../output/window-chrome/',import.meta.url)));
await mkdir(artifacts,{recursive:true});let app;
try{
 const env={...process.env,RPF_TEST_USER_DATA:temporary};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:process.env.RPF_ELECTRON_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[project,'--test-mode'],env});
 const page=await app.firstWindow();page.setDefaultTimeout(10000);await page.getByRole('heading',{name:'Ferramentas',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.window-controls button')?.disabled);
 await assert.rejects(page.evaluate(()=>window.rpforge.windowControl('outside')),/Algo deu errado. Feche e abra a ferramenta novamente./);
 const bounds=await page.locator('.window-chrome').boundingBox();assert.equal(bounds.height,40);
 for(const button of await page.locator('.window-controls button').all()){const offset=await button.evaluate(el=>{const b=el.getBoundingClientRect(),s=el.querySelector('svg').getBoundingClientRect();return Math.abs(b.x+b.width/2-s.x-s.width/2)+Math.abs(b.y+b.height/2-s.y-s.height/2);});assert.ok(offset<1,'Window icons must be centered');}
 await page.screenshot({path:path.join(artifacts,'desktop.png')});
 await page.getByRole('button',{name:'Maximizar janela',exact:true}).click();await page.getByRole('button',{name:'Restaurar janela',exact:true}).waitFor();assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized()),true);
 await page.getByRole('button',{name:'Restaurar janela',exact:true}).click();await page.getByRole('button',{name:'Maximizar janela',exact:true}).waitFor();
 await page.getByRole('button',{name:'Minimizar janela',exact:true}).click();assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized()),true);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].restore());await page.setViewportSize({width:1000,height:680});await page.screenshot({path:path.join(artifacts,'compact.png')});
 assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth>innerWidth),false);
 const closed=app.waitForEvent('close');await page.getByRole('button',{name:'Fechar janela',exact:true}).click();await closed;app=null;
 console.log('PASS: custom window controls maximize, restore, minimize and close the native window; invalid actions refused, icons centered and compact layout preserved.');
}finally{await app?.close();await rm(temporary,{recursive:true,force:true});}
