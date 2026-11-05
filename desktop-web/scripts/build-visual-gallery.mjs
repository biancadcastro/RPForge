import {readFile,writeFile,copyFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import path from 'node:path';

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const folder=path.resolve(process.argv[2]||path.join(root,'output/visual-website/gallery'));
if(!folder.startsWith(path.join(root,'output')+path.sep))throw Error('Galeria deve ficar dentro de output/.');
const manifest=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8'));
const native=[
 ['skin/male-full-editor.png','33-editor-pele','Separar pele · editor completo','Editor 3D'],
 ['skin/male-ambiguous-review.png','34-editor-incertas','Separar pele · revisão das faces incertas','Editor 3D'],
 ['skin/female-review.png','35-editor-revisado','Separar pele · revisão concluída','Editor 3D'],
 ['skin/female-result-large.png','36-pele-resultado','Separar pele · roupa e pele salvas','Resultados reais'],
 ['skin/female-result.png','37-pele-compacto','Separar pele · resultado compacto','Ações rápidas'],
 ['obj/female-app.png','38-obj-resultado','Exportar OBJ · resultado e prévia 3D','Resultados reais'],
 ['obj/male-app.png','39-obj-masculino','Exportar OBJ · peça masculina','Resultados reais'],
 ['neon/female-neon.png','40-neon-resultado','Neon · resultado da conversão','Resultados reais'],
 ['neon/male-neon.png','41-neon-masculino','Neon · peça masculina','Resultados reais'],
 ['skin/female-progress.png','42-pele-progresso-real','Separar pele · análise nativa','Estados'],
];
for(const [source,id,title,group]of native){
 const file=path.join(root,'output/visual-website',source);if(!await stat(file).catch(()=>null))continue;
 const bytes=await readFile(file),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 await copyFile(file,path.join(folder,'prints',id+'.png'));
 manifest.screens.push({id,title,group,note:'Peça real em cópia isolada; originais preservados',file:'prints/'+id+'.png',metrics:{viewport:{width,height}}});
}
await mkdir(path.join(folder,'assets'),{recursive:true});
for(const [source,target]of [['public/fonts/PixelifySans-Bold.ttf','display.ttf'],['public/fonts/AtkinsonHyperlegible-Regular.ttf','body.ttf'],['public/brand/logo.png','logo.png']])await copyFile(path.join(root,'desktop-web',source),path.join(folder,'assets',target));
await writeFile(path.join(folder,'gallery-manifest.json'),JSON.stringify(manifest,null,2));
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const groups=[...new Set(manifest.screens.map(screen=>screen.group))];
const cards=manifest.screens.map(screen=>`<article data-group="${escape(screen.group)}" id="${screen.id}"><a href="${screen.file}" target="_blank" rel="noopener"><img loading="lazy" src="${screen.file}" alt="${escape(screen.title)}" width="${screen.metrics.viewport.width}" height="${screen.metrics.viewport.height}"></a><div><span>${escape(screen.group)} · ${screen.metrics.viewport.width} × ${screen.metrics.viewport.height}</span><h2>${escape(screen.title)}</h2><p>${escape(screen.note)}</p><a href="${screen.file}" target="_blank" rel="noopener">Abrir print original ↗</a></div></article>`).join('\n');
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RPForge · Telas padronizadas</title><style>
@font-face{font-family:Pixelify;src:url(assets/display.ttf);font-weight:700}@font-face{font-family:Atkinson;src:url(assets/body.ttf)}*{box-sizing:border-box}body{margin:0;background:#121218;color:#f5f1e8;font:16px/1.5 Atkinson,Arial,sans-serif}header,main,footer{width:min(1480px,calc(100% - 64px));margin:auto}header{padding:40px 0 28px}header img{width:156px;height:auto}h1,h2{font-family:Pixelify,monospace}h1{font-size:38px;line-height:1.15;margin:32px 0 12px}h1:after{content:'';display:block;width:48px;height:4px;background:#ff7b25;margin:18px 0}p{color:#aaa9b7;max-width:90ch}a{color:#ff9a53;text-underline-offset:4px}nav{display:flex;gap:10px;flex-wrap:wrap;margin:26px 0}button{font:15px Atkinson;background:#1d1d27;color:#f5f1e8;border:1px solid #5c5460;border-radius:2px;padding:10px 14px;cursor:pointer}button[aria-pressed=true]{border-color:#ff7b25;background:#ff7b251a}button:focus-visible,a:focus-visible{outline:2px solid #ff7b25;outline-offset:3px}.chips{display:flex;gap:16px;flex-wrap:wrap;color:#aaa9b7;font-size:13px}.chips span{border:1px solid #343444;padding:7px 10px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{min-width:0;background:#1d1d27;border:1px solid #343444;border-top-color:#ff7b25}article[hidden]{display:none}article>a{display:block;background:#17171f;border-bottom:1px solid #343444}article img{display:block;width:100%;height:auto;aspect-ratio:16/10;object-fit:contain}article>div{padding:20px 22px}article span{color:#aaa9b7;font-size:12px}h2{font-size:24px;line-height:1.3;margin:8px 0}article p{font-size:13px;margin:8px 0 16px}article a{font-size:14px}footer{padding:36px 0;font-size:13px;color:#aaa9b7}@media(max-width:800px){header,main,footer{width:calc(100% - 32px)}main{grid-template-columns:1fr}h1{font-size:30px}}
</style><header><img src="assets/logo.png" alt="RPForge"><h1>O mesmo RPForge, em todas as telas.</h1><p>${manifest.screens.length} prints atualizados. Tipografia, cores, controles e painéis seguem o website. Clique em qualquer captura para abrir o arquivo original em resolução completa.</p><div class="chips"><span>Referência: rpforge.dev</span><span>Pixelify + Atkinson</span><span>Conta e arquivos reais preservados</span><span>Sem distribuição ou instalador</span></div><nav aria-label="Filtrar capturas"><button aria-pressed="true" data-filter="all">Todas (${manifest.screens.length})</button>${groups.map(group=>`<button aria-pressed="false" data-filter="${escape(group)}">${escape(group)}</button>`).join('')}</nav></header><main>${cards}</main><footer>Capturas do aplicativo executável. Estados de erro e conta usam dados de demonstração; as imagens de roupas vêm de cópias isoladas de peças reais. As verificações automáticas de acessibilidade são uma triagem, não certificação.</footer><script>document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));document.querySelectorAll('article').forEach(card=>card.hidden=button.dataset.filter!=='all'&&card.dataset.group!==button.dataset.filter)}));</script></html>`;
await writeFile(path.join(folder,'index.html'),html);
console.log('PASS: galeria com '+manifest.screens.length+' capturas em '+path.join(folder,'index.html'));
