import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {ClothingLaunchState,verifyClothingSelection} from '../desktop-web/electron/clothing-launch-state.mjs';
test('an old Explorer directory response cannot replace the newest destination',async()=>{
 const reads=new Map(),state=new ClothingLaunchState(folder=>new Promise(resolve=>reads.set(folder,resolve)));
 const a={mode:'quick',action:'obj',folder:'folder A'},b={mode:'quick',action:'neon',folder:'folder B'};
 const first=state.request(a);a.folder='mutated after request';const second=state.request(b);
 reads.get('folder B')({model:'B.ydd',texture:'B.ytd',destination:'folder B'});
 reads.get('folder A')({model:'A.ydd',texture:'A.ytd',destination:'folder A'});
 for(const value of await Promise.all([first,second])){assert.equal(value.folder,'folder B');assert.equal(value.action,'neon');assert.equal(value.clothing.destination,'folder B');}
 assert.equal(state.loading,false);
});
test('stale read failures cannot cancel a newer Explorer request',async()=>{
 let fail;const state=new ClothingLaunchState(folder=>folder==='old'?new Promise((_,reject)=>fail=reject):Promise.resolve({destination:folder}));
 const first=state.request({action:'obj',folder:'old'}),second=state.request({action:'obj',folder:'new'});
 fail(Error('old directory disappeared'));
 assert.equal((await first).folder,'new');assert.equal((await second).clothing.destination,'new');
});
test('conversion refuses a stale displayed source or destination instead of writing elsewhere',()=>{
 const current={model:path.resolve('B/piece.ydd'),texture:path.resolve('B/piece.ytd'),destination:path.resolve('B')};
 assert.doesNotThrow(()=>verifyClothingSelection(current,{...current}));
 assert.throws(()=>verifyClothingSelection(current,{...current,destination:path.resolve('A')}),/destino mudou/);
 assert.throws(()=>verifyClothingSelection(current,{...current,model:path.resolve('A/piece.ydd')}),/destino mudou/);
 assert.throws(()=>verifyClothingSelection(current,undefined),/destino mudou/);
});
