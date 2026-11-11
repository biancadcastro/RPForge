"use client";
import {useEffect,useId,useRef} from 'react';
/** App-styled confirmation for destructive choices (replaces window.confirm). */
export function ConfirmDialog({title,message,confirmLabel,cancelLabel='Continuar editando',onConfirm,onCancel}:{title:string;message:string;confirmLabel:string;cancelLabel?:string;onConfirm:()=>void;onCancel:()=>void}){
 const id=useId(),cancel=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLElement>(null);
 useEffect(()=>{const previous=document.activeElement;cancel.current?.focus();
  const keys=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onCancel();return;}
   if(event.key!=='Tab'||!dialog.current)return;const buttons=Array.from(dialog.current.querySelectorAll('button'));const first=buttons[0],last=buttons[buttons.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};
  document.addEventListener('keydown',keys);return()=>{document.removeEventListener('keydown',keys);if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[onCancel]);
 return <div className="operation-overlay confirm-backdrop"><section ref={dialog} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={id+'t'} aria-describedby={id+'d'}>
  <h2 id={id+'t'}>{title}</h2><p id={id+'d'}>{message}</p>
  <div className="confirm-actions"><button ref={cancel} className="button secondary" onClick={onCancel}>{cancelLabel}</button><button className="button danger" onClick={onConfirm}>{confirmLabel}</button></div>
 </section></div>;
}
