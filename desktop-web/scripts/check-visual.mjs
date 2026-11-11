import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {_electron} from 'playwright';
import {installTestAuth} from './lib/test-auth-api.mjs';

const project=process.env.RPF_DESKTOP_PROJECT||path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const destination=path.resolve(process.argv[2]||path.join(root,'output/visual-website/gallery'));
assert.ok(destination.startsWith(path.join(root,'output')+path.sep),'Visual captures stay inside project output');
await mkdir(path.join(destination,'prints'),{recursive:true});
const temporary=await mkdtemp(path.join(os.tmpdir(),'rpforge-visual-')),fixtures=path.join(temporary,'Exemplos');
execFileSync(process.execPath,[path.join(root,'scripts/Create-DesktopFixtures.mjs'),fixtures],{windowsHide:true});
const axe=await readFile(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8');
const manifest=[],errors=[],violations=[];let application,page;
async function start(args=[]){
 const env={...process.env,RPF_TEST_USER_DATA:path.join(temporary,'profile-'+manifest.length)};delete env.ELECTRON_RUN_AS_NODE;
 application=await _electron.launch({executablePath:process.env.RPF_ELECTRON_EXECUTABLE||createRequire(import.meta.url)('electron'),args:[project,'--test-mode',...args],env});
 page=await application.firstWindow();page.setDefaultTimeout(18000);page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:args.length?820:1440,height:args.length?720:900});
 await page.waitForFunction(()=>document.querySelector('main'));
 await page.evaluate(source=>{(0,eval)(source);},axe);
}
async function stop(){await application?.close();application=null;}
async function snap(id,title,group='Ferramentas',note='Dados de demonstração'){
 await page.evaluate(()=>document.fonts.ready);
 await page.mouse.move(5,5);
 await page.waitForTimeout(180); // Let the website's 150 ms hover transition settle before comparing its palette.
 const metrics=await page.evaluate(()=>{
  const visible=e=>!!e.getClientRects().length;
  const heading=Array.from(document.querySelectorAll('main h1')).find(visible);
  const primary=Array.from(document.querySelectorAll('.button.primary')).find(e=>visible(e)&&!e.disabled);
  const main=Array.from(document.querySelectorAll('main')).find(visible);
  return {headingFont:heading&&getComputedStyle(heading).fontFamily,headingSize:heading&&parseFloat(getComputedStyle(heading).fontSize),smallDisplay:Array.from(document.querySelectorAll("body *")).filter(e=>visible(e)&&e.childElementCount===0&&e.textContent.trim()&&/Pixelify/.test(getComputedStyle(e).fontFamily)&&parseFloat(getComputedStyle(e).fontSize)<28).map(e=>e.textContent.trim().slice(0,30)),bodyFont:getComputedStyle(document.body).fontFamily,
   background:getComputedStyle(document.body).backgroundColor,primary:primary&&{font:getComputedStyle(primary).fontFamily,color:getComputedStyle(primary).color,background:getComputedStyle(primary).backgroundColor},
   fileFont:document.querySelector('.pixel-output li p')&&getComputedStyle(document.querySelector('.pixel-output li p')).fontFamily,
   overflow:main?main.scrollWidth>main.clientWidth+1:false,viewport:{width:innerWidth,height:innerHeight}};
 });
 assert.match(metrics.bodyFont,/Atkinson/,id+' body font');
 if(metrics.headingFont&&metrics.headingSize>=28)assert.match(metrics.headingFont,/Pixelify/,id+' heading font');
 assert.deepEqual(metrics.smallDisplay,[],id+' Pixelify only on large titles');
 if(metrics.fileFont)assert.match(metrics.fileFont,/Atkinson/,id+' file list font');
 if(metrics.primary){assert.match(metrics.primary.font,/Atkinson/,id+' control font');assert.doesNotMatch(metrics.primary.font,/Pixelify/,id+' controls never use the display font');assert.equal(metrics.primary.color,'rgb(32, 21, 13)',id+' primary contrast');assert.equal(metrics.primary.background,'rgb(255, 123, 37)',id+' website primary color');}
 assert.equal(metrics.overflow,false,id+' horizontal overflow');
 const accessibility=await page.evaluate(async()=>{
  const result=await globalThis.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
  return result.violations.map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)}));
 });
 if(accessibility.length)violations.push({id,violations:accessibility});
 await page.screenshot({path:path.join(destination,'prints',id+'.png')});
 manifest.push({id,title,group,note,file:'prints/'+id+'.png',metrics,accessibility});
 console.log('PASS '+id+': '+title);
}
async function navigate(name){await page.locator('.app-sidebar').getByRole('button',{name,exact:true}).click();}
async function picker(folder){await application.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},folder);}
async function replaceHandler(channel,value){await application.evaluate(({ipcMain},{channel,value})=>{if(!process.argv.includes('--test-mode'))throw Error('Visual fixture requires test mode');ipcMain.removeHandler(channel);ipcMain.handle(channel,()=>value);},{channel,value});}
async function heldHandler(channel){await application.evaluate(({ipcMain},channel)=>{if(!process.argv.includes('--test-mode'))throw Error('Visual fixture requires test mode');ipcMain.removeHandler(channel);ipcMain.handle(channel,event=>new Promise((resolve,reject)=>{globalThis.__visualComplete=resolve;globalThis.__visualFail=()=>reject(Error('Não foi possível gravar no destino. Escolha outra pasta e tente novamente.'));event.sender.send('forge:progress',{phase:'write',label:'Conferindo os arquivos antes de concluir',current:2,total:4});}));},channel);}

