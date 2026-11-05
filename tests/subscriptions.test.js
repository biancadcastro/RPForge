import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyLicense,requireToolAccess} from '../desktop-web/electron/license.mjs';
import {NativeAuth} from '../desktop-web/electron/native-auth.mjs';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:3072});
const keys=[{...publicKey.export({format:'jwk'}),kid:'test',alg:'RS256'}];
const now=Date.now(), seconds=Math.floor(now/1000);
const claims={v:1,iss:'https://api.rpforge.dev',aud:'rpforge-desktop',sub:'user',installationId:'device',plan:'pro',capabilities:['clothing.obj','clothing.neon','clothing.skin'],iat:seconds,nbf:seconds,exp:seconds+3600};
function token(value=claims){
  const payload=[{alg:'RS256',kid:'test',typ:'rpforge-license+jwt'},value].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return payload+'.'+sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url');
}
test('Pro license requires signature, installation, issuer, audience and validity',()=>{
  assert.equal(verifyLicense(token(),keys,'device',now).plan,'pro');
  for(const changed of [{exp:seconds},{nbf:seconds+30},{iat:seconds+30},{iss:'other'},{aud:'other'},{installationId:'copied'},{exp:seconds+73*3600}])
    assert.equal(verifyLicense(token({...claims,...changed}),keys,'device',now),null);
  assert.equal(verifyLicense(token(),[],'device',now),null);
  const parts=token().split('.');parts[1]=Buffer.from(JSON.stringify({...claims,sub:'forged'})).toString('base64url');
  assert.equal(verifyLicense(parts.join('.'),keys,'device',now),null);
});
test('Free stays offline and all clothing actions require Pro and their capability',async()=>{
  await requireToolAccess('convert',{license(){throw Error('Free must not contact licensing');}});
  for(const action of ['clothing','neon','skin-inspect','skin-split']){
    await assert.rejects(requireToolAccess(action,{license:async()=>null}),/Pro/);
    await assert.rejects(requireToolAccess(action,{license:async()=>({...claims,plan:'free'})}),/Pro/);
    await assert.rejects(requireToolAccess(action,{license:async()=>({...claims,capabilities:[]})}),/Pro/);
    await requireToolAccess(action,{license:async()=>claims});
  }
});
test('native session renews before paid access and verifies keys from the API',async()=>{
  const record={refreshToken:'refresh',installationId:'device',privateKey:privateKey.export({format:'pem',type:'pkcs8'}),checkedAt:now,profile:{displayName:'Test'}};
  const calls=[];
  const client=new NativeAuth({now:()=>now,storage:{read:async()=>record,write:async()=>{}},fetcher:async url=>{
    calls.push(url);
    return new Response(JSON.stringify(url.endsWith('/keys')?{keys}:{license:token(),refreshToken:'next',profile:record.profile}));
  }});
  assert.equal((await client.license()).plan,'pro');
  assert.equal(calls.length,2);
  assert.equal((await client.license()).plan,'pro');
  assert.equal(calls.length,2);
});

test('paid operation updates menu presentation with the exact enforced license',async()=>{
 for(const license of [null,{plan:'free',capabilities:[]},{plan:'pro',capabilities:['clothing.skin']}]){
  const seen=[],operation=requireToolAccess('skin-inspect',{license:async()=>license},async value=>seen.push(value));
  if(license?.plan==='pro')await operation;else await assert.rejects(operation,/Pro/);
  assert.deepEqual(seen,[license]);
 }
 let called=false;await requireToolAccess('convert',{license(){throw Error('Free action must remain independent');}},()=>{called=true;});assert.equal(called,false);
});

test('public signing keys survive restart and allow verified Pro during a key endpoint outage',async()=>{
 let saved={refreshToken:'refresh',installationId:'device',privateKey:privateKey.export({format:'pem',type:'pkcs8'}),checkedAt:now,profile:{displayName:'Test'},license:token()};
 const storage={read:async()=>saved,write:async record=>{saved=record;}};
 const first=new NativeAuth({now:()=>now,storage,fetcher:async()=>new Response(JSON.stringify({keys}))});
 assert.equal((await first.license()).plan,'pro');assert.equal(saved.licenseKeys.length,1);
 let network=0;const restarted=new NativeAuth({now:()=>now,storage,fetcher:async()=>{network++;throw Error('network unavailable');}});
 assert.equal((await restarted.license()).plan,'pro');assert.equal(network,0);
 saved={...saved,license:token({...claims,plan:'free',capabilities:[]})};const free=new NativeAuth({now:()=>now,storage,fetcher:async()=>{throw Error('offline');}});
 assert.equal((await free.license()).plan,'free');await assert.rejects(requireToolAccess('skin-inspect',free),/Pro/);
});

