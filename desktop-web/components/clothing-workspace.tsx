"use client";
import {PageHeading} from './page-heading';
import {OperationResult} from './operation-result';
import { useEffect, useState } from 'react';
import type { ClothingPreview, ClothingResult, DesktopBridge, Progress, Launch } from '../lib/desktop';
import { Arrow, Folder } from './icons';
import { ClothingViewer } from './clothing-viewer';
import {OperationProgress} from './operation-progress';

const basename = (value: string) => value.split(/[\\/]/).pop() || value;
function ResultPreview({data}:{data:ClothingPreview}){const [open,setOpen]=useState(false);return <details className="pixel-result-preview" onToggle={event=>setOpen(event.currentTarget.open)}><summary>Ver prévia 3D</summary>{open&&<ClothingViewer data={data}/>}</details>;}
export function ClothingWorkspace({ api, active, busy, launch, onBusy }: { api?: DesktopBridge; active: boolean; busy: boolean; launch: Launch; onBusy: (value: boolean) => void }) {
  const [model, setModel] = useState(''), [texture, setTexture] = useState(''), [destination, setDestination] = useState('');
  const [lod, setLod] = useState('high'), [error, setError] = useState(''), [result, setResult] = useState<ClothingResult>(), [preview, setPreview] = useState<ClothingPreview>(), [progress, setProgress] = useState<Progress>();
  useEffect(() => api?.onProgress(setProgress), [api]);
  const quick = launch.mode === 'quick';
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
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível selecionar o arquivo.'); }
  }
  async function exportObj() {
    if (!api || busy) return;
    onBusy(true); setError(''); setResult(undefined); setPreview(undefined); setProgress(undefined);
    try {
      const value = await api.exportClothingObj(lod,{model,texture,destination});
      setResult(value);
      try { setPreview(await api.clothingPreview()); }
      catch (e) { setError(e instanceof Error ? e.message : 'Pacote exportado; prévia indisponível.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível exportar a peça.'); }
    finally { onBusy(false); setProgress(undefined); }
  }
  if(result)return <main className="clothing-workspace wrap result-workspace" hidden={!active}><OperationResult context="Roupas / Exportar OBJ" title="Pronta para texturizar." description="A peça foi exportada com UVs, normais e materiais." cards={[{title:'Arquivos OBJ e MTL',badge:'LOD '+result.lod,detail:'Somente OBJ e MTL · sem subpasta',files:[result.objFile,result.mtlFile]}]} destination={result.output} onOpen={()=>void api?.openFolder(result.output).catch(e=>setError(String(e)))} onReset={()=>{setResult(undefined);setPreview(undefined);setError('');}} resetLabel="Exportar outra peça"><p className="pixel-result-detail">{result.vertices.toLocaleString('pt-BR')} vértices · {result.triangles.toLocaleString('pt-BR')} triângulos · OBJ para pintura, sem rig.</p>{preview&&active&&<ResultPreview data={preview}/>}{error&&<p className="error-note" role="alert">{error}</p>}</OperationResult></main>;
  return <main className={`clothing-workspace wrap${quick ? ' clothing-quick' : ''}`} hidden={!active}>
<PageHeading className="clothing-heading" eyebrow={quick?undefined:"Roupas e texturização"} title="Exportar roupa para OBJ" description="Exporte a peça com UVs, normais e materiais para texturização. Exclusivo do plano Pro." aside={!quick&&<span className="file-badge">.ydd → .obj</span>}/>
    <div className="clothing-layout"><section className="clothing-config" aria-label="Configuração da exportação OBJ" hidden={quick && !!result}>
      <h2>Prepare sua peça</h2>
      {quick && !model && <p className="clothing-note">Selecione uma peça YDD desta pasta ou de uma subpasta para continuar.</p>}
      <label>Peça de roupa <span>YDD</span></label><button className="clothing-file" onClick={() => void choose('model')} disabled={!api || busy} title={model}><Folder /><span>{model ? basename(model) : 'Selecionar peça YDD'}</span></button>
      {model && <p className="clothing-source-path">Origem: {model}</p>}
      <label>Texturas <span>YTD opcional se estiverem no YDD</span></label><button className="clothing-file" onClick={() => void choose('texture')} disabled={!api || busy || !model} title={texture}><Folder /><span>{texture ? basename(texture) : 'Selecionar texturas YTD'}</span></button>
      {candidates.length > 1 && <><label htmlFor="clothing-variant">Variação encontrada na pasta</label><select id="clothing-variant" disabled={busy} value={candidates.includes(texture) ? texture : ''} onChange={e => { const value=e.target.value;if(value)void api?.selectClothingTexture(value).then(setTexture).catch(e=>setError(String(e))); }}><option value="">Escolha a textura correspondente</option>{candidates.map(file=><option key={file} value={file}>{basename(file)}</option>)}</select></>}
      <label htmlFor="clothing-lod">Nível de detalhe</label><select id="clothing-lod" value={lod} disabled={busy} onChange={e => { setLod(e.target.value); setResult(undefined); setPreview(undefined); }}><option value="high">Alto · recomendado para texturização</option><option value="medium">Médio</option><option value="low">Baixo</option><option value="verylow">Muito baixo</option></select>
      <label>Pasta de destino</label><button className="clothing-file" onClick={() => void choose('destination')} disabled={!api || busy} title={destination}><Folder /><span>{destination || 'Escolher onde salvar o pacote'}</span></button>
      <p className="clothing-note">Somente OBJ e MTL serão salvos diretamente no destino. O YDD e o YTD originais permanecem intactos. OBJ para pintura, sem rig.</p>
      <button className="button primary" onClick={() => void exportObj()} disabled={!api || busy || !model || !destination}>Exportar para OBJ <Arrow /></button>
      {busy && active && <OperationProgress title="Exportando para OBJ" file={basename(model)} label={progress?.label} detail="Lendo a geometria e conferindo os arquivos OBJ e MTL. Seus originais serão preservados." onCancel={async()=>api?.cancelClothingExport()}/>}
      {error && <p className="error-note" role="alert">{error}</p>}
    </section><section className="clothing-delivery" aria-label="Resultado da exportação" hidden={quick && !result}>
      <div className="clothing-empty"><img src="/brand/symbol.png" alt="" /><h2>Prévia da exportação</h2><p>Selecione o YDD, confira o destino e exporte. O modelo aparecerá aqui após a conclusão.</p><p>UVs, normais e grupos de materiais preservados.</p></div>
    </section></div>
  </main>;
}