try{
 await start();await page.getByRole('heading',{name:'Ferramentas',exact:true}).waitFor();await snap('01-inicio','Início');
 await navigate('Converter RPFs');await snap('02-rpf-vazio','Converter RPFs · início');
 await navigate('Gerar YTYP');await snap('03-ytyp-vazio','Gerar YTYP · início');
 await picker(path.join(fixtures,'props'));await page.getByRole('button',{name:'Selecionar pasta',exact:true}).click();await snap('04-ytyp-pronto','Gerar YTYP · pasta selecionada');
 await page.locator('main').getByRole('button',{name:'Gerar YTYP',exact:false}).click();await page.getByRole('heading',{name:'YTYP gerado',exact:true}).waitFor();await snap('05-ytyp-resultado','Gerar YTYP · resultado');
 for(const [name,id,title]of [['Roupas para OBJ','06-obj-vazio','Exportar OBJ · configuração'],['Roupas para Neon','07-neon-vazio','Converter Neon · configuração'],['Separar pele','08-pele-vazio','Separar pele · configuração']]){await navigate(name);await snap(id,title);}
 await navigate('Como usar');await snap('09-ajuda','Como usar e versão');
 await navigate('Converter RPFs');await picker(fixtures);await page.getByRole('button',{name:'Selecionar pasta',exact:true}).click();await page.getByLabel('Pasta de saída dlc.rpf',{exact:true}).waitFor();await snap('10-rpf-configuracao','Converter RPFs · configurar');
 await page.getByRole('button',{name:'Revisar conversão',exact:false}).click();await page.getByRole('heading',{name:'Tudo certo para converter?'}).waitFor();await snap('11-rpf-revisao','Converter RPFs · revisar');
 await page.getByRole('button',{name:'Converter agora',exact:true}).click();await page.getByRole('heading',{name:'Seus recursos estão prontos',exact:true}).waitFor();await snap('12-rpf-resultado','Converter RPFs · resultado');
 await page.getByRole('button',{name:'Nova operação',exact:true}).click();await heldHandler('forge:operation');await picker(fixtures);await page.getByRole('button',{name:'Selecionar pasta',exact:true}).click({noWaitAfter:true});await page.getByRole('status').filter({hasText:'Conferindo os arquivos antes de concluir'}).waitFor();await snap('13-rpf-progresso','Converter RPFs · processamento','Estados');
 await application.evaluate(()=>globalThis.__visualFail());await page.getByRole('alert').filter({hasText:'Não foi possível concluir'}).waitFor();await snap('14-rpf-erro','Converter RPFs · falha recuperável','Estados');
 await installTestAuth(application,{mfa:true});await page.locator('.account-button').click();await page.getByLabel('E-mail',{exact:true}).waitFor();await snap('15-conta-entrar','Conta · entrar','Conta');
 await page.getByLabel('E-mail',{exact:true}).fill('exemplo@rpforge.dev');await page.getByLabel('Senha',{exact:true}).fill('fixture-wrong');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.locator('.account-form-error').waitFor();await snap('16-conta-erro','Conta · credenciais inválidas','Conta');
 await page.getByRole('button',{name:'Continuar com Discord',exact:true}).click();await page.getByText('Aguardando autorização no navegador',{exact:true}).waitFor();await snap('17-conta-navegador','Conta · autorização no navegador','Conta');
 await page.getByRole('button',{name:'Cancelar conexão',exact:true}).click();await page.getByLabel('Senha',{exact:true}).fill('fixture-correct');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByLabel('Código de verificação',{exact:true}).waitFor();await snap('18-conta-mfa','Conta · verificação em duas etapas','Conta');
 await page.getByLabel('Código de verificação',{exact:true}).fill('000000');await page.getByRole('button',{name:'Confirmar acesso',exact:true}).click();await page.locator('.account-form-error').waitFor();await snap('19-conta-mfa-erro','Conta · código incorreto','Conta');
 await page.getByLabel('Código de verificação',{exact:true}).fill('123456');await page.getByRole('button',{name:'Confirmar acesso',exact:true}).click();await page.getByText('Conta conectada',{exact:true}).waitFor();await snap('20-conta-conectada','Conta · conectada','Conta');
 await page.getByRole('button',{name:'Desconectar este computador',exact:true}).click();await page.getByLabel('E-mail',{exact:true}).waitFor();await navigate('Início');
 await replaceHandler('forge:auth-options',null);await application.evaluate(({ipcMain})=>{ipcMain.removeHandler('forge:auth-options');ipcMain.handle('forge:auth-options',()=>{throw Error('Não foi possível carregar as opções. Confira a conexão e tente novamente.');});});await page.locator('.account-button').click();await page.getByRole('button',{name:'Tentar carregar opções novamente',exact:true}).waitFor();await snap('21-conta-indisponivel','Conta · conexão indisponível','Conta');
 await navigate('Início');
 const model=path.join(fixtures,'camisa_001.ydd'),texture=path.join(fixtures,'camisa_001.ytd');
 await application.evaluate(({ipcMain},{model,texture,fixtures})=>{ipcMain.removeHandler('forge:clothing-select');ipcMain.handle('forge:clothing-select',(_event,kind)=>kind==='model'?model:kind==='texture'?texture:fixtures);},{model,texture,fixtures});
 for(const [name,prefix,channel,action,dialogTitle]of [['Roupas para OBJ','22-obj','forge:clothing-export','Exportar para OBJ','Exportando para OBJ'],['Roupas para Neon','25-neon','forge:clothing-neon','Converter para Neon','Convertendo roupa para Neon'],['Separar pele','28-pele','forge:skin-inspect','Analisar peça','Analisando a peça']]){
  await navigate(name);const config=page.locator('main:not([hidden]) .clothing-config');await config.locator('.clothing-file').nth(0).click();await config.locator('.clothing-file').nth(1).click();await config.locator('.clothing-file').nth(2).click();await snap(prefix+'-configurado',name+' · arquivos selecionados','Ferramentas');
  await heldHandler(channel);await page.getByRole('button',{name:action,exact:false}).click({noWaitAfter:true});await page.getByRole('dialog',{name:dialogTitle,exact:true}).waitFor();await snap(prefix+'-progresso',name+' · processamento','Estados');
  await application.evaluate(()=>globalThis.__visualFail());await page.getByRole('dialog',{name:dialogTitle,exact:true}).waitFor({state:'hidden'});await page.locator('main:not([hidden]) [role=alert]').waitFor();await snap(prefix+'-erro',name+' · falha recuperável','Estados');
 }
 await stop();
 for(const [args,id,title]of [[[fixtures],'31-rpf-compacto','Converter RPFs · ação rápida'],[['--ytyp',path.join(fixtures,'props')],'32-ytyp-compacto','YTYP · ação rápida']]){
  await start(args);await page.getByText('Carregando a conexão com o aplicativo…').waitFor({state:'hidden'});if(id.startsWith('31'))await page.getByRole('heading',{name:'Confira a saída',exact:true}).waitFor();else await page.getByRole('heading',{name:'YTYP gerado',exact:true}).waitFor();await snap(id,title,'Ações rápidas');await stop();
 }
 assert.deepEqual(errors,[],'No renderer errors in captured states');
 await writeFile(path.join(destination,'manifest.json'),JSON.stringify({reference:'https://rpforge.dev',capturedAt:new Date().toISOString(),screens:manifest,violations},null,2));
 assert.deepEqual(violations,[],'Automated accessibility checks');
 console.log('PASS: '+manifest.length+' visual states match website typography, primary palette and viewport bounds.');
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(destination,'failure.png')});throw error;}
finally{await stop();await rm(temporary,{recursive:true,force:true});}
