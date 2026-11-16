# Matriz de suporte — motor de animações (06/11/2026)

Legenda: **Comprovado** = teste automatizado + comparação independente (oráculo offline) · **Lido** = leitor próprio decodifica e o oráculo concorda nos valores, sem escrita · **Inferido** = sustentado por dados reais, sem confirmação independente · **Recusado** = erro com código estável · **Não comprovado** = sem evidência. Nada foi testado em GTA V/FiveM.

## Envelope e formato

| Item | Leitura | Escrita | Evidência |
|---|---|---|---|
| RSC7 versão 46 (YCD, GTA V Legacy) | Comprovado | Comprovado | oráculo 7/7 sintéticos + 403 reais |
| Outras versões / gen9 | Recusado `INVALID_ENVELOPE` | — | teste |
| Páginas múltiplas por região | Comprovado (até 128 páginas, 8 MiB) | Página única potência de 2 | prova anterior + testes |
| Região graphics em YCD | Recusada se não vazia | — | — |
| Trailer Adler-32 após o deflate | Aceito só se o checksum confere; nota em inspect, recusa em strict | Nunca emitido | 102 arquivos reais; teste |
| Bytes finais arbitrários, bomba de descompressão | Recusado `DECOMPRESSION_FAILED` | — | teste |

## Estruturas YCD

| Estrutura | Leitura | Escrita (perfil `ycd-skel-v1`) | Observação |
|---|---|---|---|
| ClipDictionary + page info | Comprovado | 1 dicionário | campos fixos conferidos |
| Mapas de clips/animações (buckets + listas `Next`) | Comprovado; ciclo → `CYCLE`; contagem → `INCONSISTENT_REFERENCE` | 1 bucket, 1 entrada | bucket = hash % capacidade conferido |
| Clip tipo 1 (Animation) | Comprovado (nome, hash joaat do nome curto, start/end/rate) | `pack:/<nome>.clip`, start 0, end = duração, rate 1 | 1720/1750 clips reais usam `pack:/…clip` |
| Clip tipo 2 (AnimationList) | Recusado como estrutura (nota) | — | 1085 ocorrências reais, não decodificadas |
| Tags e Properties do clip (eventos) | Detectados, **não decodificados** | Nunca emitidos | reencode exige `discard` explícito |
| Animation (frames, limit, duração, flags, UsageCount) | Comprovado | flags 16 ⇔ trilhas de mover; UsageCount 2 | flags: 97/97 com mover = 16; UsageCount 2 em 295 arquivos de 1 clip |
| `Unknown_1Ch` da Animation | Lido; nota (≠0 em 391/393 reais) | 0 | **significado desconhecido; impacto no jogo não comprovado** |
| Vários Sequence blocks | **Lido** com blocos sem sobreposição de `limit+1` frames | Nunca (bloco único) | **Inferido**: soma exata em ~50 animações (605 = 4×128+93). O CodeWalker avalia com `frame/limit` — diverge |
| Bloco único com `limit < frames` | Lido com nota; strict recusa | Nunca | caso da prova anterior de 256 frames |
| BoneIds (tag u16, tipo u8, trilha u8) | Comprovado | ordem (trilha, tag) | byte 2 = tipo de dado: 0 vec3, 1 quaternion, 2 float (consistente em 100% do corpus) |
| Root motion refs (mover pos/rot) | Comprovado | Comprovado (ordenadas por tipo/índice) | oráculo relê; 1 arquivo real recusado por offset inconsistente |

## Canais

