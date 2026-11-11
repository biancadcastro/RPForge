"use client";
import type {SkinResult as Result} from '../lib/desktop';
import {OperationResult} from './operation-result';
import {CLOTHING_GROUP} from './clothing-setup';
export function SkinResultScreen({result,quick,onHome,onOpen,onReset}:{result:Result;quick?:boolean;onHome?:()=>void;onOpen:()=>void;onReset:()=>void}){
 return <OperationResult group={CLOTHING_GROUP} tool="Separar pele" quick={quick} onHome={onHome} title="Separação concluída" description="A roupa e a pele foram salvas separadamente." cards={(['cloth','skin'] as const).map(role=>({title:role==='cloth'?'Roupa':'Pele',badge:'ID '+result.roles[role].id,folder:role==='cloth'?'Roupa/':'Pele/',files:[result.roles[role].model,...(result.roles[role].texture?[result.roles[role].texture!]:[])]}))} destination={result.output} onOpen={onOpen} onReset={onReset} resetLabel="Separar outra peça"/>;
}
