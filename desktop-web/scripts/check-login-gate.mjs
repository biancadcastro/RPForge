import assert from 'node:assert/strict';
import {_electron} from 'playwright';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {installTestAuth} from './lib/test-auth-api.mjs';
const project=process.env.RPF_DESKTOP_PROJECT||path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const temporary=await mkdtemp(path.join(os.tmpdir(),'rpforge-auth-flows-')),fixture=path.join(temporary,'files');
execFileSync(process.execPath,[fileURLToPath(new URL('../../scripts/Create-DesktopFixtures.mjs',import.meta.url)),fixture]);
await writeFile(path.join(fixture,'piece.ydd'),'synthetic-not-decoded');let app;
try{for(const kind of ['full','rpf','ytyp','obj','neon','skin']){
 const folder=kind==='ytyp'?path.join(fixture,'props'):fixture;
 const args=kind==='full'?[]:kind==='rpf'?[folder]:['--'+kind,kind==='ytyp'?folder:path.join(folder,'piece.ydd')];
 const env={...process.env,RPF_TEST_USER_DATA:path.join(temporary,kind),RPF_TEST_SIGNED_OUT:'1'};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:process.env.RPF_ELECTRON_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[project,'--test-mode',...args],env});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 if(['full','rpf','ytyp'].includes(kind)){
  if(kind==='full'){await page.getByRole('heading',{name:'Ferramentas',exact:true}).waitFor();assert.equal(await page.locator('.app-sidebar').count(),1);}
  if(kind==='rpf'){await page.getByRole('button',{name:'Converter agora',exact:true}).waitFor();await page.getByRole('button',{name:'Converter agora',exact:true}).click();await page.getByRole('heading',{name:'Seus recursos estão prontos',exact:true}).waitFor();}
  if(kind==='ytyp')await page.getByRole('heading',{name:'YTYP gerado',exact:true}).waitFor();
  assert.equal(await page.locator('.login-shell').count(),0);
  console.log('PASS Free '+kind+': works signed out, without native API authorization');
 }else{
  await installTestAuth(app);
  await page.getByLabel('E-mail',{exact:true}).waitFor();
  await page.getByLabel('E-mail',{exact:true}).fill('fixture@example.invalid');await page.getByLabel('Senha',{exact:true}).fill('wrong');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('alert').filter({hasText:'Confira o e-mail'}).first().waitFor();
  assert.equal(await page.locator('.login-shell').count(),1);
  await page.getByLabel('Senha',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  const heading={obj:'Exportar roupa para OBJ',neon:'Converter roupa para Neon',skin:'Separar pele'}[kind];
  await page.getByRole('heading',{name:heading,exact:true}).waitFor();
  await page.getByRole('button',{name:kind==='obj'?'Exportar para OBJ':kind==='neon'?'Converter para Neon':'Analisar peça',exact:false}).click();
  await page.getByRole('alert').filter({hasText:/Pro/}).first().waitFor();
  assert.equal(await app.evaluate(()=>globalThis.__forgeDiagnostics().workers),0);
  console.log('PASS Pro '+kind+': native login resumes requested selection; Free account cannot process paid assets');
 }
 await app.close();app=null;
}console.log('PASS offline Free and native paid authentication boundaries');}finally{await app?.close();await rm(temporary,{recursive:true,force:true});}
