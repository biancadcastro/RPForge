import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { readdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writePlan } from '../src/output.js';
import { convertFolder } from '../src/convert.js';
import { vehicleArchive } from './fixture.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'RPForge ação & espaços-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = path.join(root, 'original.rpf');
  await writeFile(archive, 'original bytes');
  await mkdir(path.join(root, 'CAR'));
  await writeFile(path.join(root, 'CAR', 'personal.txt'), 'keep');
  return { root, plan: { archive, defaultName: 'CAR', files: new Map([['one', { destination:'stream/CAR.yft', data:Buffer.from('new model') }]]) } };
}
async function preserved(root) {
  assert.equal(await readFile(path.join(root, 'CAR/personal.txt'), 'utf8'), 'keep');
  assert.equal(await readFile(path.join(root, 'original.rpf'), 'utf8'), 'original bytes');
  assert.deepEqual((await readdir(root)).sort(), ['CAR', 'original.rpf']);
}
test('user cancellation preserves original output and archive without staging', async t => {
  const { root, plan } = await fixture(t);
  await assert.rejects(writePlan(plan, { chooseOutput: async () => ({action:'cancel'}) }), { code:'CANCELLED' });
  await preserved(root);
});
test('write failure cleans staging and never moves the previous addon', async t => {
  const { root, plan } = await fixture(t);
  await assert.rejects(writePlan(plan, { existing:'backup', onProgress() { throw new Error('write interrupted'); } }), /write interrupted/);
  await preserved(root);
});
test('corrupt staged data is rejected before replacing an addon', async t => {
  const { root, plan } = await fixture(t);
  await assert.rejects(writePlan(plan, { existing:'backup', onProgress(event) {
    if (event.phase === 'write') {
      const stage = readdirSync(root).find(name => name.startsWith('.rpforge-'));
      writeFileSync(path.join(root, stage, event.label), 'corrupt');
    }
  } }), /verificação/);
  await preserved(root);
});
test('publish failure restores the backup and cleans staging', async t => {
  const { root, plan } = await fixture(t);
  await assert.rejects(writePlan(plan, { existing:'backup', onProgress(event) {
    if (event.phase === 'verify') {
      const stage = readdirSync(root).find(name => name.startsWith('.rpforge-'));
      rmSync(path.join(root, stage), { recursive:true });
    }
  } }));
  await preserved(root);
});
test('a corrupt RPF does not prevent a later valid RPF from converting', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'RPForge mixed-'));
  t.after(() => rm(root, { recursive:true, force:true }));
  await writeFile(path.join(root, 'a.rpf'), 'corrupt');
  const valid = vehicleArchive(); await writeFile(path.join(root, 'b.rpf'), valid);
  const results = await convertFolder(root);
  assert.equal(results.length, 2); assert.equal(results[0].ok, false); assert.equal(results[1].ok, true, results[1].error);
  assert.deepEqual(await readFile(path.join(root, 'b.rpf')), valid);
  assert.ok(!(await readdir(root)).some(name => name.startsWith('.rpforge-')));
});
