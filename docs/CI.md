# Verificações automáticas (GitHub Actions)

Os fluxos ficam em `.github/workflows/`. Nenhum deles publica, assina ou usa segredos.

## Quando rodam

- `Tests` (`test.yml`): a cada push em qualquer branch (menos as do Dependabot), em todo pull request e manualmente. Um push novo cancela a execução anterior da mesma branch; na `main` nada é cancelado.
- `Dependency audit` (`audit.yml`): toda segunda-feira, em pull requests que mexem em `package-lock.json` e manualmente. Não bloqueia nada. A execução agendada só vale depois que o arquivo estiver na `main`.
- `SignPath preparation` (`signpath-build.yml`): só manual, sem mudança.

## O que cada job verifica

| Job | Onde | O que faz |
| --- | --- | --- |
| `test` | Windows com Node 22 e 24, Linux com Node 24 | `npm test` (conversor, motor de animação, políticas do repositório), `scripts/check-signpath.mjs` e, no Windows, `scripts/Test-MenuMigration.ps1`. No fim confere que nenhum arquivo versionado mudou. |
| `desktop` | Windows, Node 24 | Tipos, build da interface e os testes com Electron: `check-desktop`, `check-login-gate`, `check-window-chrome` e `check-visual`. No fim confere a árvore limpa. Se algo falhar, as capturas de `output/electron`, `output/window-chrome` e `output/visual-website` ficam como artefato por 7 dias. |
| `ci-ok` | Linux | Só passa se `test` e `desktop` passaram. É a verificação única para a proteção da branch. |
| `npm audit` | Linux | `npm audit --omit=dev --audit-level=high` na raiz e em `desktop-web`. |

## Rodar o equivalente no computador

```powershell
npm ci --ignore-scripts
npm ci --prefix desktop-web
npm test
node scripts/check-signpath.mjs
./scripts/Test-MenuMigration.ps1
npm run desktop:typecheck
npm run desktop:build
npm run desktop:test
node desktop-web/scripts/check-login-gate.mjs
node desktop-web/scripts/check-window-chrome.mjs
node desktop-web/scripts/check-visual.mjs
git status --short   # deve sair vazio
npm audit --omit=dev --audit-level=high
npm audit --omit=dev --audit-level=high --prefix desktop-web
```

## O que não é coberto

- Conversão e renderização com peças reais (carros, roupas, RPFs de terceiros): os arquivos não ficam no repositório.
- Os testes de roupa, pele e neon em `desktop-web/scripts/check-clothing*.mjs`, `check-skin.mjs` e `check-neon*.mjs`.
- Instalador, binários, assinatura e menu de contexto instalado de verdade.
- Comportamento dentro do jogo (FiveM/GTA V).
- Interface em Linux ou macOS: o job `desktop` roda só em Windows.

## Proteção da branch `main`

Em Settings → Branches (ou Rulesets), marque como obrigatória apenas a verificação **`ci-ok`**. Não marque os jobs da matriz pelo nome: o nome muda quando a matriz muda. `npm audit` fica fora das obrigatórias.
