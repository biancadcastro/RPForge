import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const config = JSON.parse(await readFile(fileURLToPath(new URL('../signpath/project.json', import.meta.url))));
if (!process.env.GH_TOKEN || !process.env.GITHUB_REPOSITORY || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Verificacao de aprovacao somente no workflow configurado.');
const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/environments/signpath-signing`, {
  headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
});
if (!response.ok) throw new Error('Nao foi possivel confirmar a protecao do ambiente signpath-signing. Assinatura recusada.');
const environment = await response.json();
const reviewers = environment.protection_rules?.find(rule => rule.type === 'required_reviewers')?.reviewers ?? [];
if (!reviewers.length || reviewers.some(entry => entry.type !== 'User' || entry.reviewer?.login !== config.maintainer)) throw new Error('Configure a mantenedora como revisora obrigatoria no ambiente antes de habilitar assinatura.');
console.log('PASS: ambiente exige aprovacao manual da mantenedora.');
