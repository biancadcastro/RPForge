import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {skinIdentity,skinOverrides,separateClothingSkin} from '../src/clothing-skin.js';import {parseLaunch} from '../desktop-web/electron/launch.mjs';
test('skin separation accepts the complete montage and preserves collection identity',()=>{
 const model=path.resolve('Completo/mp_f_freemode_01^lowr_016_r.ydd'),texture=path.resolve('Completo/mp_f_freemode_01^lowr_diff_016_a_whi.ytd');
 assert.deepEqual(skinIdentity(model,texture),{prefix:'mp_f_freemode_01^',component:'lowr',sourceId:'016',suffix:'r',variation:'a_whi'});
 assert.throws(()=>skinIdentity(model,texture.replace('_016_','_099_')),/não corresponde/);
 assert.deepEqual(parseLaunch(['--skin',model]),{mode:'quick',action:'skin',folder:model});
 assert.deepEqual(parseLaunch(['--skin-folder',path.dirname(model)]),{mode:'quick',action:'skin',folder:path.dirname(model)});
});
test('manual face selections have a bounded schema and cannot carry paths',()=>{
 assert.deepEqual(skinOverrides({'high:0:12':'skin','low:1:3':'cloth'}),{'high:0:12':'skin','low:1:3':'cloth'});
 for(const value of [{'/outside':'skin'},{'high:0:1':'neon'},{'wrong:0:1':'skin'},[]])assert.throws(()=>skinOverrides(value),/inválida/);
});
