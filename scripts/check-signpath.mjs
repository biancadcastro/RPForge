import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'yaml';
import { DOMParser } from '@xmldom/xmldom';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = relative => readFile(path.join(root, relative), 'utf8');
const config = JSON.parse(await read('signpath/project.json'));
const tools = JSON.parse(await read('build/toolchains.json'));
const pkg = JSON.parse(await read('package.json'));
if (pkg.license !== 'GPL-3.0-only' || !/GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(await read('LICENSE'))) throw new Error('Licenca GPLv3 do projeto inconsistente.');
if ((await read('.node-version')).trim() !== tools.nodeVersion) throw new Error('Versao do Node diverge da toolchain.');
for (const [name, tool] of Object.entries(tools.tools)) {
  const url = new URL(tool.url);
  if (url.protocol !== 'https:' || !['github.com', 'api.nuget.org', 'nodejs.org'].includes(url.hostname) || !/^[a-f0-9]{64}$/.test(tool.sha256)) throw new Error(`Toolchain nao fixada: ${name}`);
}
const parserErrors = [];
const xml = new DOMParser({ onError: (level, message) => parserErrors.push(message) }).parseFromString(await read('signpath/artifact-configuration.xml'), 'text/xml');
if (parserErrors.length) throw new Error('XML de assinatura invalido.');
const entries = Array.from(xml.getElementsByTagName('pe-file'));
if (entries.length !== 2 || entries.some(entry => !config.ownBinaries.includes(entry.getAttribute('path')) || entry.getAttribute('product-name') !== 'RPForge' || entry.getAttribute('product-version') !== '${version}' || entry.getAttribute('file-version') !== '${version}')) throw new Error('Assinatura deve restringir exatamente os binarios proprios e sua versao.');
for (const filename of ['.github/workflows/test.yml', '.github/workflows/signpath-build.yml']) {
  const workflow = parse(await read(filename));
  if (workflow.on?.pull_request_target || workflow.permissions?.contents === 'write') throw new Error('Workflow com privilegios excessivos.');
  for (const job of Object.values(workflow.jobs ?? {})) {
    if (job['runs-on']?.includes('self-hosted')) throw new Error('Build para SignPath OSS deve usar runner hospedado pelo GitHub.');
    for (const step of job.steps ?? []) if (step.uses && !/@[a-f0-9]{40}$/.test(step.uses)) throw new Error(`Action sem SHA fixado: ${step.uses}`);
  }
}
const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of tracked) if (/\.(?:pfx|p12|key|rpf|yft|ytd|ydd|ydr|exe|dll)$/i.test(file) || /(?:^|\/)\.env(?:\.|$)/.test(file) || /^(?:\.tools|node_modules|release|packaging-stage)\//.test(file)) throw new Error(`Arquivo privado ou gerado no Git: ${file}`);
if (process.argv.includes('--request-signing')) {
  if (!config.enabled || !config.approvedByFoundation || !config.manualApprovalRequired) throw new Error('Assinatura desativada ou aprovacao da Foundation pendente.');
  if (process.env.SIGNPATH_ENABLED !== 'true' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || process.env.GITHUB_ACTOR !== config.maintainer || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Pedido de assinatura exige opt-in e execucao manual pela mantenedora na main.');
  for (const field of ['organizationId', 'signingPolicySlug', 'publisherSubject']) if (!config[field] || String(config[field]).includes('__')) throw new Error(`Configuracao aprovada pendente: ${field}`);
  if (process.env.SIGNPATH_ORGANIZATION_ID !== config.organizationId || process.env.SIGNPATH_POLICY_SLUG !== config.signingPolicySlug) throw new Error('Variaveis do ambiente diferem da configuracao de assinatura revisada.');
}
console.log('PASS: preparacao SignPath verificada. Nenhum pedido de assinatura ou publicacao foi enviado.');
