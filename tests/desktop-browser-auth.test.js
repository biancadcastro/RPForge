import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NativeAuth } from '../desktop-web/electron/native-auth.mjs';

const grant = { id: '12345678-1234-4234-8234-123456789abc', deviceCode: 'a'.repeat(64), expiresIn: 600, interval: 5 };
const profile = { displayName: 'Conta autorizada', avatarUrl: null };
const json = (body, status=200) => new Response(JSON.stringify(body), {status});

for (const provider of ['discord', 'google', 'github']) {
  test(`${provider}: external browser, PKCE exchange and public identity only`, async () => {
    const requests=[], opened=[], states=[], profiles=[];
    let saved, scheduled, polls=0;
    const client = new NativeAuth({
      fetcher: async (url, options) => {
        const body=JSON.parse(options.body); requests.push({url,body,headers:options.headers});
        if (url.endsWith('/authorizations')) return json(grant,201);
        if (++polls===1) return json({status:'authorization_pending'},202);
        return json({installationId:requests[0].body.installationId,refreshToken:'secret-token',profile:{...profile,email:'private@example.invalid'}});
      },
      openExternal:async url=>opened.push(url),
      storage:{read:async()=>null,write:async value=>{saved=value;}},
      onState:value=>states.push(value),onProfile:value=>profiles.push(value),
      delay:callback=>{scheduled=callback;return 1;},clearDelay:()=>{},
    });
    await client.begin(provider);
    assert.deepEqual(opened,[`https://api.rpforge.dev/v1/auth/oauth/${provider}/start?desktop=${grant.id}`]);
    assert.equal(client.state.status,'waiting');
    await client.begin(provider); assert.equal(opened.length,1);
    assert.equal(typeof scheduled,'function');
    await client.poll(client.pending);
    assert.equal(client.state.status,'waiting');
    await client.poll(client.pending);
    assert.equal(client.state.status,'connected');
    const exchange=requests.find(item=>item.url.endsWith('/token'));
    assert.equal(createHash('sha256').update(exchange.body.verifier).digest('base64url'),requests[0].body.challenge);
    assert.equal(requests[0].headers.Origin,undefined);
    assert.match(saved.privateKey,/BEGIN PRIVATE KEY/);
    assert.equal(saved.refreshToken,'secret-token');
    assert.deepEqual(profiles,[profile]);
    assert.equal(JSON.stringify(states).includes('secret-token'),false);
    assert.equal(JSON.stringify(profiles).includes('private@example.invalid'),false);
  });
}

test('cancel during browser opening does not restart polling',async()=>{
  let opened, release, timers=0;
  const opening=new Promise(resolve=>{release=resolve;});
  const client=new NativeAuth({fetcher:async()=>json(grant,201),openExternal:async()=>{opened=true;await opening;},storage:{read:async()=>null,write:async()=>{}},delay:()=>{timers++;},clearDelay:()=>{}});
  const start=client.begin('google');
  while(!opened)await new Promise(resolve=>setImmediate(resolve));
  client.cancel();release();await start;
  assert.equal(timers,0);assert.equal(client.state.status,'idle');
});

test('concurrent profile reads share renewal and revoked sessions are cleared',async()=>{
  let calls=0,cleared=0;
  const {generateKeyPairSync}=await import('node:crypto');
  const keys=generateKeyPairSync('rsa',{modulusLength:3072});
  const client=new NativeAuth({fetcher:async()=>{calls++;return json({code:'DESKTOP_AUTHENTICATION_REQUIRED'},401);},storage:{read:async()=>({refreshToken:'old-token',privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'}),profile,checkedAt:1}),write:async()=>{},clear:async()=>{cleared++;}},openExternal:async()=>{}});
  assert.deepEqual(await Promise.all([client.profile(),client.profile()]),[null,null]);
  assert.equal(calls,1);assert.equal(cleared,1);
  assert.equal(await client.profile(),null);
});

test('an empty initial session read is retried instead of being cached until restart',async()=>{
 let calls=0;const record={refreshToken:'saved-session',profile,checkedAt:Date.now()};
 const client=new NativeAuth({storage:{read:async()=>++calls===1?null:record}});
 assert.equal(await client.load(),null);assert.equal(await client.load(),record);assert.equal(calls,2);
 assert.equal(await client.load(),record);assert.equal(calls,2);
});
test('concurrent session loads share one read and cannot replace a renewed record',async()=>{
 let resolve,calls=0;const pending=new Promise(r=>{resolve=r;}),client=new NativeAuth({storage:{read:()=>{calls++;return pending;}}});
 const first=client.load(),second=client.load(),record={refreshToken:'stored'};resolve(record);
 assert.deepEqual(await Promise.all([first,second]),[record,record]);assert.equal(calls,1);
 const renewed={refreshToken:'renewed'};client.record=renewed;assert.equal(await client.load(),renewed);
});
