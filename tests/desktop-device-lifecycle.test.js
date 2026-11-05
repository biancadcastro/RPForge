import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicKey, generateKeyPairSync, verify} from 'node:crypto';
import {NativeAuth} from '../desktop-web/electron/native-auth.mjs';

const profile = {displayName: 'Conta de teste', avatarUrl: null};
const response = (data, status = 200) => new Response(JSON.stringify(data), {status});
function storage(initial = null) {
  let value = initial;
  return {read: async () => value, write: async next => { value = structuredClone(next); },
    clear: async () => { throw Error('The durable device identity must not be deleted'); }};
}
function record() {
  const keys = generateKeyPairSync('rsa', {modulusLength: 3072});
  return {installationId: '12345678-1234-4234-8234-123456789abc',
    privateKey: keys.privateKey.export({type: 'pkcs8', format: 'pem'}),
    refreshToken: 'old', checkedAt: Date.now() - 61000, profile, license: 'cached'};
}
const grant = () => ({id: crypto.randomUUID(), deviceCode: 'a'.repeat(64), interval: 5, expiresIn: 600});

test('ten reconnections and a process restart preserve one installation key and sign every activation', async () => {
  const store = storage(), ids = [], keys = [], proofs = [];
  const options = {storage: store, openExternal: async () => {}, delay: () => 0, clearDelay: () => {},
    fetcher: async (url, options) => {
      const body = JSON.parse(options.body);
      if (url.endsWith('/authorizations')) { ids.push(body.installationId); keys.push(body.publicKey); return response(grant(), 201); }
      proofs.push(body);
      return response({refreshToken: 'session-' + proofs.length, profile});
    }};
  let client = new NativeAuth(options);
  for (let i = 0; i < 10; i++) {
    if (i === 5) client = new NativeAuth(options);
    await client.begin('discord'); await client.poll(client.pending);
  }
  assert.equal(new Set(ids).size, 1);
  assert.equal(new Set(keys.map(key => key.n)).size, 1);
  for (const proof of proofs) assert.equal(verify('sha256',
    Buffer.from(`rpforge-activate-v1\n${proof.deviceCode}\n${proof.verifier}`),
    createPublicKey({key: keys[0], format: 'jwk'}), Buffer.from(proof.signature, 'base64url')), true);
});

test('a lost renewal response retries the persisted signed request, including after restart', async () => {
  const store = storage(record()), requests = [];
  const options = {storage: store, fetcher: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) throw Error('Lost response after commit');
    return response({refreshToken: 'recovered', license: 'new', profile});
  }};
  await new NativeAuth(options).profile();
  assert.ok((await store.read()).pendingRenewal);
  await new NativeAuth(options).profile();
  assert.deepEqual(requests[0], requests[1]);
  assert.equal((await store.read()).refreshToken, 'recovered');
  assert.equal((await store.read()).pendingRenewal, undefined);
});

test('clock and invalid-proof failures keep the identity and session and allow a fresh proof', async () => {
  for (const [code, status] of [['DEVICE_CLOCK_SKEW', 409], ['INVALID_DEVICE_PROOF', 401]]) {
    const original = record(), store = storage(original);
    const client = new NativeAuth({storage: store, fetcher: async () => response({code}, status)});
    await client.profile();
    assert.equal((await store.read()).installationId, original.installationId);
    assert.equal((await store.read()).privateKey, original.privateKey);
    assert.equal((await store.read()).refreshToken, original.refreshToken);
    assert.equal((await store.read()).pendingRenewal, undefined);
    assert.equal(client.lastLicenseIssue, 'clock');
  }
});

