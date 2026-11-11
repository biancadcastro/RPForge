# RPForge — motor de animações (rodada 06/11/2026)

Desenvolvido na branch `feat/animation-engine` (em worktree própria), criada de `44a715b`, e incorporado à linha `feat/engine-proof-ydd-ycd`. Não integrado à interface, ao menu ou ao instalador; não publicado. Visão geral dos trabalhos de pesquisa em [ENGINE_PROOF.md](../ENGINE_PROOF.md).

## Estado

- **Implementado:** codec YCD próprio (`src/animation-engine/`) com leitor inspect/strict de todo o formato que o corpus local usa e writer do perfil esquelético `ycd-skel-v1` (múltiplos ossos, posição + rotação, root motion, raw ou quantizado), esqueleto de referência (`.skel`), amostragem/comparação semântica, reencode verificado e API que retorna valores.
- **Comprovado offline:** writer → oráculo bit a bit (7/7); oráculo → leitor strict (7/7); leitor × oráculo em 403 YCDs reais (43 M valores, ≤ 1 ulp); 103 emotes reais reencodados e comparados **com o oráculo dos dois lados** (≤ 0,1 mm, ≤ 0,01°); 24 testes, incluindo mutação de cada bit.
- **Não comprovado:** reprodução no GTA V/FiveM, blocos múltiplos (inferido), RawFloat/LinearFloat/CachedQuaternion1 em arquivos reais, eventos de clip, FBX, retarget, CPU faturada.

| Documento | Conteúdo |
|---|---|
| [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) | matriz de suporte, arquivo × esqueleto, limites, avaliação YDD |
| [PROFILE.md](PROFILE.md) | perfil `ycd-skel-v1`: entrada, convenções, tolerâncias |
| [INTEROP.md](INTEROP.md) | provas independentes e divergências com o oráculo |
| [PERFORMANCE.md](PERFORMANCE.md) | medições Node/workerd, memória, limitações |
| [INTEGRATION.md](INTEGRATION.md) | proposta de interface para o Worker do motor |
| [FBX-AND-RETARGET.md](FBX-AND-RETARGET.md) | análise do ia-emotescript, opções FBX, perfil e plano |
| [corpus-manifest.json](corpus-manifest.json) | corpus sintético (hashes), casos inválidos, corpus externo agregado |

## Reproduzir

```powershell
Set-Location <worktree-do-animation-engine>
node --test tests/animation-engine.test.js
# cadeia completa (testes, corpus sintético, oráculo, comparação, levantamento, reencode, esqueletos):
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/animation-engine/Run-Evidence.ps1 `
  -EvidenceDirectory <pasta-fora-do-repo> -OracleLibrary <repo-RPForge>\.tools\clothing-engine `
  [-ExternalList <lista.txt>] [-EmoteList <lista.txt>] [-SkeletonFiles '<m.skel>;<f.skel>']
node --expose-gc scripts/animation-engine/bench/bench-node.mjs <saida.json> [externo.ycd]
node scripts/animation-engine/bench/bench-workerd.mjs <RPForge-API>\node_modules <pasta> [externo.ycd]
```
Listas externas: um caminho absoluto por linha. Arquivos de terceiros só são lidos; relatórios que os citam ficam fora do Git. Evidências desta rodada: pasta local de evidências, fora do repositório (dumps binários do oráculo e YCDs derivados de terceiros foram apagados após o resumo; são regeneráveis).

## Próximas provas, em ordem

1. **Teste no jogo** (pessoa com ambiente autorizado): `skel_s21_f61_mover_q.ycd` e 2–3 emotes reais reencodados — carrega, toca, pés/mãos plausíveis, root motion. Gate de tudo o que segue.
2. Decidir `Unknown_1Ch` e `limit` com o resultado do jogo (comparar com valores reais se algo falhar).
3. Escrita em blocos múltiplos só se o jogo exigir (validar a leitura `limit+1` com um arquivo real reencodado em blocos).
4. Decodificar/preservar tags e propriedades de clip (eventos) — hoje só descartáveis explicitamente.
5. Parser FBX binário próprio + ufbx como oráculo, com 3 FBX Mixamo autorizados (FBX-AND-RETARGET.md §6).
6. Retarget Mixamo→GTA com as métricas definidas; preview web a partir de `decodeYcd`.
7. Medição remota de CPU/memória por isolate, somente com escopo e orçamento autorizados.
