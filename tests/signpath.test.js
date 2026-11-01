import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { DOMParser } from '@xmldom/xmldom';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');
test('signing stays disabled and is limited to manual reviewed first-party artifacts', async () => {
  const config = JSON.parse(await read('signpath/project.json'));
  assert.equal(config.enabled, false);
  assert.equal(config.approvedByFoundation, false);
  assert.equal(config.manualApprovalRequired, true);
  const workflow = parse(await read('.github/workflows/signpath-build.yml'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch.inputs.request_signing.default, false);
  assert.equal(workflow.permissions.contents, 'read');
  const signing = workflow.jobs['request-signing'];
  assert.equal(signing.environment, 'signpath-signing');
  assert.match(signing.if, /inputs.request_signing/);
  assert.match(signing.if, /SIGNPATH_ENABLED/);
  assert.ok(signing.steps.some(step => step.run === 'node scripts/check-github-approval.mjs'));
  for (const job of Object.values(workflow.jobs)) for (const step of job.steps ?? []) {
    if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
    assert.doesNotMatch(step.run ?? '', /gh\s+release|Build-Installer|Build-Shell|makeappx|New-SelfSignedCertificate|Import-Certificate/i);
  }
  const xml = new DOMParser().parseFromString(await read('signpath/artifact-configuration.xml'), 'text/xml');
  const entries = Array.from(xml.getElementsByTagName('pe-file'));
  assert.deepEqual(entries.map(n => n.getAttribute('path')).sort(), ['ForgeShell.dll', 'RPFForge.exe']);
  for (const node of entries) {
    assert.equal(node.getAttribute('product-name'), 'RPF Forge');
    assert.equal(node.getAttribute('product-version'), '${version}');
    assert.equal(node.getAttribute('file-version'), '${version}');
  }
});

test('a signing request fails closed before Foundation approval even with apparent runtime opt-in', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/check-signpath.mjs'), '--request-signing'], {
    encoding: 'utf8', env: { ...process.env, SIGNPATH_ENABLED: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTOR: 'biancadcastro', GITHUB_REF: 'refs/heads/main' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /desativada ou aprovacao da Foundation pendente/);
});

test('inventory excludes dev dependencies, secrets and machine paths, and binds own binaries to source', async t => {
  const destination = await mkdtemp(path.join(os.tmpdir(), 'forge-signpath-inventory-'));
  t.after(() => rm(destination, { recursive: true, force: true }));
  await writeFile(path.join(destination, 'RPFForge.exe'), 'synthetic exe');
  await writeFile(path.join(destination, 'ForgeShell.dll'), 'synthetic dll');
  const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/signing-inventory.mjs'), destination, '0.2.0.0', revision, 'true'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const raw = await readFile(path.join(destination, 'build-manifest.json'), 'utf8');
  const manifest = JSON.parse(raw);
  assert.equal(manifest.revision, revision); assert.equal(manifest.dirty, true);
  assert.equal(manifest.installerGenerated, false); assert.equal(manifest.signingRequested, false);
  assert.equal(manifest.binaries[0].sha256, createHash('sha256').update('synthetic exe').digest('hex'));
  assert.ok(!raw.includes(root)); assert.ok(!raw.includes(os.homedir()));
  const sbom = JSON.parse(await readFile(path.join(destination, 'sbom.cdx.json')));
  assert.equal(sbom.bomFormat, 'CycloneDX');
  assert.ok(sbom.components.some(c => c.name === '@xmldom/xmldom'));
  assert.ok(sbom.components.some(c => c.name === 'Node.js'));
  assert.ok(!sbom.components.some(c => c.name === 'yaml'));
});

test('public identity is separate from the local-test identity and contains no assumed publisher', async () => {
  const pub = new DOMParser().parseFromString(await read('signpath/identity.template.xml'), 'text/xml');
  const local = new DOMParser().parseFromString(await read('shell/AppxManifest.xml'), 'text/xml');
  assert.notEqual(pub.getElementsByTagName('Identity')[0].getAttribute('Name'), local.getElementsByTagName('Identity')[0].getAttribute('Name'));
  assert.equal(pub.getElementsByTagName('Identity')[0].getAttribute('Publisher'), '__APPROVED_PUBLISHER_SUBJECT__');
  assert.doesNotMatch(await read('scripts/Build-UnsignedBinaries.ps1'), /New-SelfSignedCertificate|Import-Certificate|Cert:\\|Build-Installer|Build-Shell|makeappx/i);
});
