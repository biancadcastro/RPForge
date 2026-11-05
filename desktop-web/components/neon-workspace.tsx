"use client";
import {OperationResult} from './operation-result';
import { useEffect,useState } from 'react';
import type {DesktopBridge,Launch,NeonResult,Progress} from '../lib/desktop';
import {Folder,Arrow} from './icons';
import {OperationProgress} from './operation-progress';
const basename=(file:string)=>file.split(/[\\/]/).pop()||file;
export function NeonWorkspace({api,active,busy,launch,onBusy}:{api?:DesktopBridge;active:boolean;busy:boolean;launch:Launch;onBusy:(value:boolean)=>void}){
 const [model,setModel]=useState(''),[texture,setTexture]=useState(''),[destination,setDestination]=useState(''),[candidates,setCandidates]=useState<string[]>([]),[error,setError]=useState(''),[result,setResult]=useState<NeonResult>(),[progress,setProgress]=useState<Progress>();
 const quick=launch.mode==='quick';
 useEffect(()=>api?.onProgress(setProgress),[api]);
 useEffect(()=>{if(launch.action!=='neon'||!launch.clothing)return;const c=launch.clothing;setModel(c.model);setTexture(c.texture);setDestination(c.destination);setCandidates(c.candidates);setResult(undefined);setError('');},[launch]);
 async function choose(kind:'model'|'texture'|'destination'){
  if(!api||busy)return;setError('');
  try{const file=await api.selectClothingFile(kind,'neon');if(!file)return;setResult(undefined);if(kind==='model'){setModel(file);setTexture('');setCandidates([]);}else if(kind==='texture')setTexture(file);else setDestination(file);}catch(e){setError(e instanceof Error?e.message:String(e));}
 }
 async function convert(){
  if(!api||busy)return;onBusy(true);setError('');setResult(undefined);setProgress(undefined);
  try{setResult(await api.convertClothingNeon({model,texture,destination}));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{onBusy(false);setProgress(undefined);}
 }
 if(result)return <main className="clothing-workspace wrap result-workspace" hidden={!active}><OperationResult context="Roupas / Converter para Neon" title="Versão Neon criada." description="Uma nova versão emissiva da roupa foi salva." cards={[{title:'Roupa Neon',badge:'ID '+result.drawableId,detail:'Material ped_emissive',files:result.files}]} destination={result.output} onOpen={()=>void api?.openFolder(result.output).catch(e=>setError(String(e)))} onReset={()=>{setResult(undefined);setError('');}} resetLabel="Converter outra peça"><p className="pixel-result-detail">Geometria, UVs, pesos, esqueleto e texturas embutidas conferidos após reabrir o YDD. Confira a aparência no FiveM antes de usar no servidor.</p><details className="pixel-result-diagnostics"><summary>Detalhes dos LODs</summary>{result.lods.filter(l=>l.vertices>0).map(l=><p key={l.lod}>{l.lod}: {l.vertices.toLocaleString('pt-BR')} vértices · {l.triangles.toLocaleString('pt-BR')} triângulos</p>)}</details>{error&&<p className="error-note" role="alert">{error}</p>}</OperationResult></main>;
 return <main className={`clothing-workspace wrap${quick?' clothing-quick':''}`} hidden={!active}>
  <div className="clothing-heading"><div>{!quick&&<p className="kicker">Roupas e materiais</p>}<h1>Converter roupa para Neon</h1><p>Uma nova versão emissiva, com geometria e rig preservados. Exclusivo do plano Pro.</p></div></div>
  <div className="clothing-layout"><section className="clothing-config" hidden={quick&&!!result} aria-label="Configuração Neon">
   <h2>Configurar Neon</h2>
   <label>Peça de roupa <span>YDD</span></label><button className="clothing-file" title={model} disabled={!api||busy} onClick={()=>void choose('model')}><Folder/><span>{model?basename(model):'Selecionar peça YDD'}</span></button>
   {model&&<p className="clothing-source-path">Origem: {model}</p>}
   <label>Textura correspondente <span>YTD opcional se embutida</span></label><button className="clothing-file" title={texture} disabled={!api||busy||!model} onClick={()=>void choose('texture')}><Folder/><span>{texture?basename(texture):'Selecionar texturas YTD'}</span></button>
   {candidates.length>1&&<><label htmlFor="neon-texture">Variação de textura</label><select id="neon-texture" disabled={busy} value={candidates.includes(texture)?texture:''} onChange={e=>{if(e.target.value)void api?.selectClothingTexture(e.target.value,'neon').then(setTexture).catch(e=>setError(String(e)));}}><option value="">Escolha a variação</option>{candidates.map(f=><option key={f} value={f}>{basename(f)}</option>)}</select></>}
   <label>Pasta de destino</label><button className="clothing-file" title={destination} disabled={!api||busy} onClick={()=>void choose('destination')}><Folder/><span>{destination||'Escolher onde salvar a versão Neon'}</span></button>
   <p className="clothing-note">O preset Neon será aplicado aos LODs existentes. O YTD é copiado sem alterar a imagem. Novos arquivos recebem um ID livre; os originais ficam intactos.</p>
   <button className="button primary" disabled={!api||busy||!model||!destination} onClick={()=>void convert()}>Converter para Neon <Arrow/></button>
   {busy&&active&&<OperationProgress title="Convertendo roupa para Neon" file={basename(model)} label={progress?.label} detail="Aplicando o material emissivo e validando geometria, rig e texturas. Seus originais serão preservados." onCancel={async()=>api?.cancelClothingExport()}/>}
   {error&&<p className="error-note" role="alert">{error}</p>}
  </section><section className="clothing-delivery" hidden={quick&&!result} aria-label="Resultado Neon">
   <div className="clothing-empty"><img src="/brand/symbol.png" alt=""/><h2>Resultado da conversão</h2><p>Selecione uma roupa isolada e confira o destino. Peças com pele devem passar por Separar pele antes da conversão.</p><p>Conversão local, sem Blender.</p></div>
  </section></div>
 </main>;
}
