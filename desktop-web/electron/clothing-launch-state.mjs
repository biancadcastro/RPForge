import path from 'node:path';

// A later Explorer request always wins, even when an earlier directory read
// finishes last. Each resolver receives an immutable copy of its own request.
export class ClothingLaunchState {
  constructor(load){this.load=load;this.revision=0;this.loading=false;this.pending=Promise.resolve(null);}
  request(launch){
    const snapshot=structuredClone(launch),revision=++this.revision;
    this.loading=true;
    this.pending=(async()=>{
      try{
        const clothing=await this.load(snapshot.folder);
        if(revision!==this.revision)return null;
        return {...snapshot,clothing,requestId:revision};
      }catch(error){if(revision!==this.revision)return null;throw error;
      }finally{if(revision===this.revision)this.loading=false;}
    })();
    return this.ready();
  }
  reset(launch){this.revision++;this.loading=false;this.pending=Promise.resolve({...structuredClone(launch),requestId:this.revision});}
  async ready(){for(;;){const pending=this.pending;const result=await pending;if(pending===this.pending)return result;}}
}

export function verifyClothingSelection(current,shown){
  if(!current?.model||!current?.destination)throw Error('Selecione a peça e a pasta de destino no aplicativo.');
  if(!shown||['model','texture','destination'].some(key=>{
    const expected=current[key]||'',actual=shown[key]||'';
    return typeof actual!=='string'||(!expected||!actual ? expected!==actual : path.resolve(expected)!==path.resolve(actual));
  }))throw Error('A origem ou o destino mudou. Aguarde a atualização da janela e confira a pasta antes de continuar.');
}
