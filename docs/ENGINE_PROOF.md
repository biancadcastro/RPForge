# Prova de codec YDD/YCD (`src/engine-proof`)

Código de pesquisa. Não está ligado à interface, ao menu do Explorer nem ao
instalador, e não é usado pelas ferramentas de roupas (que usam o motor em
`engines\clothing`).

## Escopo

| Módulo | O que faz |
| --- | --- |
| `resource.js` | Envelope RSC7 restrito: compressão/descompressão, layout de páginas e leitura por ponteiros, com limites de 8 MiB por região e 128 páginas. O escritor gera uma página única. |
| `ydd.js` | `writeYdd`/`readYdd`: um drawable com uma malha `Float3` no LOD alto, sem rig, sem textura e sem material de renderização. 3 a 60.000 vértices e até 180.000 índices. |
| `ycd.js` | `writeYcd`/`readYcd`: um clipe, uma animação e uma trilha de posição da raiz com três canais float sem compressão. 2 a 256 quadros, 1 a 120 fps. |

Nomes são restritos a `[a-z][a-z0-9_]{0,63}`. Entradas fora do perfil são recusadas
com erro, sem tentativa de correção.

## Limites

- Não é exportador de roupas nem conversor de animações: sem FBX, retarget,
  rotações, canais quantizados, rigs de produção ou texturas.
- Layouts estudados na fonte do CodeWalker (MIT); não é implementação clean-room.
- Nenhuma validação no jogo foi realizada (`gameValidation: not performed`).

## Verificação

- `tests/engine-proof.test.js` e `tests/engine-proof-reread.test.js`: ida e volta e
  recusas, com dados sintéticos.
- `scripts/engine-proof-fixtures.mjs <pasta-absoluta>` gera as fixtures;
  `scripts/Test-EngineProofInterop.ps1` as lê com o CodeWalker.Core como oráculo
  offline (Windows PowerShell 5.1), e `scripts/engine-proof-reread-oracle.mjs` relê
  com os leitores da prova os arquivos salvos pelo oráculo. O runtime da prova nunca
  carrega as DLLs do oráculo.

## Trabalhos relacionados, também fora do app

- `src/animation-engine`: codec de YCD esquelético (perfil v0.1.0). Documentação em
  [animation-engine/README.md](animation-engine/README.md).
- `src/connector/transfer.js`: camada de transferência do futuro conector Windows,
  sem leitura de arquivos do GTA e sem codecs; testada em `tests/connector.test.js`.
