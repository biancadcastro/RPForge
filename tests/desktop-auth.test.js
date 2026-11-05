import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient } from '../desktop-web/electron/auth.mjs';

test('integrated sign-in returns only MFA state, not server session fields', async () => {
  const requests = [];
  const client = createAuthClient(async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ csrfToken: 'private-session-field' }));
  });
  assert.deepEqual(await client.login({ email: ' test@example.invalid ', password: 'synthetic-password' }), { mfaRequired: false });
  assert.equal(requests[0].url, 'https://api.rpforge.dev/v1/auth/login');
  assert.equal(requests[0].options.credentials, 'include');
  assert.equal(JSON.parse(requests[0].options.body).email, 'test@example.invalid');
});
test('integrated sign-in forwards MFA challenge and verifies only valid codes', async () => {
  let calls = 0;
  const challengeToken = 'a'.repeat(64);
  const client = createAuthClient(async url => {
    calls++;
    return url.endsWith('/login') ? new Response(JSON.stringify({ mfaRequired: true, challengeToken }), { status: 202 }) : new Response(null, { status: 204 });
  });
  assert.deepEqual(await client.login({ email: 'test@example.invalid', password: 'synthetic' }), { mfaRequired: true, challengeToken });
  await assert.rejects(client.verify({ challengeToken, code: 'bad' }), /código/);
  assert.equal(calls, 1);
  await client.verify({ challengeToken, code: '123456' });
  assert.equal(calls, 2);
});
test('integrated sign-in shows actionable errors without raw server internals', async () => {
  const denied = createAuthClient(async () => new Response(JSON.stringify({ code: 'INVALID_CREDENTIALS', stack: 'private-internals' }), { status: 401 }));
  await assert.rejects(denied.login({ email: 'test@example.invalid', password: 'synthetic' }), /Confira o e-mail e a senha/);
  const offline = createAuthClient(async () => { throw new Error('private-network-details'); });
  await assert.rejects(offline.options(), /Confira sua conexão/);
});
