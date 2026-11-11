"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {Folder} from './icons';
import {userMessage} from '../lib/user-message';
import {Notice} from './notice';
export function OperationProgress({title,file,label,detail,onCancel}:{title:string;file:string;label?:string;detail:string;onCancel:()=>Promise<unknown>}){
 const id=useId(),button=useRef<HTMLButtonElement>(null),[cancelling,setCancelling]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const previous=document.activeElement;button.current?.focus();const trap=(event:KeyboardEvent)=>{if(event.key==='Tab'){event.preventDefault();button.current?.focus();}};document.addEventListener('keydown',trap);return()=>{document.removeEventListener('keydown',trap);if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 return <div className="skin-progress-backdrop operation-overlay"><section className="skin-progress-dialog operation-dialog" role="dialog" aria-modal="true" aria-labelledby={id}><div className="skin-progress-symbol" aria-hidden="true"><Folder/></div><h2 id={id}>{title}</h2><p className="skin-progress-file">{file}</p><div className="skin-progress-track" role="progressbar" aria-label={title+' em andamento'}><span/></div><p role="status">{cancelling?'Cancelando com segurança…':label||'Preparando os arquivos…'}</p><div className="skin-progress-detail">{detail}</div>{error&&<Notice message={error}/>}<button ref={button} className="button danger" disabled={cancelling} aria-busy={cancelling||undefined} onClick={()=>{setCancelling(true);void onCancel().catch(error=>{setCancelling(false);setError(userMessage(error));});}}>{cancelling?'Cancelando…':'Cancelar operação'}</button></section></div>;
}
