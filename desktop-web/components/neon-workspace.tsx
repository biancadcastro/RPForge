"use client";
import {OperationResult} from './operation-result';
import { useEffect,useState } from 'react';
import type {DesktopBridge,Launch,NeonResult,Progress} from '../lib/desktop';
import {OperationProgress} from './operation-progress';
import {ClothingSetup,CLOTHING_GROUP,useProPlan} from './clothing-setup';
import {useToast} from './toast';
import {isCancellation,userMessage} from '../lib/user-message';
import {lodName,plural} from '../lib/text';
const basename=(file:string)=>file.split(/[\\/]/).pop()||file;
const TITLE='Roupas para Neon';
export function NeonWorkspace({api,active,busy,launch,onBusy,onHome}:{api?:DesktopBridge;active:boolean;busy:boolean;launch:Launch;onBusy:(value:boolean)=>void;onHome?:()=>void}){
 const [model,setModel]=useState(''),[texture,setTexture]=useState(''),[destination,setDestination]=useState(''),[candidates,setCandidates]=useState<string[]>([]),[error,setError]=useState(''),[result,setResult]=useState<NeonResult>(),[progress,setProgress]=useState<Progress>();
 const quick=launch.mode==='quick',toast=useToast(),pro=useProPlan(api,quick);
 useEffect(()=>api?.onProgress(setProgress),[api]);
 useEffect(()=>{if(launch.action!=='neon'||!launch.clothing)return;const c=launch.clothing;setModel(c.model);setTexture(c.texture);setDestination(c.destination);setCandidates(c.candidates);setResult(undefined);setError('');},[launch]);
 async function choose(kind:'model'|'texture'|'destination'){
  if(!api||busy)return;setError('');
  try{const file=await api.selectClothingFile(kind,'neon');if(!file)return;setResult(undefined);if(kind==='model'){setModel(file);setTexture('');setCandidates([]);}else if(kind==='texture')setTexture(file);else setDestination(file);}catch(e){setError(userMessage(e));}
 }
 async function convert(){
  if(!api||busy)return;onBusy(true);setError('');setResult(undefined);setProgress(undefined);
  try{setResult(await api.convertClothingNeon({model,texture,destination}));}catch(e){const m=userMessage(e);if(isCancellation(m))toast({tone:'info',title:'Cancelamento concluído',message:'Nada foi gravado. Os originais foram preservados.'});else setError(m);}finally{onBusy(false);setProgress(undefined);}
 }
 if(result)return <main className="clothing-workspace wrap result-workspace" hidden={!active}><OperationResult group={CLOTHING_GROUP} tool={TITLE} quick={quick} onHome={onHome} title="Versão Neon criada" description="Uma nova versão emissiva da roupa foi salva." cards={[{title:'Roupa Neon',badge:'ID '+result.drawableId,detail:'Material ped_emissive.',files:result.files}]} destination={result.output} onOpen={()=>void api?.openFolder(result.output).catch(e=>toast({tone:'error',title:'Não foi possível abrir a pasta',message:userMessage(e)}))} onReset={()=>{setResult(undefined);setError('');}} resetLabel="Converter outra peça"><p className="pixel-result-detail">Geometria, UVs, pesos, esqueleto e texturas embutidas conferidos após reabrir o YDD. Confira a aparência no FiveM antes de usar no servidor.</p><details className="pixel-result-diagnostics"><summary>Detalhes dos níveis de detalhe (LOD)</summary>{result.lods.filter(l=>l.vertices>0).map(l=><p key={l.lod}>{lodName(l.lod)}: {plural(l.vertices,'vértice','vértices')} · {plural(l.triangles,'triângulo','triângulos')}</p>)}</details></OperationResult></main>;
 return <main className={`clothing-workspace wrap${quick?' clothing-quick':''}`} hidden={!active}>
  <ClothingSetup idPrefix="neon" api={api} busy={busy} quick={quick} pro={pro} onHome={onHome} title={TITLE} description="Uma nova versão emissiva, com geometria e rig preservados."
   model={model} texture={texture} destination={destination} candidates={candidates} modelHint="YDD só com roupa" destinationPlaceholder="Escolher onde salvar a versão Neon"
   note="O preset Neon será aplicado aos LODs existentes. O YTD é copiado sem alterar a imagem. Novos arquivos recebem um ID livre; os originais ficam intactos."
   actionLabel="Converter para Neon" onAction={()=>void convert()} onChoose={kind=>void choose(kind)} onCandidate={value=>void api?.selectClothingTexture(value,'neon').then(setTexture).catch(e=>setError(userMessage(e)))}
   emptyText="Selecione uma roupa isolada e confira o destino. Peças com pele devem passar por Separar pele antes. Conversão local, sem Blender."
   error={error}
   progress={busy&&active&&<OperationProgress title="Convertendo roupa para Neon" file={basename(model)} label={progress?.label} detail="Aplicando o material emissivo e validando geometria, rig e texturas. Seus originais serão preservados." onCancel={async()=>api?.cancelClothingExport()}/>}/>
 </main>;
}
