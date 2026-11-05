"use client";
import type {SkinResult as Result} from '../lib/desktop';
export function PixelSymbol({kind}:{kind:'check'|'folder'|'shield'|'arrow'}){
 const paths={check:'M2 9h3v3h3V9h3V6h3V3h3v6h-3v3h-3v3H8v3H5v-3H2z',folder:'M2 4h7v2h9v12H2zm2 2v10h12V8H8V6z',shield:'M8 2h4v2h6v9h-2v3h-3v2H7v-2H4v-3H2V4h6zm0 4H4v6h2v3h3v1h2v-1h3v-3h2V6h-5V4H9v2z',arrow:'M11 3h3v3h3v3h3v3h-3v3h-3v3h-3v-6H2V9h9z'};
 return <svg viewBox="0 0 22 22" aria-hidden="true" fill="currentColor" shapeRendering="crispEdges"><path fillRule="evenodd" d={paths[kind]}/></svg>;
}
export function SkinResultScreen({result,onOpen,onReset}:{result:Result;onOpen:()=>void;onReset:()=>void}){
 const name=result.output.split(/[\\/]/).pop()||result.output;
 const destination=/[/\\]Desktop[/\\]/i.test(result.output)?'Área de Trabalho / '+name:result.output;
 return <section className="pixel-result" aria-label="Resultado da separação">
  <div className="pixel-result-context">Roupas / <strong>Separar pele</strong></div>
  <header className="pixel-result-heading"><PixelSymbol kind="check"/><div><h1>Separação concluída</h1><p>A roupa e a pele foram salvas separadamente.</p></div></header>
  <div className="pixel-result-files">{(['cloth','skin'] as const).map(role=>{const output=result.roles[role];const basename=(value:string)=>value.split(/[\\/]/).pop()||value;return <section className="pixel-output" key={role} aria-label={role==='cloth'?'Arquivos da roupa':'Arquivos da pele'}><div className="pixel-output-heading"><PixelSymbol kind="folder"/><h2>{role==='cloth'?'Roupa':'Pele'}</h2><span>ID {output.id}</span></div><p className="pixel-output-folder">{role==='cloth'?'Roupa/':'Pele/'}</p><ul><li><span>YDD</span><p title={output.model}>{basename(output.model)}</p></li>{output.texture&&<li><span>YTD</span><p title={output.texture}>{basename(output.texture)}</p></li>}</ul></section>;})}</div>
  <footer className="pixel-result-footer"><div className="pixel-result-notes"><p title={result.output}><PixelSymbol kind="folder"/><span>{destination}</span></p><p title="Geometria, UVs, pesos, rig, materiais e texturas conferidos."><PixelSymbol kind="shield"/><span>Originais preservados</span></p></div><div className="pixel-result-actions"><button className="pixel-result-button primary" onClick={onOpen}><PixelSymbol kind="folder"/>Abrir pasta</button><button className="pixel-result-button" onClick={onReset}><PixelSymbol kind="arrow"/>Separar outra peça</button></div></footer>
 </section>;
}
