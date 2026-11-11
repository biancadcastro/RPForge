"use client";
import type {ReactNode} from 'react';
import {PixelSymbol} from './result-icons';
export type OutputCard={title:string;badge?:string;folder?:string;files?:string[];detail?:string;error?:string;onOpen?:()=>void};
const basename=(value:string)=>value.split(/[\\/]/).pop()||value;
export function OperationResult({context,title,description,cards,destination,onOpen,onReset,resetLabel='Nova operação',openLabel='Abrir pasta',note='Originais preservados',diagnostics,children}:{context:string;title:string;description:string;cards:OutputCard[];destination:string;onOpen?:()=>void;onReset:()=>void;resetLabel?:string;openLabel?:string;note?:string;diagnostics?:ReactNode;children?:ReactNode}){
 const label=/[/\\]Desktop[/\\]/i.test(destination)?'Área de Trabalho / '+basename(destination):destination;
 const hasSuccess=cards.some(c=>!c.error);
 return <section className="pixel-result" aria-label="Resultado da operação"><div className="pixel-result-context">{context}</div><header className="pixel-result-heading">{hasSuccess&&<PixelSymbol kind="check"/>}<div><h1>{title}</h1><p>{description}</p></div></header>
 <div className="pixel-result-files">{cards.map((card,i)=><section className="pixel-output" key={i} aria-label={card.title}><div className="pixel-output-heading"><PixelSymbol kind="folder"/><h2>{card.title}</h2>{card.badge&&<span>{card.badge}</span>}</div>{card.folder&&<p className="pixel-output-folder" title={card.folder}>{card.folder}</p>}{card.error?<p className="error-note" role="alert">{card.error}</p>:<>{card.detail&&<p className="pixel-output-folder">{card.detail}</p>}<ul>{card.files?.map((file,j)=><li key={j}><span>{basename(file).split('.').pop()?.toUpperCase()||'ARQ'}</span><p title={file}>{basename(file)}</p></li>)}</ul>{card.onOpen&&<button className="pixel-card-open" onClick={card.onOpen}>Abrir esta pasta</button>}</>}</section>)}</div>
 {children}{diagnostics}
 <footer className="pixel-result-footer"><div className="pixel-result-notes">{destination&&<p title={destination}><PixelSymbol kind="folder"/><span>{label}</span></p>}<p><PixelSymbol kind="shield"/><span>{note}</span></p></div><div className="pixel-result-actions">{onOpen&&<button className="button primary" onClick={onOpen}><PixelSymbol kind="folder"/>{openLabel}</button>}<button className="button secondary" onClick={onReset}><PixelSymbol kind="arrow"/>{resetLabel}</button></div></footer></section>;
}