test('temporary OAuth polling failures retain the authorization and recover without another seat', async () => {
  const store = storage(), states = []; let polls = 0, grants = 0;
  const client = new NativeAuth({storage: store, delay: () => 0, clearDelay: () => {}, openExternal: async () => {},
    onState: state => states.push(state), fetcher: async url => {
      if (url.endsWith('/authorizations')) { grants++; return response(grant(), 201); }
      if (++polls === 1) return response({}, 503);
      return response({refreshToken: 'recovered', profile});
    }});
  await client.begin('google'); await client.poll(client.pending);
  assert.equal(client.state.status, 'waiting'); assert.ok(client.pending);
  await client.poll(client.pending);
  assert.equal(client.state.status, 'connected'); assert.equal(grants, 1);
  assert.equal(states.some(state => state.status === 'error'), false);
});

test('password and MFA establish the native session without storing the password', async () => {
  const store = storage(), requests = [];
  const client = new NativeAuth({storage: store, fetcher: async (url, options) => {
    requests.push({url, body: JSON.parse(options.body)});
    if (url.endsWith('/authorizations')) return response(grant(), 201);
    if (url.endsWith('/login')) return response({mfaRequired: true, challengeToken: 'b'.repeat(64)}, 202);
    return response({refreshToken: 'native-session', profile});
  }});
  assert.equal((await client.signIn('person@example.invalid', 'private-password')).mfaRequired, true);
  assert.equal(JSON.stringify(await store.read()).includes('private-password'), false);
  await client.verifyMfa('b'.repeat(64), '123456');
  assert.equal((await store.read()).refreshToken, 'native-session');
  assert.equal(requests.every(request => !request.url.includes('/v1/auth/login')), true);
  assert.equal(requests[1].body.signature, requests[2].body.signature);
});

test('a pending activation survives restart and is recovered without another grant', async () => {
  const store = storage(); let grants = 0;
  const options = {storage: store, delay: () => 0, clearDelay: () => {}, openExternal: async () => {}, fetcher: async url => {
    if (url.endsWith('/authorizations')) { grants++; return response(grant(), 201); }
    return response({refreshToken: 'recovered', profile});
  }};
  await new NativeAuth(options).begin('github');
  const restarted = new NativeAuth(options); await restarted.resume();
  assert.equal(grants, 1); assert.equal(restarted.state.status, 'connected');
  assert.equal((await store.read()).pendingAuthorization, undefined);
});

test('disconnect releases the session but preserves the key for future reauthorization', async () => {
  const original = record(), store = storage(original); let endpoint;
  const client = new NativeAuth({storage: store, fetcher: async url => { endpoint = url; return new Response(null, {status: 204}); }});
  await client.disconnect();
  assert.ok(endpoint.endsWith('/v1/desktop/disconnect'));
  assert.equal((await store.read()).installationId, original.installationId);
  assert.equal((await store.read()).refreshToken, undefined);
});
test('closing the app suspends MFA without deleting its pending authorization; explicit cancellation deletes it', async () => {
  const store=storage();let grants=0;
  const options={storage:store,fetcher:async url=>{
    if(url.endsWith('/authorizations')){grants++;return response(grant(),201);}
    if(url.endsWith('/login'))return response({mfaRequired:true,challengeToken:'b'.repeat(64)},202);
    return response({refreshToken:'mfa-completed',profile});
  }};
  const client=new NativeAuth(options);await client.signIn('person@example.invalid','private-password');
  const saved=structuredClone(await store.read()),controller=client.pending.controller;
  client.suspend();assert.equal(controller.signal.aborted,true);assert.equal(client.pending,null);
  assert.deepEqual(await store.read(),saved);
  const restarted=new NativeAuth(options);
  assert.equal((await restarted.resume()).challengeToken,'b'.repeat(64));
  await restarted.verifyMfa('b'.repeat(64),'123456');assert.equal(grants,1);
  assert.equal((await store.read()).refreshToken,'mfa-completed');
  await restarted.signIn('person@example.invalid','private-password');await restarted.cancel();
  assert.equal((await store.read()).pendingAuthorization,undefined);
  assert.equal((await store.read()).installationId,saved.installationId);
});
