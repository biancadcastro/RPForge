/** Real plurals for counted text ("1 recurso", "2 recursos"). */
export function plural(count:number,one:string,many:string){return `${count.toLocaleString('pt-BR')} ${count===1?one:many}`;}
const kindNames:Record<string,string>={vehicle:'veículo',map:'mapa',animation:'animação',weapon:'arma',audio:'áudio',ped:'personagem',clothing:'roupas',stream:'arquivos de stream'};
/** Content kinds from the converter ("animation+map") as Portuguese labels ("Animação e mapa"). */
export function kindLabel(kind?:string){
 const names=(kind||'').split('+').filter(Boolean).map(part=>kindNames[part]||'conteúdo');
 const text=names.length>1?names.slice(0,-1).join(', ')+' e '+names[names.length-1]:names[0]||'conteúdo';
 return text.charAt(0).toLocaleUpperCase('pt-BR')+text.slice(1);
}
/** Same rules as src/output.js and src/spawns.js, checked while typing. */
export function folderNameProblem(value:string){
 if(!value.trim())return 'Informe um nome para a pasta.';
 if(value.length>100)return 'Use no máximo 100 caracteres.';
 if(!/^[a-z0-9_]+$/i.test(value))return 'Use somente letras sem acento, números e _ (sem espaços).';
 return '';
}
export function spawnProblem(value:string){
 if(!value)return 'Informe o nome no jogo.';
 if(!/^[a-z]/i.test(value))return 'Comece com uma letra.';
 if(value.length>63)return 'Use no máximo 63 caracteres.';
 if(!/^[a-z][a-z0-9_]*$/i.test(value))return 'Use somente letras sem acento, números e _ (sem espaços).';
 return '';
}
export const LOD_NAMES:Record<string,string>={high:'Alto',medium:'Médio',low:'Baixo',verylow:'Muito baixo'};
export const lodName=(value:string)=>LOD_NAMES[value]||value;