| Tipo | Leitura | Escrita | Uso real (canais no corpus) |
|---|---|---|---|
| 0 StaticQuaternion (w ≥ 0 reconstruído) | Comprovado | Comprovado (canonicaliza w ≥ 0; perto de 180° cai para 4×StaticFloat) | 14 275 |
| 1 StaticVector3 | Comprovado | Comprovado | 22 881 |
| 2 StaticFloat | Comprovado | Comprovado | 583 |
| 3 RawFloat | Comprovado | Comprovado (modo `raw`) | **0 em arquivos reais** — suporte do jogo não comprovado |
| 4 QuantizeFloat | Comprovado | Comprovado (modo `quantized`, padrão) | 19 565 |
| 5 IndirectQuantizeFloat | Lido (oráculo concorda) | Não | 1 339 |
| 6 LinearFloat | Implementado, **não comprovado** (0 ocorrências) | Não | 0 |
| 7 CachedQuaternion1 | Implementado, **não comprovado** (0 ocorrências) | Não (evitado de propósito) | 0 |
| 8 CachedQuaternion2 | Lido: sempre junto de 4 componentes; avalia pelos 4 (como o oráculo); significado da dica desconhecido | Não | 84 arquivos |

## Trilhas, unidades e convenções

| Item | Situação |
|---|---|
| Trilha 0 posição do osso (m, espaço local do pai) | Leitura/escrita comprovadas |
| Trilha 1 rotação do osso (quaternion x,y,z,w, local do pai) | Leitura/escrita comprovadas |
| Trilha 2 escala | Lida; fora do perfil de escrita (reencode exige `discard`) |
| Trilhas 5/6 mover (root motion; osso 0) | Leitura/escrita comprovadas; efeito no jogo não comprovado |
| Trilhas 17/18 (UV), 33, 134–140 (float) | Lidas; fora do perfil |
| Tempo | posição de frame `u = t/duração·(frames−1)`; o perfil grava duração = (frames−1)/fps ou duração explícita |
| Convenções de duração no corpus | 387 animações `(frames−1)/24`, 122 `frames/30` (emotes exportados), outras — o reencode preserva a duração original |
| Transformações locais absolutas | **Inferido**: no frame 0, posições coincidem com `LocalOffset` do .skel masculino (mediana 1e-7 m, 92,8% < 1 mm) |

## O que vem do arquivo e o que exige esqueleto externo

Do YCD: tags de osso (u16), trilha, tipo de dado, amostras, tempo, root motion. **Não vem**: nomes, hierarquia, rest pose, comprimentos, gênero. Tudo isso exige um esqueleto de referência (`.skel`). Os `.skel` masculino e feminino locais (128 ossos, raiz única) foram parseados e validados; cobrem 100% das tags dos 126 emotes reais. A ordem/hierarquia dos dois difere e os rest offsets diferem até ~1 cm. A tag **não** é derivável do nome para os ossos principais (a fórmula ELF só reproduz 29 tags auxiliares, ex.: `SKEL_Pelvis` = 11816 vs 56200 calculado).

## Limites (padrão do motor; a plataforma só pode reduzir)

Entrada comprimida 4 MiB · região 8 MiB · 128 páginas · 256 clips/animações · 64 blocos · 1024 trilhas · 4096 canais/bloco · 8192 frames (leitura) · 8 Mi amostras decodificadas · 65535 bits/frame · saída 4 MiB. Perfil de escrita: 2–1800 frames, 512 trilhas, |posição| ≤ 10 km, fps 1–120.

## Corpus externo (somente leitura)

847 YCDs locais de terceiros; 451 legíveis (396 bloqueados pelo sandbox), **403 lidos**, 48 recusados com código (layouts que o CodeWalker tolera preenchendo com zeros, blocos inconsistentes, nome com comprimento errado). Emotes (`animacoes`): 108/110 lidos. Detalhes em `corpus-manifest.json`.

## YDD (roupas) — avaliação breve

A prova YDD continua restrita (1 drawable, malha Float3 sem rig/material/UV, 1 LOD). Antes de ferramentas de roupa: (1) leitor YDD inspect com o mesmo método deste motor (modo inspect + levantamento sobre o acervo local, sem gravar); (2) skinning (bone map, pesos/índices) e layouts de vértice reais; (3) shaders/material mínimos; (4) escrita conservadora só sobre layouts lidos e comprovados pelo oráculo. Reaproveitar daqui: envelope com limites, `Region` com cobertura de bytes, invariante de mutação, oráculo em lote e levantamento estatístico.
