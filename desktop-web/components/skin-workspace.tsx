"use client";
import {useEffect,useMemo,useState} from 'react';
import type {DesktopBridge,Launch,SkinReview,SkinResult} from '../lib/desktop';
import {skinPreview,skinCounts,uncertainRegion} from '../lib/skin-review';
import {SkinResultScreen} from './skin-result';
import {SkinEditor} from './skin-editor';
import {OperationProgress} from './operation-progress';
import {ClothingSetup,useProPlan} from './clothing-setup';
import {Notice} from './notice';
import {ConfirmDialog} from './confirm-dialog';
import {useToast} from './toast';
import {userMessage} from '../lib/user-message';
import {mergeFaceSelection,type SelectionOperation,type SelectionTool} from '../lib/face-selection';
const basename=(file:string)=>file.split(/[\\/]/).pop()||file;
export function SkinWorkspace({api,active,busy,launch,onBusy,onEditorState,onHome}:{api?:DesktopBridge;active:boolean;busy:boolean;launch:Launch;onBusy:(value:boolean)=>void;onEditorState?:(active:boolean)=>void;onHome?:()=>void}){
 const [model,setModel]=useState(''),[texture,setTexture]=useState(''),[destination,setDestination]=useState(''),[candidates,setCandidates]=useState<string[]>([]);
 const [review,setReview]=useState<SkinReview>(),[result,setResult]=useState<SkinResult>(),[error,setError]=useState(''),[progress,setProgress]=useState('');
 const [operation,setOperation]=useState<'inspect'|'split'>('inspect');
 const [lod,setLod]=useState('high'),[tool,setTool]=useState<SelectionTool>('face'),[selectionOperation,setSelectionOperation]=useState<SelectionOperation>('replace'),[radius,setRadius]=useState(32),[through,setThrough]=useState(false),[selected,setSelected]=useState<Set<string>>(new Set()),[region,setRegion]=useState(false),[overrides,setOverrides]=useState<Record<string,'skin'|'cloth'>>({}),[history,setHistory]=useState<Record<string,'skin'|'cloth'>[]>([]),[previewReady,setPreviewReady]=useState(false);
 const quick=launch.mode==='quick',toast=useToast(),pro=useProPlan(api,quick),[confirmLeave,setConfirmLeave]=useState(false);
 const openFailed=(e:unknown)=>toast({tone:'error',title:'Não foi possível abrir a pasta',message:userMessage(e)});
 useEffect(()=>{if(!review||!Object.keys(overrides).length)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[review,overrides]);
 function discardReview(){setConfirmLeave(false);setReview(undefined);setOverrides({});setHistory([]);}
 function leaveReview(){if(Object.keys(overrides).length){setConfirmLeave(true);return;}discardReview();}
 useEffect(()=>api?.onProgress(p=>setProgress(p.label||'')),[api]);
 useEffect(()=>{if(launch.action!=='skin'||!launch.clothing)return;const c=launch.clothing;setModel(c.model);setTexture(c.texture);setDestination(c.destination);setCandidates(c.candidates);setReview(undefined);setResult(undefined);setOverrides({});setHistory([]);setError('');},[launch]);
 useEffect(()=>{onEditorState?.(active&&(!!review||!!result));return()=>onEditorState?.(false);},[active,review,result,onEditorState]);
 const meshes=review?.previews[lod]?.meshes;
 const validFaces=useMemo(()=>new Set(meshes?.flatMap(m=>m.faceIds)||[]),[meshes]);
 useEffect(()=>{setSelected(new Set());},[review,lod]);
 const preview=useMemo(()=>meshes?.length?skinPreview(meshes,overrides):undefined,[meshes,overrides]);
 const counts=useMemo(()=>review?Object.entries(review.previews).map(([lod,data])=>({lod,...skinCounts(data.meshes,overrides)})):[],[review,overrides]);
 const high=counts.find(c=>c.lod==='high'),uncertain=counts.reduce((n,c)=>n+c.uncertain,0);
 const ready=previewReady&&!!high&&high.skin>0&&high.cloth>0&&uncertain===0;
 async function choose(kind:'model'|'texture'|'destination'){
  if(!api||busy)return;setError('');
  try{const value=await api.selectClothingFile(kind,'skin');if(!value)return;setResult(undefined);
   if(kind==='model'){setModel(value);setTexture('');setCandidates([]);setReview(undefined);setOverrides({});setHistory([]);}else if(kind==='texture'){setTexture(value);setReview(undefined);setOverrides({});setHistory([]);}else setDestination(value);
  }catch(e){setError(userMessage(e));}
 }
 async function perform(action:'inspect'|'split'){
  if(!api||busy)return;setOperation(action);onBusy(true);setError('');setProgress('');
  try{const selection={model,texture,destination};if(action==='inspect'){setReview(await api.inspectClothingSkin(selection));setResult(undefined);setOverrides({});setHistory([]);setLod('high');setTool('face');}else{if(!review)return;setResult(await api.separateClothingSkin(selection,review.reviewId,overrides));setReview(undefined);}}
  catch(e){setError(userMessage(e));}finally{onBusy(false);setProgress('');}
 }
 function selectFaces(ids:string[],operation:SelectionOperation){if(busy||!meshes)return;const faces=tool==='face'&&region&&ids.length===1?uncertainRegion(meshes,ids[0],overrides):ids;setSelected(previous=>{const next=mergeFaceSelection(previous,faces.filter(id=>validFaces.has(id)),operation);return next.size===previous.size&&[...next].every(id=>previous.has(id))?previous:next;});}
 function mark(role:'skin'|'cloth'){if(busy||!selected.size)return;setHistory(h=>[...h.slice(-49),overrides]);setOverrides(previous=>{const next={...previous};for(const face of selected)next[face]=role;return next;});}
 function undo(){if(!history.length||busy)return;setOverrides(history[history.length-1]);setHistory(h=>h.slice(0,-1));}
 useEffect(()=>{if(!active||!review||busy)return;const shortcuts=(event:KeyboardEvent)=>{if(event.defaultPrevented||event.target instanceof HTMLElement&&event.target.closest('input,select,textarea'))return;const key=event.key.toLowerCase();if((event.ctrlKey||event.metaKey)&&key==='z'){event.preventDefault();undo();return;}if(event.ctrlKey||event.metaKey||event.altKey)return;if(key==='b')setTool('box');else if(key==='c')setTool('brush');else if(key==='v')setTool('face');else if(key==='escape')setTool('navigate');else if(key==='[')setRadius(r=>Math.max(8,r-4));else if(key===']')setRadius(r=>Math.min(120,r+4));};document.addEventListener('keydown',shortcuts);return()=>document.removeEventListener('keydown',shortcuts);},[active,review,busy,history]);
 return <main className={`clothing-workspace wrap skin-workspace${quick?' clothing-quick':''}${review?' skin-editing':''}${result?' skin-result-active':''}`} hidden={!active} aria-busy={busy}>
  {!review&&!result&&<ClothingSetup idPrefix="skin" api={api} busy={busy} quick={quick} pro={pro} onHome={onHome} title="Separar pele" description="Revise as faces e gere a roupa e a pele em arquivos separados."
   model={model} texture={texture} destination={destination} candidates={candidates} modelHint="YDD com roupa e pele" destinationPlaceholder="Escolher onde salvar as peças"
   note="A análise não grava arquivos na origem. Você poderá revisar a seleção antes de separar."
   actionLabel="Analisar peça" onAction={()=>void perform('inspect')} onChoose={kind=>void choose(kind)} onCandidate={value=>void api?.selectClothingTexture(value,'skin').then(t=>{setTexture(t);setReview(undefined);}).catch(e=>setError(userMessage(e)))}
   emptyText="Analise a peça para abrir o editor. Lá você revisa as faces de cada LOD e separa a roupa e a pele em arquivos distintos."
   error={error}/>}
  {review&&!result&&active&&<SkinEditor model={model} texture={texture} destination={destination} review={review} lod={lod} counts={counts} preview={preview} selection={{tool,operation:selectionOperation,radius,through,selected,onSelect:selectFaces}} busy={busy} ready={ready} undoAvailable={!!history.length} modified={Object.keys(overrides).length} region={region} error={error} onLod={setLod} onTool={setTool} onRadius={setRadius} onThrough={setThrough} onOperation={setSelectionOperation} onClear={()=>setSelected(new Set())} onMark={mark} onUndo={undo} onRestore={()=>{setOverrides({});setHistory([]);}} onRegion={setRegion} onBack={leaveReview} onDestination={()=>void choose('destination')} onSplit={()=>void perform('split')} onFull={()=>void api?.openFull().catch(e=>setError(userMessage(e)))} onReady={setPreviewReady}/>}
  {result&&<SkinResultScreen result={result} quick={quick} onHome={onHome} onOpen={()=>void api?.openFolder(result.output).catch(openFailed)} onReset={()=>{setResult(undefined);setOverrides({});setHistory([]);}}/>}
  {busy&&active&&<OperationProgress title={operation==='inspect'?'Analisando a peça':'Separando pele e roupa'} file={basename(model)} label={progress} detail={operation==='inspect'?'Lendo a geometria e identificando as faces de cada LOD. Nenhuma alteração será feita na origem.':'Gerando Roupa e Pele e conferindo a integridade dos arquivos antes de concluir.'} onCancel={async()=>api?.cancelClothingExport()}/>}
  {error&&!review&&result&&<Notice message={error}/>}
  {confirmLeave&&<ConfirmDialog title="Descartar a revisão?" message="As alterações desta revisão serão perdidas. Os arquivos originais permanecem preservados." confirmLabel="Descartar revisão" onConfirm={discardReview} onCancel={()=>setConfirmLeave(false)}/>}
 </main>;
}
