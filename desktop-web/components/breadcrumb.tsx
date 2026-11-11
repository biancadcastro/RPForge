"use client";
/** One trail for every tool page: Início / <group> / <tool>. */
export function Breadcrumb({group,current,onHome,disabled}:{group:string;current:string;onHome?:()=>void;disabled?:boolean}){
 return <nav className="breadcrumb" aria-label="Trilha">{onHome?<button onClick={onHome} disabled={disabled}>Início</button>:<span className="breadcrumb-item">Início</span>}<span aria-hidden="true">/</span><span className="breadcrumb-item">{group}</span><span aria-hidden="true">/</span><span className="breadcrumb-item" aria-current="page">{current}</span></nav>;
}
