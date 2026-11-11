"use client";
import {useEffect,useState,type ReactNode} from 'react';
import type {DesktopBridge} from '../lib/desktop';
import {PageHeading} from './page-heading';
import {Breadcrumb} from './breadcrumb';
import {Notice} from './notice';
import {Arrow,Folder} from './icons';
const basename=(value:string)=>value.split(/[\\/]/).pop()||value;
export const CLOTHING_GROUP='Roupas';

/** Plan of the connected account; undefined while unknown (quick windows never ask). */
export function useProPlan(api:DesktopBridge|undefined,quick:boolean){
 const [pro,setPro]=useState<boolean>();
 useEffect(()=>{if(!api||quick)return;let live=true;const read=()=>void api.licenseInfo().then(info=>{if(live)setPro(info.plan==='pro');}).catch(()=>{if(live)setPro(undefined);});read();const off=api.onProfile(()=>read());return()=>{live=false;off();};},[api,quick]);
 return pro;
}

type Props={api?:DesktopBridge;busy:boolean;quick:boolean;pro?:boolean;title:string;description:string;onHome?:()=>void;
 model:string;texture:string;destination:string;candidates:string[];
 modelHint:string;destinationPlaceholder:string;extra?:ReactNode;note:string;actionLabel:string;onAction:()=>void;
 onChoose:(kind:'model'|'texture'|'destination')=>void;onCandidate:(file:string)=>void;
 emptyText:string;error:string;progress?:ReactNode;children?:ReactNode;idPrefix:string};
/** The one layout shared by Roupas para OBJ, Roupas para Neon and Separar pele. */
export function ClothingSetup(p:Props){
 return <>
  {!p.quick&&<Breadcrumb group={CLOTHING_GROUP} current={p.title} onHome={p.onHome} disabled={p.busy}/>}
  <PageHeading className="clothing-heading" title={p.title} description={p.description+(p.pro?'':' Exclusivo do plano Pro.')} aside={!p.quick&&<span className="file-badge">.ydd</span>}/>
  <div className="clothing-layout"><section className="clothing-config" aria-label={'Configuração: '+p.title}>
   <h2>Prepare sua peça</h2>
   {p.quick&&!p.model&&<p className="clothing-note">Selecione uma peça YDD desta pasta ou de uma subpasta para continuar.</p>}
   <label htmlFor={p.idPrefix+'-model'}>Peça de roupa <span>{p.modelHint}</span></label>
   <button id={p.idPrefix+'-model'} className="clothing-file" onClick={()=>p.onChoose('model')} disabled={!p.api||p.busy} title={p.model}><Folder/><span>{p.model?basename(p.model):'Selecionar peça YDD'}</span></button>
   {p.model&&<p className="clothing-source-path">Origem: {p.model}</p>}
   <label htmlFor={p.idPrefix+'-texture'}>Textura correspondente <span>YTD, opcional se estiver embutida no YDD</span></label>
   <button id={p.idPrefix+'-texture'} className="clothing-file" onClick={()=>p.onChoose('texture')} disabled={!p.api||p.busy||!p.model} title={p.texture}><Folder/><span>{p.texture?basename(p.texture):'Selecionar textura YTD'}</span></button>
   {p.candidates.length>1&&<><label htmlFor={p.idPrefix+'-variant'}>Variação de textura</label><select id={p.idPrefix+'-variant'} disabled={p.busy} value={p.candidates.includes(p.texture)?p.texture:''} onChange={e=>{if(e.target.value)p.onCandidate(e.target.value);}}><option value="">Escolha a variação</option>{p.candidates.map(file=><option key={file} value={file}>{basename(file)}</option>)}</select></>}
   {p.extra}
   <label htmlFor={p.idPrefix+'-destination'}>Pasta de destino</label>
   <button id={p.idPrefix+'-destination'} className="clothing-file" onClick={()=>p.onChoose('destination')} disabled={!p.api||p.busy} title={p.destination}><Folder/><span>{p.destination||p.destinationPlaceholder}</span></button>
   <p className="clothing-note">{p.note}</p>
   <button className="button primary" onClick={p.onAction} disabled={!p.api||p.busy||!p.model||!p.destination} aria-busy={p.busy||undefined}>{p.actionLabel} <Arrow/></button>
   {p.error&&<Notice message={p.error}/>}
   {p.children}
  </section><section className="clothing-delivery" aria-label="Resultado" hidden={p.quick}>
   <div className="clothing-empty"><img src="/brand/symbol.png" alt=""/><h2>Resultado</h2><p>{p.emptyText}</p></div>
  </section></div>
  {p.progress}
 </>;
}
