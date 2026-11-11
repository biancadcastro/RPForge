# RPForge — motor de animações (rodada 06/11/2026)

Desenvolvido na branch `feat/animation-engine` (em worktree própria), criada de `44a715b`, e incorporado à linha `feat/engine-proof-ydd-ycd`. Não integrado à interface, ao menu ou ao instalador; não publicado. Visão geral dos trabalhos de pesquisa em [ENGINE_PROOF.md](../ENGINE_PROOF.md).

## Estado

- **Implementado:** codec YCD próprio (`src/animation-engine/`) com leitor inspect/strict de todo o formato que o corpus local usa e writer do perfil esquelético `ycd-skel-v1` (múltiplos ossos, posição + rotação, root motion, raw ou quantizado), esqueleto de referência (`.skel`), amostragem/comparação semântica, reencode verificado e API que retorna valores.
- **Comprovado offline:** writer → oráculo bit a bit (7/7); oráculo → leitor strict (7/7); leitor × oráculo em 403 YCDs reais (43 M valores, ≤ 1 ulp); 103 emotes reais reencodados e comparados **com o oráculo dos dois lados** (≤ 0,1 mm, ≤ 0,01°); 24 testes, incluindo mutação de cada bit.
- **Não comprovado:** reprodução no GTA V/FiveM, blocos múltiplos (inferido), RawFloat/LinearFloat/CachedQuaternion1 em arquivos reais, eventos de clip, CPU faturada.

### Rodada 11/11/2026 — "Animações FBX para YCD" (motor, sem tela)

- **Implementado:** leitor FBX próprio (binário 7.0–7.7 e ASCII 7.x, com orçamentos), extração de cena (hierarquia, pré/pós-rotação, ordens de rotação, pivôs, bind pose, takes, curvas), conversão em espaço de mundo para o esqueleto do jogo (eixos, unidades, reamostragem para 30 fps, ajuste de pose de referência, root motion opcional), mapeamento de ossos por nome exato, apelidos (Mixamo/HumanIK, Unreal, Biped) ou mapa manual, esqueletos freemode embutidos e API `inspectFbx` / `convertFbxToYcd` com relatório e avisos em pt-BR.
- **Comprovado offline:** ida e volta de animação conhecida por FBX em convenções estrangeiras (128 ossos, ≤ 0,05°); Blender 5.2.2 como escritor independente (6 takes, ≤ 0,42 mm e ≤ 0,013°) e como leitor independente (≤ 0,005 mm); YCDs gerados relidos pelo CodeWalker (3/3, diferença 0); 37 testes de animação (35 + 2 opcionais), suíte completa 203.
- **Não comprovado:** reprodução no jogo (amostras e roteiro em `D:\RedHorn\output\rpforge-animacao-teste\`), FBX reais de Mixamo/Unreal/Biped (nenhum disponível), curvas cúbicas contra implementação independente, FBX ASCII real, trilha mover no jogo. Animações acima de 1800 quadros são recusadas.

| Documento | Conteúdo |
|---|---|
| [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) | matriz de suporte, arquivo × esqueleto, limites, avaliação YDD |
| [PROFILE.md](PROFILE.md) | perfil `ycd-skel-v1`: entrada, convenções, tolerâncias |
| [INTEROP.md](INTEROP.md) | provas independentes e divergências com o oráculo |
| [PERFORMANCE.md](PERFORMANCE.md) | medições Node/workerd, memória, limitações |
| [INTEGRATION.md](INTEGRATION.md) | proposta de interface para o Worker do motor |
| [FBX-AND-RETARGET.md](FBX-AND-RETARGET.md) | importação FBX e conversão para YCD: API, leitor, mapeamento, eixos, retarget, evidências, limites |
| [corpus-manifest.json](corpus-manifest.json) | corpus sintético (hashes), casos inválidos, corpus externo agregado |

## Reproduzir

```powershell
Set-Location <worktree-do-animation-engine>
node --test tests/animation-*.test.js
# interoperabilidade FBX com Blender (offline, fixture fora do Git): ver FBX-AND-RETARGET.md §7
# cadeia completa (testes, corpus sintético, oráculo, comparação, levantamento, reencode, esqueletos):
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/animation-engine/Run-Evidence.ps1 `
  -EvidenceDirectory <pasta-fora-do-repo> -OracleLibrary <repo-RPForge>\.tools\clothing-engine `
  [-ExternalList <lista.txt>] [-EmoteList <lista.txt>] [-SkeletonFiles '<m.skel>;<f.skel>']
node --expose-gc scripts/animation-engine/bench/bench-node.mjs <saida.json> [externo.ycd]
node scripts/animation-engine/bench/bench-workerd.mjs <RPForge-API>\node_modules <pasta> [externo.ycd]
```
Listas externas: um caminho absoluto por linha. Arquivos de terceiros só são lidos; relatórios que os citam ficam fora do Git. Evidências desta rodada: pasta local de evidências, fora do repositório (dumps binários do oráculo e YCDs derivados de terceiros foram apagados após o resumo; são regeneráveis).

## Próximas provas, em ordem

1. **Teste no jogo** (pessoa com ambiente autorizado): as 3 amostras geradas de FBX em `D:\RedHorn\output\rpforge-animacao-teste\` (braço direito, giro do tronco, passo no lugar) — carrega, toca, lado certo, frente certa, altura certa. Gate de tudo o que segue, inclusive da tela.
2. Decidir `Unknown_1Ch` e `limit` com o resultado do jogo (comparar com valores reais se algo falhar).
3. Testar FBX reais de terceiros com autorização (Mixamo com e sem skin, Unreal, Biped) e ajustar apelidos/ajuste de pose; torção de mãos e pés em rigs em pose T.
4. Escrita em blocos múltiplos só se o jogo exigir (hoje, acima de 1800 quadros é recusado).
5. Tela da ferramenta sobre `inspectFbx`/`convertFbxToYcd` (INTEGRATION.md); preview a partir de `decodeYcd`.
6. Decodificar/preservar tags e propriedades de clip (eventos) — hoje só descartáveis explicitamente.
7. Medição remota de CPU/memória por isolate, somente com escopo e orçamento autorizados.