test('two independent processes serialize rotation and reread the latest encrypted session',async()=>{
 const {encryptedSessionStorage}=await import('../desktop-web/electron/session-storage.mjs');
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const directory=await mkdtemp(join(tmpdir(),'rpforge-auth-rotation-'));
 const secure={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async s=>Buffer.from(s),decryptStringAsync:async b=>({result:b.toString()})};
 const storeA=encryptedSessionStorage(directory,secure),storeB=encryptedSessionStorage(directory,secure);let clock=now,active='r0',rotations=0,reuses=0;
 await storeA.write({refreshToken:active,installationId:'device',privateKey:privateKey.export({format:'pem',type:'pkcs8'}),checkedAt:now-61000,profile:{displayName:'Test'},license:token(),licenseKeys:keys});
 const fetcher=async(url,options)=>{assert.ok(url.endsWith('/renew'));const input=JSON.parse(options.body);if(input.refreshToken!==active){reuses++;return new Response(JSON.stringify({code:'DESKTOP_TOKEN_REUSED'}),{status:401});}await new Promise(r=>setTimeout(r,35));active='r'+(++rotations);return new Response(JSON.stringify({license:token(),refreshToken:active,profile:{displayName:'Test'}}));};
 const a=new NativeAuth({now:()=>clock,storage:storeA,fetcher}),b=new NativeAuth({now:()=>clock,storage:storeB,fetcher});
 try{await Promise.all([a.load(),b.load()]);for(let round=1;round<=3;round++){assert.deepEqual((await Promise.all([a.license(),b.license(),a.license()])).map(l=>l.plan),['pro','pro','pro']);assert.equal(rotations,round);assert.equal((await storeA.read()).refreshToken,active);clock+=61000;}assert.equal(reuses,0);}finally{await rm(directory,{recursive:true,force:true});}
});

test('a failed save never causes the consumed refresh token to be sent again',async()=>{
 let saved={refreshToken:'old',installationId:'device',privateKey:privateKey.export({format:'pem',type:'pkcs8'}),checkedAt:now-61000,profile:{displayName:'Test'},license:token(),licenseKeys:keys},fail=true,renewals=0;
 const storage={read:async()=>saved,write:async value=>{if(fail&&value.refreshToken==='new'){fail=false;throw Error('disk busy');}saved=value;}};
 const client=new NativeAuth({now:()=>now,storage,fetcher:async()=>{renewals++;return new Response(JSON.stringify({license:token(),refreshToken:'new',profile:{displayName:'Test'}}));}});
 await assert.rejects(client.license(),/salvar/);assert.equal(client.record.refreshToken,'new');assert.equal(saved.refreshToken,'old');
 assert.equal((await client.license()).plan,'pro');assert.equal(renewals,1);assert.equal(saved.refreshToken,'new');
});

test('revocation invalidates even a signed cached Pro license, while outages do not claim Free',async()=>{
 let cleared=0;const record={refreshToken:'refresh',installationId:'device',privateKey:privateKey.export({format:'pem',type:'pkcs8'}),checkedAt:now-61000,profile:{displayName:'Test'},license:token(),licenseKeys:keys};
 const revoked=new NativeAuth({now:()=>now,storage:{read:async()=>record,write:async value=>{if(!value.refreshToken)cleared++;}},fetcher:async()=>new Response(JSON.stringify({code:'DESKTOP_AUTHENTICATION_REQUIRED'}),{status:401})});
 assert.equal(await revoked.license(),null);assert.equal(cleared,1);assert.equal(revoked.record.installationId,'device');assert.equal(revoked.lastLicenseIssue,'revoked');
 await assert.rejects(requireToolAccess('skin-inspect',revoked),/sessão|autorização/);
 const outage=new NativeAuth({now:()=>now,storage:{read:async()=>({...record,checkedAt:now,licenseKeys:undefined})},fetcher:async()=>{throw Error('offline');}});
 await assert.rejects(requireToolAccess('skin-inspect',outage),/validar sua licença/);
});

test('a newly connected encrypted session replaces the previous in-memory account',async()=>{
 const old={refreshToken:'old',installationId:'previous',privateKey:'old-key',checkedAt:now,profile:{displayName:'Previous'}};
 const current={refreshToken:'current',installationId:'device',privateKey:privateKey.export({format:'pem',type:'pkcs8'}),checkedAt:now,profile:{displayName:'Current'},license:token(),licenseKeys:keys};
 const client=new NativeAuth({now:()=>now,storage:{read:async()=>current,withLock:async operation=>operation()},fetcher:async()=>{throw Error('A current session must not renew the previous account');}});client.loaded=true;client.record=old;
 assert.equal((await client.license()).plan,'pro');assert.equal(client.record.installationId,'device');assert.equal((await client.profile()).displayName,'Current');
});

test('first desktop authorization renews immediately even when the stored profile is fresh',async()=>{
 let saved={refreshToken:'first-session',installationId:'device',privateKey:privateKey.export({format:'pem',type:'pkcs8'}),checkedAt:now,profile:{displayName:'Test'}},renewals=0;
 const storage={read:async()=>structuredClone(saved),write:async record=>{saved=structuredClone(record);},withLock:async operation=>operation()};
 const client=new NativeAuth({now:()=>now,storage,fetcher:async url=>{if(url.endsWith('/keys'))return new Response(JSON.stringify({keys}));renewals++;return new Response(JSON.stringify({license:token(),refreshToken:'rotated',profile:saved.profile}));}});
 assert.equal((await client.license()).plan,'pro');assert.equal(renewals,1);assert.equal(saved.refreshToken,'rotated');assert.ok(saved.license);
});
