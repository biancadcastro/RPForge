import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [destination, nativeVersion, revision, dirty] = process.argv.slice(2);
if (!destination || !/^\d+\.\d+\.\d+\.\d+$/.test(nativeVersion) || !/^[a-f0-9]{40}$/.test(revision)) throw new Error('Contexto de build invalido.');
const checksum = data => createHash('sha256').update(data).digest('hex');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json')));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json')));
const tools = JSON.parse(await readFile(path.join(root, 'build/toolchains.json')));
const sourceFiles = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).sort();
const source = [];
for (const name of sourceFiles) {
  if (/(?:^|\/)(?:node_modules|\.tools|release|packaging-stage)\//.test(name) || /\.(?:pfx|p12|key|rpf|yft|ytd|ydd|ydr|ybn|exe|dll)$/i.test(name) || /(?:^|\/)\.env(?:\.|$)/i.test(name)) throw new Error(`Arquivo privado ou gerado versionado: ${name}`);
  source.push({ path: name, sha256: checksum(await readFile(path.join(root, name))) });
}
const binaries = [];
for (const name of ['RPFForge.exe', 'ForgeShell.dll']) binaries.push({ path: name, sha256: checksum(await readFile(path.join(destination, name))) });
const components = Object.entries(lock.packages).filter(([name, item]) => name && !item.dev).map(([name, item]) => ({
  type: 'library', 'bom-ref': `npm:${name.slice(name.indexOf('node_modules/') + 13)}@${item.version}`,
  name: name.replace(/^node_modules\//, ''), version: item.version, scope: 'required',
  purl: `pkg:npm/${name.replace(/^node_modules\//, '').replace('@', '%40')}@${item.version}`,
  licenses: [{ license: { id: item.license } }], externalReferences: [{ type: 'distribution', url: item.resolved }],
}));
components.push({ type: 'application', 'bom-ref': 'node-runtime', name: 'Node.js', version: tools.nodeVersion, licenses: [{ license: { id: 'MIT' } }], properties: [{ name: 'rpf-forge:upstream-signature', value: 'Preserve OpenJS Foundation signature; do not sign with project certificate' }], externalReferences: [{ type: 'distribution', url: tools.tools.node.url }] });
components.push({ type: 'library', 'bom-ref': 'native-runtime', name: 'LLVM-MinGW runtime libraries', version: tools.tools.llvm.version, licenses: [{ license: { name: 'See licenses/llvm-mingw-LICENSE.txt for aggregate upstream terms' } }], properties: [{ name: 'rpf-forge:linkage', value: 'static' }] });
components.push({ type: 'framework', 'bom-ref': 'system-dotnet', name: 'Microsoft .NET Framework', version: '4.8', scope: 'required', properties: [{ name: 'rpf-forge:redistribution', value: 'Windows system library, not included in signing artifact' }] });
const fontFiles = ['PixelifySans-Regular.ttf', 'PixelifySans-Bold.ttf'];
components.push({
  type: 'library', 'bom-ref': 'font:pixelify-sans', name: 'Pixelify Sans', scope: 'required',
  licenses: [{ license: { id: 'OFL-1.1' } }],
  properties: [{ name: 'rpf-forge:embedding', value: 'Regular and Bold embedded in RPFForge.exe' }],
  components: await Promise.all(fontFiles.map(async name => ({
    type: 'data', name, 'bom-ref': `font:pixelify-sans:${name}`,
    hashes: [{ alg: 'SHA-256', content: checksum(await readFile(path.join(root, 'desktop/fonts', name))) }],
    licenses: [{ license: { id: 'OFL-1.1' } }],
  }))),
});
await mkdir(path.join(destination, 'licenses'), { recursive: true });
await copyFile(path.join(root, 'desktop/fonts/OFL.txt'), path.join(destination, 'licenses/Pixelify-Sans-OFL.txt'));
const sbom = { bomFormat: 'CycloneDX', specVersion: '1.6', version: 1,
  metadata: { component: { type: 'application', 'bom-ref': 'rpf-forge', name: 'RPForge', version: pkg.version, licenses: [{ license: { id: pkg.license } }] }, tools: { components: Object.entries(tools.tools).filter(([, tool]) => !tool.optional).map(([name, tool]) => ({ type: 'application', name, version: tool.version, hashes: [{ alg: 'SHA-256', content: tool.sha256 }], scope: 'excluded' })) } },
  components, dependencies: [{ ref: 'rpf-forge', dependsOn: components.map(c => c['bom-ref']) }],
};
const manifest = { schemaVersion: 1, product: 'RPForge', version: nativeVersion, packageVersion: pkg.version,
  repository: 'https://github.com/biancadcastro/RPForge', revision, dirty: dirty === 'true',
  sourceTreeSha256: checksum(JSON.stringify(source)), sources: source, binaries,
  toolchainLockSha256: checksum(await readFile(path.join(root, 'build/toolchains.json'))),
  hostedBuild: process.env.GITHUB_ACTIONS === 'true', workflowRunId: process.env.GITHUB_RUN_ID ?? null,
  installerGenerated: false, signingRequested: false,
};
await writeFile(path.join(destination, 'sbom.cdx.json'), JSON.stringify(sbom, null, 2) + '\n');
await writeFile(path.join(destination, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(destination, 'SHA256SUMS'), binaries.map(file => `${file.sha256}  ${file.path}`).join('\n') + '\n');
console.log('PASS: inventario de licencas, SBOM e proveniencia sem dados de maquina ou credenciais.');
