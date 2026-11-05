import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir,rm,copyFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {_electron} from 'playwright';
import {clothingTestDestination} from '../../scripts/lib/clothing-test-fixtures.mjs';
const [model,destination]=process.argv.slice(2);
const project=process.env.RPF_DESKTOP_PROJECT||path.resolve(fileURLToPath(new URL('../',import.meta.url)));
await clothingTestDestination(destination);const before=await readdir(destination),temporary=await mkdtemp(path.join(os.tmpdir(),'rpforge-mixed-neon-'));
const input=path.join(temporary,path.basename(model));await copyFile(model,input);
const env={...process.env,RPF_TEST_USER_DATA:path.join(temporary,'profile'),RPF_TEST_OUTPUT_ROOT:path.resolve(destination)};delete env.ELECTRON_RUN_AS_NODE;
let app;
try{
 app=await _electron.launch({executablePath:process.env.RPF_ELECTRON_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[project,'--test-mode','--neon',input],env});
 const page=await app.firstWindow();await page.getByRole('heading',{name:'Converter roupa para Neon'}).waitFor();
 assert.equal(await page.getByRole('checkbox').count(),0);
 await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},path.resolve(destination));
 await page.locator('[aria-label="Configuração Neon"] .clothing-file').nth(2).click();
 await page.getByRole('button',{name:'Converter para Neon',exact:false}).click();
 await page.getByRole('alert').filter({hasText:'Separar pele'}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Versão Neon criada.'}).count(),0);
 assert.deepEqual(await readdir(destination),before,'Mixed garment must leave no partial files');
 assert.equal(await app.evaluate(()=>globalThis.__forgeDiagnostics().workers),0);
 console.log('PASS: real mixed garment refused in independent Neon UI, skin-separation guidance, no confirmation checkbox and no output.');
}finally{await app?.close();await rm(temporary,{recursive:true,force:true});}
