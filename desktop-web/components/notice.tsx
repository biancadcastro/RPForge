"use client";
import type {ReactNode} from 'react';
import {PixelSymbol} from './result-icons';
import {splitUserMessage} from '../lib/user-message';
/** The one inline style for persistent messages tied to a field or step. */
export function Notice({tone='error',title,children,message,action,id,className=''}:{tone?:'error'|'warning'|'info'|'success';title?:string;children?:ReactNode;message?:string;action?:ReactNode;id?:string;className?:string}){
 const {message:text,detail}=splitUserMessage(message||'');
 return <div id={id} className={`notice notice--${tone} ${className}`} role={tone==='error'?'alert':'status'}>
  <PixelSymbol kind={tone==='error'?'error':tone==='warning'?'warning':tone==='success'?'check':'info'}/>
  <div>{title&&<strong>{title}</strong>}{text&&<p>{text}</p>}{children}{detail&&<details><summary>Detalhe técnico</summary><p>{detail}</p></details>}{action&&<div className="notice-action">{action}</div>}</div>
 </div>;
}
