"use client";
import {useEffect,useMemo,useState} from 'react';
import type {DesktopBridge,Launch,SkinReview,SkinResult} from '../lib/desktop';
import {skinPreview,skinCounts,uncertainRegion} from '../lib/skin-review';
import {SkinResultScreen} from './skin-result';
import {SkinEditor} from './skin-editor';
import {OperationProgress} from './operation-progress';
import {Folder,Arrow,EditorToolIcon} from './icons';
import {mergeFaceSelection,type SelectionOperation,type SelectionTool} from '../lib/face-selection';
const basename=(file:string)=>file.split(/[\\/]/).pop()||file;
export function SkinWorkspace({api,active,busy,launch,onBusy,onEditorState}:{api?:DesktopBridge;active:boolean;busy:boolean;launch:Launch;onBusy:(value:boolean)=>void;onEditorState?:(active:boolean)=>void}){
 const [model,setModel]=useState(''),[texture,setTexture]=useState(''),[destination,setDestination]=useState(''),[candidates,setCandidates]=useState<string[]>([]);
 const [review,setReview]=useState<SkinReview>(),[result,setResult]=useState<SkinResult>(),[error,setError]=useState(''),[progress,setProgress]=useState('');
 const [operation,setOperation]=useState<'inspect'|'split'>('inspect');
 const [lod,setLod]=useState('high'),[tool,setTool]=useState<SelectionTool>('face'),[selectionOperation,setSelectionOperation]=useState<SelectionOperation>('replace'),[radius,setRadius]=useState(32),[through,setThrough]=useState(false),[selected,setSelected]=useState<Set<string>>(new Set()),[region,setRegion]=useState(false),[overrides,setOverrides]=useState<Record<string,'skin'|'cloth'>>({}),[history,setHistory]=useState<Record<string,'skin'|'cloth'>[]>([]),[previewReady,setPreviewReady]=useState(false);
 const quick=launch.mode==='quick';
 useEffect(()=>{if(!review||!Object.keys(overrides).length)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[review,overrides]);
 function leaveReview(){if(Object.keys(overrides).length&&!window.confirm('Descartar as alterações desta revisão? Os arquivos originais permanecem preservados.'))return;setReview(undefined);setOverrides({});setHistory([]);}
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
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 }
 async function perform(action:'inspect'|'split'){
  if(!api||busy)return;setOperation(action);onBusy(true);setError('');setProgress('');
  try{const selection={model,texture,destination};if(action==='inspect'){setReview(await api.inspectClothingSkin(selection));setResult(undefined);setOverrides({});setHistory([]);setLod('high');setTool('face');}else{if(!review)return;setResult(await api.separateClothingSkin(selection,review.reviewId,overrides));setReview(undefined);}}
  catch(e){setError(e instanceof Error?e.message:String(e));}finally{onBusy(false);setProgress('');}
 }
 function selectFaces(ids:string[],operation:SelectionOperation){if(busy||!meshes)return;const faces=tool==='face'&&region&&ids.length===1?uncertainRegion(meshes,ids[0],overrides):ids;setSelected(previous=>{const next=mergeFaceSelection(previous,faces.filter(id=>validFaces.has(id)),operation);return next.size===previous.size&&[...next].every(id=>previous.has(id))?previous:next;});}
 function mark(role:'skin'|'cloth'){if(busy||!selected.size)return;setHistory(h=>[...h.slice(-49),overrides]);setOverrides(previous=>{const next={...previous};for(const face of selected)next[face]=role;return next;});}
 function undo(){if(!history.length||busy)return;setOverrides(history[history.length-1]);setHistory(h=>h.slice(0,-1));}
 useEffect(()=>{if(!active||!review||busy)return;const shortcuts=(event:KeyboardEvent)=>{if(event.defaultPrevented||event.target instanceof HTMLElement&&event.target.closest('input,select,textarea'))return;const key=event.key.toLowerCase();if((event.ctrlKey||event.metaKey)&&key==='z'){event.preventDefault();undo();return;}if(event.ctrlKey||event.metaKey||event.altKey)return;if(key==='b')setTool('box');else if(key==='c')setTool('brush');else if(key==='v')setTool('face');else if(key==='escape')setTool('navigate');else if(key==='[')setRadius(r=>Math.max(8,r-4));else if(key===']')setRadius(r=>Math.min(120,r+4));};document.addEventListener('keydown',shortcuts);return()=>document.removeEventListener('keydown',shortcuts);},[active,review,busy,history]);
 return <main className={`clothing-workspace wrap skin-workspace${quick?' clothing-quick':''}${review?' skin-editing':''}${result?' skin-result-active':''}`} hidden={!active} aria-busy={busy}>
  {!result&&<div className="clothing-heading"><div>{!quick&&<p className="kicker">Roupas e geometria</p>}<h1>Separar pele</h1><p>Revise as faces e gere a roupa e a pele em arquivos separados. Exclusivo do plano Pro.</p></div></div>}
  {!review&&!result&&<section className="clothing-config skin-config" aria-label="Configuração da separação">
   <label>Peça de roupa <span>YDD com roupa e pele</span></label><button className="clothing-file" title={model} disabled={!api||busy} onClick={()=>void choose('model')}><Folder/><span>{model?basename(model):'Selecionar peça YDD'}</span></button>
   {model&&<p className="clothing-source-path">Origem: {model}</p>}
   <label>Textura correspondente <span>YTD opcional se embutida</span></label><button className="clothing-file" title={texture} disabled={!api||busy||!model} onClick={()=>void choose('texture')}><Folder/><span>{texture?basename(texture):'Selecionar texturas YTD'}</span></button>
   {candidates.length>1&&<><label htmlFor="skin-texture">Variação de textura</label><select id="skin-texture" disabled={busy} value={candidates.includes(texture)?texture:''} onChange={e=>{if(e.target.value)void api?.selectClothingTexture(e.target.value,'skin').then(t=>{setTexture(t);setReview(undefined);}).catch(e=>setError(String(e)));}}><option value="">Escolha a variação</option>{candidates.map(f=><option key={f} value={f}>{basename(f)}</option>)}</select></>}
   <label>Pasta de destino</label><button className="clothing-file" title={destination} disabled={!api||busy} onClick={()=>void choose('destination')}><Folder/><span>{destination||'Escolher onde salvar as peças'}</span></button>
   <p className="clothing-note">A análise não grava arquivos na origem. Você poderá revisar a seleção antes de separar.</p>
   <button className="button primary" disabled={!api||busy||!model||!destination} onClick={()=>void perform('inspect')}>Analisar peça <Arrow/></button>
  </section>}
  {review&&!result&&active&&<SkinEditor model={model} texture={texture} destination={destination} review={review} lod={lod} counts={counts} preview={preview} selection={{tool,operation:selectionOperation,radius,through,selected,onSelect:selectFaces}} busy={busy} ready={ready} undoAvailable={!!history.length} modified={Object.keys(overrides).length} region={region} error={error} onLod={setLod} onTool={setTool} onRadius={setRadius} onThrough={setThrough} onOperation={setSelectionOperation} onClear={()=>setSelected(new Set())} onMark={mark} onUndo={undo} onRestore={()=>{setOverrides({});setHistory([]);}} onRegion={setRegion} onBack={leaveReview} onDestination={()=>void choose('destination')} onSplit={()=>void perform('split')} onFull={()=>void api?.openFull().catch(e=>setError(String(e)))} onReady={setPreviewReady}/>}
  {result&&<SkinResultScreen result={result} onOpen={()=>void api?.openFolder(result.output).catch(e=>setError(String(e)))} onReset={()=>{setResult(undefined);setOverrides({});setHistory([]);}}/>}
  {busy&&active&&<OperationProgress title={operation==='inspect'?'Analisando a peça':'Separando pele e roupa'} file={basename(model)} label={progress} detail={operation==='inspect'?'Lendo a geometria e identificando as faces de cada LOD. Nenhuma alteração será feita na origem.':'Gerando Roupa e Pele e conferindo a integridade dos arquivos antes de concluir.'} onCancel={async()=>api?.cancelClothingExport()}/>}
  {error&&!review&&<p className="error-note" role="alert">{error}</p>}
 </main>;
}
