# Interoperabilidade — resultados (06/11/2026)

Oráculo offline: **CodeWalker.Core 1.0.0.0** (MIT, aviso `CodeWalker-NOTICE.txt`), SHA-256 `3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8`, .NET 4.0.30319.42000 via Windows PowerShell 5.1, carregado de `RPForge\.tools\clothing-engine` (fora do Git). Uso somente local/desenvolvimento; o motor nunca o carrega. Layouts foram estudados na fonte do CodeWalker (MIT) — não é implementação clean-room; incluir o aviso MIT se trechos derivados forem distribuídos. Evidências completas: pasta local de evidências da rodada de 06/11/2026, fora do repositório.

O oráculo registra a **própria** avaliação (`AnimSequence.EvaluateVector` em cada frame local de cada bloco) em float32 — a comparação não usa o leitor próprio dos dois lados.

| # | Prova | Resultado | Arquivo de evidência |
|---|---|---|---|
| 1 | Arquivo externo → leitor próprio, comparado ao oráculo | **403/403 lidos sem divergência**, 43 116 672 valores, diferença máx. 1,19e-7 (1 ulp); estrutura (frames, duração, limit, flags, tags/trilha/tipo, nomes/tempos de clip) idêntica | `compare-external.json` |
| 1b | Externos que o oráculo lê e o leitor recusa | 48 (oráculo tolera o que o leitor recusa: leitura além do fim preenchida com zero, blocos inconsistentes, nome com comprimento errado) | `survey-external.json` |
| 2 | Writer próprio → oráculo lê e regrava | **7/7** sintéticos (3–130 trilhas, 2–1800 frames, raw/quantized, mover, giro de 720°, quaternion perto de 180°); **1 093 411 valores, diferença 0 (bit a bit)** | `compare-synthetic.json` |
| 2b | Regravação do oráculo → leitor próprio **strict** | 7/7 aceitos em strict; semântica igual (posição 0; ângulo ≤ 7,3e-8 rad = ruído de acos) | idem |
| 3 | Transformação controlada (reencode de emote real → perfil), avaliada **pelo oráculo nos dois lados** | **49/49** emotes de bloco único: posição ≤ 8,7e-5 m, ângulo ≤ 1,59e-4 rad (0,0091°), 328 344 amostras. **54/54** multi-bloco dentro das mesmas tolerâncias (≤ 9,95e-5 m, ≤ 1,74e-4 rad), mas o mapeamento de frames desses depende da inferência de blocos (ver abaixo) | `compare-reencode.json` |
| 3b | Reencode recusado | 7/110: start/end/rate fora do perfil (3), vários clips (2), bloco com 0 frames (1), refs de root motion inconsistentes (1) | `reencode/reencode.json` |
| 4 | Entrada inválida → erro previsível | testes: truncamento, mutação de cada bit, bomba, orçamento, ciclos, ponteiros externos, trailer, versão/magic | `tests.log` (24/24) |
| 5 | Esqueletos de referência | `.skel` masculino e feminino: 128 ossos, sem tags ausentes nos 126 emotes; posições do frame 0 = `LocalOffset` (mediana 1e-7 m) | `skeleton-check.json` |

Tolerâncias: valores do leitor × oráculo 1e-6 (mesmas fórmulas float32; esperado ~0). Transformação: 1,01e-4 m e 2,5e-4 rad (justificativa em PROFILE.md).

## Divergências conhecidas com o oráculo

1. **Blocos múltiplos.** O CodeWalker avalia um frame global pelo bloco `frame / limit`, com interpolação até `local+1` (sobreposição de 1 frame). Nos ~50 arquivos multi-bloco reais, só a leitura **sem sobreposição com `limit+1` frames por bloco** fecha a soma dos frames (605 = 4×128+93; 257 = 2×128+1). O motor usa essa leitura; o writer evita a questão gravando um bloco só. **Não comprovado no jogo.** A prova 3 (multi-bloco) usa a mesma inferência dos dois lados, então não a valida.
2. **Prova anterior de 256 frames** (`SequenceFrameLimit 255`, um bloco): pela regra do CodeWalker o frame 255 cai no bloco 1 inexistente (o próprio CodeWalker indexaria fora); pela leitura de blocos `limit+1` é consistente. O leitor aceita com nota e o modo strict recusa. O novo writer grava `limit = frames + 30`.
3. **CachedQuaternion2**: o oráculo ignora a dica e usa os 4 componentes; o motor faz o mesmo. Efeito no jogo desconhecido.

## O que não está comprovado

- Reprodução em GTA V/FiveM: **não testado** (não havia ambiente autorizado nesta rodada). Aceitação pelo CodeWalker não é validação visual nem no jogo.
- RawFloat em jogo (0 ocorrências reais). O modo padrão usa QuantizeFloat, que é o tipo dominante em arquivos reais.
- `Unknown_1Ch = 0` (≠ 0 em quase todos os reais), `UsageCount`, `limit = frames + 30`: convenções observadas ou da referência, sem prova no jogo.
- LinearFloat e CachedQuaternion1: leitura implementada mas sem nenhum arquivo para comparar.
- Tags/propriedades de clip (eventos), clips AnimationList, escala/UV/facial.
