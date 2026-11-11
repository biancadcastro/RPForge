"use client";
import {OperationResult} from './operation-result';
import { useEffect, useState } from 'react';
import type { ClothingPreview, ClothingResult, DesktopBridge, Progress, Launch } from '../lib/desktop';
import { ClothingViewer } from './clothing-viewer';
import {OperationProgress} from './operation-progress';
import {ClothingSetup,CLOTHING_GROUP,useProPlan} from './clothing-setup';
import {useToast} from './toast';
import {isCancellation,userMessage} from '../lib/user-message';
import {lodName} from '../lib/text';

const basename = (value: string) => value.split(/[\\/]/).pop() || value;
const TITLE='Roupas para OBJ';
function ResultPreview({data}:{data:ClothingPreview}){const [open,setOpen]=useState(false);return <details className="pixel-result-preview" onToggle={event=>setOpen(event.currentTarget.open)}><summary>Ver prévia 3D</summary>{open&&<ClothingViewer data={data}/>}</details>;}
export function ClothingWorkspace({ api, active, busy, launch, onBusy, onHome }: { api?: DesktopBridge; active: boolean; busy: boolean; launch: Launch; onBusy: (value: boolean) => void; onHome?: () => void }) {
  const [model, setModel] = useState(''), [texture, setTexture] = useState(''), [destination, setDestination] = useState('');
  const [lod, setLod] = useState('high'), [error, setError] = useState(''), [result, setResult] = useState<ClothingResult>(), [preview, setPreview] = useState<ClothingPreview>(), [progress, setProgress] = useState<Progress>();
  useEffect(() => api?.onProgress(setProgress), [api]);
  const quick = launch.mode === 'quick', toast = useToast(), pro = useProPlan(api, quick);
  const [candidates, setCandidates] = useState<string[]>([]);
  useEffect(() => {
    if (launch.action!=='obj'||!launch.clothing) return;
    setModel(launch.clothing.model); setTexture(launch.clothing.texture); setDestination(launch.clothing.destination); setCandidates(launch.clothing.candidates);
    setResult(undefined); setPreview(undefined); setError('');
  }, [launch]);
  async function choose(kind: 'model' | 'texture' | 'destination') {
    if (!api || busy) return;
    setError('');
    try {
      const value = await api.selectClothingFile(kind);
      if (!value) return;
      setResult(undefined); setPreview(undefined);
      if (kind === 'model') { setModel(value); setTexture(''); setCandidates([]); }
      else if (kind === 'texture') setTexture(value);
      else setDestination(value);
    } catch (e) { setError(userMessage(e)); }
  }
  async function exportObj() {
    if (!api || busy) return;
    onBusy(true); setError(''); setResult(undefined); setPreview(undefined); setProgress(undefined);
    try {
      const value = await api.exportClothingObj(lod,{model,texture,destination});
      setResult(value);
      try { setPreview(await api.clothingPreview()); }
      catch (e) { toast({tone:'info',title:'Prévia 3D indisponível',message:userMessage(e)}); }
    } catch (e) { const m=userMessage(e);if(isCancellation(m))toast({tone:'info',title:'Cancelamento concluído',message:'Nada foi gravado. Os originais foram preservados.'});else setError(m); }
    finally { onBusy(false); setProgress(undefined); }
  }
  if(result)return <main className="clothing-workspace wrap result-workspace" hidden={!active}><OperationResult group={CLOTHING_GROUP} tool={TITLE} quick={quick} onHome={onHome} title="Pronta para texturizar" description="A peça foi exportada com UVs, normais e materiais." cards={[{title:'Arquivos OBJ e MTL',badge:'LOD '+lodName(result.lod),detail:'Somente OBJ e MTL, sem subpasta.',files:[result.objFile,result.mtlFile]}]} destination={result.output} onOpen={()=>void api?.openFolder(result.output).catch(e=>toast({tone:'error',title:'Não foi possível abrir a pasta',message:userMessage(e)}))} onReset={()=>{setResult(undefined);setPreview(undefined);setError('');}} resetLabel="Exportar outra peça"><p className="pixel-result-detail">{result.vertices.toLocaleString('pt-BR')} vértices · {result.triangles.toLocaleString('pt-BR')} triângulos · OBJ para pintura, sem rig.</p>{preview&&active&&<ResultPreview data={preview}/>}</OperationResult></main>;
  return <main className={`clothing-workspace wrap${quick ? ' clothing-quick' : ''}`} hidden={!active}>
    <ClothingSetup idPrefix="obj" api={api} busy={busy} quick={quick} pro={pro} onHome={onHome} title={TITLE} description="Exporte a peça com UVs, normais e materiais para texturização."
     model={model} texture={texture} destination={destination} candidates={candidates} modelHint="YDD" destinationPlaceholder="Escolher onde salvar o OBJ"
     extra={<><label htmlFor="clothing-lod">Nível de detalhe (LOD)</label><select id="clothing-lod" value={lod} disabled={busy} onChange={e => { setLod(e.target.value); setResult(undefined); setPreview(undefined); }}><option value="high">Alto · recomendado para texturização</option><option value="medium">Médio</option><option value="low">Baixo</option><option value="verylow">Muito baixo</option></select></>}
     note="Somente OBJ e MTL serão salvos diretamente no destino. O YDD e o YTD originais permanecem intactos. OBJ para pintura, sem rig."
     actionLabel="Exportar para OBJ" onAction={()=>void exportObj()} onChoose={kind=>void choose(kind)} onCandidate={value=>void api?.selectClothingTexture(value).then(setTexture).catch(e=>setError(userMessage(e)))}
     emptyText="Selecione o YDD, confira o destino e exporte. Os arquivos OBJ e MTL aparecem aqui ao concluir, com a prévia 3D."
     error={error}
     progress={busy && active && <OperationProgress title="Exportando para OBJ" file={basename(model)} label={progress?.label} detail="Lendo a geometria e conferindo os arquivos OBJ e MTL. Seus originais serão preservados." onCancel={async()=>api?.cancelClothingExport()}/>}/>
  </main>;
}
