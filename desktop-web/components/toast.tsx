"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {PixelSymbol} from './result-icons';
import {splitUserMessage} from '../lib/user-message';

export type ToastTone='info'|'success'|'warning'|'error';
export type ToastInput={tone?:ToastTone;title:string;message?:string;action?:{label:string;onClick:()=>void}};
type ToastItem=ToastInput&{id:number;tone:ToastTone};
const ToastContext=createContext<(toast:ToastInput)=>void>(()=>{});
const icons:Record<ToastTone,'info'|'check'|'warning'|'error'>={info:'info',success:'check',warning:'warning',error:'error'};
const LIMIT=3,DURATION=6000;

/** Brand toast for transient feedback. Errors stay until closed; others leave after ~6s, pausing on hover or focus. */
export function ToastProvider({children}:{children:ReactNode}){
 const [items,setItems]=useState<ToastItem[]>([]);const next=useRef(1);
 const dismiss=useCallback((id:number)=>setItems(list=>list.filter(item=>item.id!==id)),[]);
 const show=useCallback((toast:ToastInput)=>{
  const item:ToastItem={...toast,tone:toast.tone??'info',id:next.current++};
  setItems(list=>{const same=list.find(entry=>entry.title===item.title&&entry.message===item.message);return [...list.filter(entry=>entry!==same),item].slice(-LIMIT);});
 },[]);
 return <ToastContext.Provider value={show}>{children}
  <div className="toast-region">
   <div aria-live="polite" aria-relevant="additions">{items.filter(item=>item.tone!=='error').map(item=><Toast key={item.id} item={item} onClose={()=>dismiss(item.id)}/>)}</div>
   <div aria-live="assertive" aria-relevant="additions">{items.filter(item=>item.tone==='error').map(item=><Toast key={item.id} item={item} onClose={()=>dismiss(item.id)}/>)}</div>
  </div>
 </ToastContext.Provider>;
}
function Toast({item,onClose}:{item:ToastItem;onClose:()=>void}){
 const [paused,setPaused]=useState(false),remaining=useRef(DURATION),started=useRef(Date.now());
 useEffect(()=>{
  if(item.tone==='error'||paused)return;
  started.current=Date.now();
  const timer=setTimeout(onClose,remaining.current);
  return()=>{clearTimeout(timer);remaining.current=Math.max(1200,remaining.current-(Date.now()-started.current));};
 },[item.tone,paused,onClose]);
 const {message,detail}=useMemo(()=>splitUserMessage(item.message||''),[item.message]);
 return <section className={'toast toast--'+item.tone} role={item.tone==='error'?'alert':'status'} aria-label={item.title}
  onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setPaused(false);}}>
  <span className="toast-icon"><PixelSymbol kind={icons[item.tone]}/></span>
  <div className="toast-copy"><strong>{item.title}</strong>{message&&<p>{message}</p>}{detail&&<details><summary>Detalhe técnico</summary><p>{detail}</p></details>}
   {item.action&&<button className="button ghost toast-action" onClick={()=>{item.action!.onClick();onClose();}}>{item.action.label}</button>}</div>
  <button className="toast-close" aria-label="Fechar notificação" onClick={onClose}><PixelSymbol kind="close"/></button>
 </section>;
}
export function useToast(){return useContext(ToastContext);}
