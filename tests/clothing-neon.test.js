import test from 'node:test';
import assert from 'node:assert/strict';
import {neonIdentity,convertClothingNeon} from '../src/clothing-neon.js';
import {parseLaunch} from '../desktop-web/electron/launch.mjs';
import path from 'node:path';
const model=path.resolve('roupa/mp_f_freemode_01^jbib_014_u.ydd'),texture=path.resolve('roupa/mp_f_freemode_01^jbib_diff_014_a_uni.ytd');
test('Neon preserves identity and refuses protected sources without a manual confirmation gate',async()=>{
 assert.deepEqual(neonIdentity(model,texture,true),{prefix:'mp_f_freemode_01^',component:'jbib',sourceId:'014',suffix:'u',variation:'a_uni'});
 for(const folder of ['Pele','Completo','skin'])assert.throws(()=>neonIdentity(path.resolve(folder,path.basename(model)),texture,true),/preservadas/);
 assert.throws(()=>neonIdentity(model.replace('jbib_014','uppr_014'),' ',true),/Torso/);
 assert.throws(()=>neonIdentity(model,texture.replace('_014_','_015_'),true),/não corresponde/);
 assert.throws(()=>neonIdentity(model,texture.replace('mp_f_','mp_m_'),true),/não corresponde/);
});
test('Neon Explorer routes always use compact review for YDD and folder',()=>{
 assert.deepEqual(parseLaunch(['--neon',model]),{mode:'quick',action:'neon',folder:model});
 const folder=path.dirname(model);assert.deepEqual(parseLaunch(['--neon-folder',folder]),{mode:'quick',action:'neon',folder});
 assert.throws(()=>parseLaunch(['--neon',folder]),/YDD/);
});
