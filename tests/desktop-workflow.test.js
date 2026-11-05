import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Workflow } from '../desktop-web/electron/workflow.mjs';
import { parseLaunch } from '../desktop-web/electron/launch.mjs';
import { publicProfile } from '../desktop-web/electron/profile.mjs';

const item = (patch = {}) => ({ archive: 'dlc.rpf', ok: true, sourceHash: 'trusted-hash', exists: false, audit: { ok: true }, ...patch });
test('navbar profile includes only public nickname and a trusted avatar', () => {
  assert.deepEqual(publicProfile({ displayName: '  Pessoa  ', email: 'private@example.invalid', token: 'private', avatarUrl: 'https://cdn.discordapp.com/avatars/123/avatar.webp' }), { displayName: 'Pessoa', avatarUrl: 'https://cdn.discordapp.com/avatars/123/avatar.webp' });
  assert.equal(publicProfile({ displayName: '' }), null);
  for (const avatarUrl of ['file:///private', 'https://untrusted.invalid/avatar.png', 'javascript:alert(1)']) assert.equal(publicProfile({ displayName: 'Pessoa', avatarUrl }).avatarUrl, null);
});
test('desktop launch separates quick Explorer actions from the full app', () => {
  const folder = path.resolve('local folder & literal');
  assert.deepEqual(parseLaunch([]), { mode: 'full', action: 'preview', folder: '' });
  assert.deepEqual(parseLaunch([folder]), { mode: 'quick', action: 'preview', folder });
  assert.deepEqual(parseLaunch(['--ytyp', folder]), { mode: 'quick', action: 'ytyp', folder });
  assert.deepEqual(parseLaunch(['--configure', folder]), { mode: 'full', action: 'preview', folder });
  const model=path.join(folder,'mp_f_freemode_01^jbib_001_u.ydd');
  assert.deepEqual(parseLaunch(['--obj',model]), {mode:'quick',action:'obj',folder:model});
  assert.throws(()=>parseLaunch(['--obj']),/YDD/);
  assert.throws(()=>parseLaunch(['--obj',folder]),/YDD/);
  assert.deepEqual(parseLaunch(['--obj-folder',folder]),{mode:'quick',action:'obj',folder});
});
test('desktop conversion requires the current review and retains trusted hashes', async () => {
  const calls = [], flow = new Workflow(async (...args) => { calls.push(args); return [item()]; });
  await assert.rejects(flow.execute('convert', 'folder', {}, 'forged'), /Revise/);
  const choices = { 'dlc.rpf': { spawns: { car: 'MYCAR' }, expectedSource: 'untrusted' } };
  const review = await flow.execute('preview', 'folder', choices);
  choices['dlc.rpf'].spawns.car = 'MUTATED';
  await flow.execute('convert', 'folder', {}, review.reviewId);
  assert.equal(calls.at(-1)[2]['dlc.rpf'].expectedSource, 'trusted-hash');
  assert.equal(calls.at(-1)[2]['dlc.rpf'].spawns.car, 'MYCAR');
  await assert.rejects(flow.execute('convert', 'folder', {}, review.reviewId), /Revise/);
});
test('new previews invalidate old reviews and existing destinations require an explicit choice', async () => {
  const flow = new Workflow(async () => [item({ exists: true })]);
  const old = await flow.execute('preview', 'folder');
  const current = await flow.execute('preview', 'folder');
  await assert.rejects(flow.execute('convert', 'folder', {}, old.reviewId), /Revise/);
  await assert.rejects(flow.execute('convert', 'folder', {}, current.reviewId), /pasta existente/);
  const approved = await flow.execute('preview', 'folder', { 'dlc.rpf': { existing: 'backup' } });
  await flow.execute('convert', 'folder', {}, approved.reviewId);
});
test('failed previews cannot leave a stale review and concurrent operations are refused', async () => {
  let release;
  const flow = new Workflow(() => new Promise(resolve => { release = resolve; }));
  const pending = flow.execute('preview', 'folder');
  assert.equal(flow.busy, true);
  await assert.rejects(flow.execute('ytyp', 'folder'), /Aguarde/);
  release([item()]); await pending;
  flow.run = async () => { throw new Error('broken source'); };
  await assert.rejects(flow.execute('preview', 'folder'), /broken source/);
  assert.equal(flow.review, null); assert.equal(flow.busy, false);
});
