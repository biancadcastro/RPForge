# Animações FBX para YCD — importação FBX e conversão (rodada 11/11/2026)

Perfil de entrada `fbx-skel-v1`, perfil de saída `ycd-skel-v1` (PROFILE.md). Motor próprio em JavaScript puro: só `node:zlib` e código do repositório. Nenhum CodeWalker, Blender, Assimp ou FBX SDK em runtime — Blender e CodeWalker aparecem apenas como oráculos offline em `scripts/animation-engine/`. Sem acesso a arquivos no núcleo: bytes entram, bytes e relatório saem; roda em Node e em Worker. **Nada foi testado dentro do GTA V/FiveM** (§9).

## 1. API

```js
import {inspectFbx, convertFbxToYcd} from 'src/animation-engine/index.js';

inspectFbx(bytes, {skeleton?, boneMap?, fps?, limits?, signal?})
// -> {ok, format, version, settings, takes[], bones[], mapping, hasBindPose, convertible, issues[], warnings[]}

convertFbxToYcd(bytes, {skeleton?, take?, clipName?, rootMotion?, boneMap?, fps?, alignRestPose?, encoding?, limits?, signal?})
// -> {ok, ycd: Uint8Array, report}
```

Mesmo contrato das outras operações: retorno por valor (`{ok:true,…}` ou `{ok:false, error:{code, message, details, userMessage}}`), nunca exceção para erro de arquivo, nunca bytes parciais, `signal` (AbortSignal) verificado entre estágios e a cada 64 quadros. `error.userMessage` e `warnings[].message` são frases em pt-BR para a pessoa; `code` é o contrato estável para o programa.

| Opção | Valores | Padrão |
|---|---|---|
| `skeleton` | `'male'` / `'mp_m_freemode_01'`, `'female'` / `'mp_f_freemode_01'`, texto `.skel`, ou `{bones:[{name, tag, parent, rotation, translation}]}` | `'male'` |
| `take` | nome (exato, depois sem diferenciar maiúsculas) ou índice | primeira animação (aviso `FBX_MULTIPLE_TAKES` se houver mais) |
| `clipName` | texto; é ajustado para `[a-z0-9_@-]`, até 64 caracteres (aviso `CLIP_NAME_ADJUSTED`) | nome do take (parte depois de `Objeto|`) |
| `rootMotion` | `false`/`'keep'`: deslocamento fica no osso raiz · `true`/`'mover'`: deslocamento horizontal vai para a trilha mover | `'keep'` |
| `boneMap` | `{'nome no FBX': 'SKEL_…' \| null}`; `null` exclui o osso | — |
| `fps` | inteiro 1–120 ou `'source'` | 30 |
| `alignRestPose` | `false` desliga o ajuste de pose de referência (§5) | `true` |
| `limits` | subconjunto de `FBX_LIMITS` (só para reduzir) | §8 |

Os esqueletos freemode masculino e feminino vêm embutidos (`freemode-skeletons.js`: nome, tag, pai, rotação e deslocamento de repouso de 128 ossos, gerado por `scripts/animation-engine/make-skeleton-data.mjs` a partir dos `.skel` de referência). É o que permite funcionar sem configuração. **Decisão a confirmar pela responsável:** esses números derivam de arquivos do jogo; ficam em código-fonte, não como arquivo do jogo.

### Relatório (`report`)

`take {index, name, available[]}` · `source {format, version, fps, duration, curves, keys, cubicKeys, constantKeys, tcbKeys, bakedKeys}` · `output {clipName, fps, frames, duration, tracks, bytes}` · `mappedBones [{source, target, tag, via: exact|alias|manual}]` · `ignoredBones [{source, reason: unknown|excluded|duplicate}]` · `pinnedBones` (ossos do jogo sem correspondente que ficam fixos na pose de repouso, §5) · `conversion {axes {matrix, upAxis, orientation, restYawError}, scale, scaleFrom, restPose, restAlignment, rootBone}` · `rootMotion {mode, horizontalTravel}` · `verification {maxAngleError (rad), maxPositionError (m)}` (YCD relido em modo strict e comparado com as trilhas convertidas) · `warnings [{code, level: info|warning, message, details}]`.

Códigos de aviso: `FBX_MULTIPLE_TAKES, FBX_RESAMPLED, FBX_DURATION_ROUNDED, FBX_STATIC_POSE, FBX_REST_FROM_DEFAULTS, FBX_UNMAPPED_BONES, FBX_FEW_BONES_MAPPED, FBX_DUPLICATE_BONE_MATCH, FBX_NO_HIPS, FBX_ORIENTATION_ASSUMED, FBX_REST_NOT_AXIS_ALIGNED, FBX_SCALE_FROM_UNITS, FBX_REST_POSE_ALIGNED, FBX_SPARSE_CUBIC_KEYS, FBX_TCB_AS_LINEAR, FBX_SCALE_ANIMATION_IGNORED, FBX_BONE_TRANSLATION_IGNORED, FBX_PRE_ROTATION_INACTIVE, FBX_ROOT_MOTION_MOVER, FBX_ROOT_TRAVEL, CLIP_NAME_ADJUSTED` (`FBX_WARNING_CODES`).

Códigos de erro novos: `FBX_INVALID, FBX_UNSUPPORTED_VERSION, FBX_UNSUPPORTED_FEATURE (details.feature: layers | mirroredTransform | rotationOrder), FBX_NO_SKELETON, FBX_NO_ANIMATION, FBX_TAKE_NOT_FOUND, BONE_MAP_INVALID, BONE_MAP_INSUFFICIENT, ANIMATION_TOO_LONG`; reutilizados: `INVALID_INPUT, INPUT_TOO_LARGE, LIMIT_EXCEEDED, DECOMPRESSION_FAILED, NONFINITE_VALUE, CYCLE, SKELETON_INVALID, OUTPUT_TOO_LARGE, CANCELLED, INTERNAL`.

`inspectFbx` não falha só porque o arquivo não é conversível: devolve `convertible: false` e `issues[]` (mesmos códigos e frases) para a tela explicar; cada take traz `convertible` e, se for o caso, `issue`.

## 2. Leitor FBX (`fbx-parse.js`, `fbx-scene.js`, `fbx-curve.js`, `fbx-math.js`)

- **Binário 7.0–7.7** (cabeçalhos de 32 bits até 7.4 e de 64 bits a partir de 7.5), propriedades `C Y I L F D S R` e vetores `b i l f d` crus ou zlib. Vetores são preguiçosos: malhas, texturas e deformadores nunca são descomprimidos. Cada vetor é inflado com teto igual ao tamanho declarado (bomba de descompressão → `DECOMPRESSION_FAILED`).
- **ASCII 7.x**: mesma árvore de nós; vetores `*N { a: … }` também preguiçosos; atributos de chave lidos como padrão de bits inteiro. FBX 6.x e anteriores → `FBX_UNSUPPORTED_VERSION`.
- **Cena**: `GlobalSettings` (UpAxis/FrontAxis/CoordAxis e sinais, UnitScaleFactor, TimeMode/CustomFrameRate), `Definitions` (valores padrão dos modelos de propriedades), `Model` (LimbNode, Root, Null…; Mesh/Camera/Light não são candidatos a osso), hierarquia por `Connections` (ciclo → `CYCLE`), `Pose` do tipo BindPose, `AnimationStack` (LocalStart/LocalStop; sem eles, o intervalo das chaves), `AnimationLayer`, `AnimationCurveNode` em `Lcl Translation/Rotation/Scaling`, `AnimationCurve`.
- **Cadeia de transformação** de cada nó: `T · Roff · Rp · Rpre · R · Rpost⁻¹ · Rp⁻¹ · Soff · Sp · S · Sp⁻¹`. `R` usa a `RotationOrder` do nó (XYZ, XZY, YZX, YXZ, ZXY, ZYX; "XYZ" = gira em X, depois Y, depois Z, em eixos fixos, isto é `Rz·Ry·Rx`); `PreRotation/PostRotation` são sempre XYZ. Com `RotationActive` desligado, pré/pós-rotação e ordem são ignoradas (regra do formato; aviso `FBX_PRE_ROTATION_INACTIVE`). `SphericXYZ` → recusado. `InheritType` e transformações geométricas não são aplicados (não afetam ossos com escala uniforme).
- **Curvas**: tempo em KTime (1/46 186 158 000 s). Por trecho: constante (inclusive "próxima chave"), linear, **cúbica** = Bezier definido pela inclinação à direita da chave e à esquerda da seguinte; com pesos padrão (1/3) isso é exatamente uma spline de Hermite, avaliada em forma fechada; com pesos (weighted) o tempo é resolvido por bisseção. Chaves **TCB** não trazem inclinações: são avaliadas como reta e geram o aviso `FBX_TCB_AS_LINEAR`. Fora do intervalo das chaves o valor é mantido (pré/pós-extrapolação não é lida). As curvas são amostradas por quadro em Euler e só então convertidas em rotação — a mesma semântica do FBX.
- **Camadas**: uma camada animada por take. Mais de uma → `FBX_UNSUPPORTED_FEATURE` (`layers`); não há mistura adivinhada.

## 3. Mapeamento de ossos (`fbx-bone-map.js`)

Ordem, por osso do arquivo: (1) `boneMap` manual; (2) nome exato do jogo, sem diferenciar maiúsculas e sem prefixo (`rig:SKEL_Head`); (3) tabela de apelidos. Nada além disso é adivinhado: nome desconhecido fica fora e é listado. Dois ossos para o mesmo destino: manual vence exato, que vence apelido, depois o primeiro do arquivo; o perdedor aparece em `ignoredBones` (`duplicate`).

Chave de comparação dos apelidos: minúsculas, sem prefixo até `:` ou `|`, sem separadores (`mixamorig:LeftUpLeg` → `leftupleg`). Tabela completa: `fbxBoneAliases()`.

| Família | Exemplos → osso do jogo |
|---|---|
| Mixamo / HumanIK | `Hips`→`SKEL_ROOT` · `Spine`→`SKEL_Spine0` · `Spine1`→`SKEL_Spine1` · `Spine2`→`SKEL_Spine3` · `Neck`→`SKEL_Neck_1` · `Head` · `LeftShoulder`→`SKEL_L_Clavicle` · `LeftArm`→`SKEL_L_UpperArm` · `LeftForeArm`→`SKEL_L_Forearm` · `LeftHand` · `LeftHandThumb1..3`→`SKEL_L_Finger00..02`, `Index`→`1x`, `Middle`→`2x`, `Ring`→`3x`, `Pinky`→`4x` · `LeftUpLeg`→`SKEL_L_Thigh` · `LeftLeg`→`SKEL_L_Calf` · `LeftFoot` · `LeftToeBase`→`SKEL_L_Toe0` (idem `Right…`); também `Chest`, `UpperChest`, `LeftUpperArm`, `LeftLowerArm`, `LeftUpperLeg`, `LeftLowerLeg`, `LeftToes` |
| Unreal (manequim) | `pelvis`→`SKEL_ROOT` · `spine_01/02/03`→`Spine0/1/3` · `neck_01` · `clavicle_l` · `upperarm_l` · `lowerarm_l` · `hand_l` · `thumb_01_l`… · `thigh_l` · `calf_l` · `foot_l` · `ball_l` |
| 3ds Max Biped | `Bip01 Pelvis`→`SKEL_ROOT` · `Bip01 Spine..Spine3` · `Bip01 Neck/Head` · `Bip01 L Clavicle/UpperArm/Forearm/Hand/Thigh/Calf/Foot/Toe0` · `Bip01 L Finger0, Finger01…` (também `Bip001`) |

O quadril de outros rigs vai para `SKEL_ROOT`, não para `SKEL_Pelvis`: em 126 animações reais de emotes, 101 animam a rotação de `SKEL_ROOT` e só 6 a de `SKEL_Pelvis` — é o osso que o jogo usa para girar e deslocar o corpo inteiro. Para estender: acrescentar linhas `alias(nome, alvo)` em `fbx-bone-map.js` (com teste) ou passar `boneMap`.

## 4. Eixos, unidades e tempo (`fbx-convert.js`)

Espaço de destino (modelo do ped): metros, Z para cima, personagem de frente para +Y, lado esquerdo em −X. A rotação animada de `SKEL_ROOT` é a identidade quando o ped está na pose de repouso (confirmado em 101 emotes reais: rotação da raiz no quadro 0 ≈ identidade), embora o `.skel` guarde meia-volta nesse osso; por isso a pose de repouso de destino usa identidade na raiz (`targetRest`).

- **Eixos**: a conversão é uma rotação pura `C`. O eixo "para cima" vem do `GlobalSettings`. O giro em torno dele é escolhido pelos dados: o vetor esquerda→direita da pose de repouso do arquivo (coxas; se faltarem, braços, clavículas, panturrilhas, pés, mãos) é levado, em múltiplos de 90°, ao lado esquerdo do esqueleto do jogo. Isso dispensa confiar no `FrontAxis`, que exportadores preenchem de formas diferentes. Sem um par esquerda/direita mapeado, usa-se o `FrontAxis` declarado (aviso `FBX_ORIENTATION_ASSUMED`). Desvio maior que 15° do eixo: aviso `FBX_REST_NOT_AXIS_ALIGNED`.
- **Escala**: razão entre o comprimento das pernas do esqueleto do jogo e o das pernas do arquivo (coxa→panturrilha→pé), o que torna o resultado independente de centímetros/metros e de escalas no nó do armature; ajusta também a altura do quadril à proporção do ped. Sem pernas mapeadas: `UnitScaleFactor / 100` (aviso `FBX_SCALE_FROM_UNITS`).
- **Tempo**: reamostragem para **30 quadros por segundo** — a convenção dos emotes reais (122 animações do corpus usam base 30) e o que faz o limite de 1800 quadros valer 60 s. `fps: 'source'` mantém a taxa do arquivo (arredondada). Quadros = `round(duração × fps) + 1`; duração gravada = `(quadros − 1)/fps` (aviso `FBX_DURATION_ROUNDED` se mudar mais que 1 ms). Uma única pose vira 2 quadros iguais (`FBX_STATIC_POSE`).

## 5. Conversão das rotações (retarget)

Tudo é feito em espaço de mundo, então não depende de como cada programa orienta os eixos locais de um osso:

1. Avalia a hierarquia do FBX (cadeia completa, incluindo nós pais com rotação/escala) na pose de repouso e em cada quadro.
2. Pose de repouso do arquivo = matrizes da **bind pose** quando existem; senão, a pose padrão dos nós (aviso `FBX_REST_FROM_DEFAULTS`, porque essa pose pode não ser a de repouso).
3. Para cada osso mapeado: `Mundo_alvo(q) = C · Mundo_fbx(q) · Repouso_fbx⁻¹ · C⁻¹ · A · Repouso_alvo`. Ou seja, a rotação que o osso sofreu em relação ao próprio repouso é aplicada, no mundo do jogo, à orientação de repouso do osso do jogo.
4. `A` (**ajuste de pose de referência**) existe porque rigs como o Mixamo repousam em T e o ped do jogo em A (braços ~57° abaixo da horizontal). Para um osso com um filho mapeado claro, `A` é a menor rotação que leva a direção do osso do jogo à direção do osso do arquivo em repouso. Rigs iguais ao do jogo dão `A` = identidade. Ossos ajustados em mais de 2°: aviso `FBX_REST_POSE_ALIGNED`. `SKEL_ROOT`, `SKEL_Pelvis` e `SKEL_Spine_Root` nunca são ajustados. Limite conhecido: o ajuste corrige a direção do osso, não a torção em torno dele — mãos e pés de rigs em T podem ficar com o punho/tornozelo girado.
5. Rotação local gravada = `Mundo_pai⁻¹ · Mundo_osso` no esqueleto do jogo. Osso do jogo sem correspondente, mas com descendente mapeado, é gravado **fixo na rotação de repouso** (`pinnedBones`), para a pose não depender do que o jogo estiver tocando antes. Osso sem correspondente e sem descendente mapeado não recebe trilha.
6. **Posição**: só `SKEL_ROOT` recebe trilha de posição = repouso + `escala · C · (quadril(q) − quadril em repouso)`. O osso do arquivo que move o corpo é o mapeado para a raiz (ou para um filho direto dela); sem ele, aviso `FBX_NO_HIPS`. Translação de outros ossos (esticar) e escala animada não vão para o jogo (avisos).
7. **Root motion**: `keep` deixa todo o deslocamento em `SKEL_ROOT` (o ped se afasta e volta ao fim; aviso `FBX_ROOT_TRAVEL` acima de 0,5 m). `mover` grava o deslocamento horizontal em relação ao primeiro quadro na trilha mover (osso 0, trilha 5) e deixa na raiz só altura e o ponto inicial; sem rotação de mover.

## 6. Saída e limites do perfil de escrita

Um clip, um bloco, canais Static*/QuantizeFloat (PROFILE.md). **Até 1800 quadros (60 s a 30 fps).** Acima disso: `ANIMATION_TOO_LONG` com quadros, limite e segundos — a escrita em blocos múltiplos continua não comprovada e não é emitida. O mesmo take pode caber com `fps` menor. Caso máximo testado: 1800 quadros × 128 ossos (cerca de 1,5 s no teste local, incluindo gerar o FBX).

## 7. Evidências

| # | Prova | Resultado | Onde |
|---|---|---|---|
| F1 | Leitor: binário 7.3/7.4/7.5/7.7, vetores zlib e ASCII descrevem a mesma cena | idênticos | `tests/animation-fbx-parse.test.js` |
| F2 | Entrada inválida: truncamento a cada 7 bytes, 1500 mutações de byte, bomba zlib, orçamentos, ciclo, versão | só erros com código; sem travar | idem |
| F3 | Curvas: constante, linear, cúbica (reproduz `t³` exatamente), pesos, TCB | conforme fórmulas | idem |
| F4 | **Ida e volta**: animação conhecida do esqueleto do jogo → FBX escrito em outros eixos (Y-up, Z-up, quarto de volta), unidades (cm, m, polegada), eixos locais aleatórios por osso, pré-rotações, as 6 ordens de rotação, nó pai girado/escalado, binário e ASCII → YCD → `decodeYcd` | 128 ossos, rotação ≤ 0,05°, raiz ≤ 0,3 mm; 1800 quadros idem | `tests/animation-fbx-convert.test.js` (matemática do gerador separada da do motor) |
| F5 | Rig estilo Mixamo (apelidos, pose T, cm): direção de cada segmento de membro igual à da origem; pernas/coluna com rotação completa exata | ≤ 0,1°; raiz ≤ 0,5 mm | idem |
| F6 | **Blender como escritor independente**: esqueleto freemode + 3 animações exportadas pelo Blender 5.2.2 (Y-up com bind pose; Z-up sem), comparadas por cinemática direta com as poses que o próprio Blender avaliou | 6/6 takes: posição ≤ 0,42 mm, rotação ≤ 0,013° em 128 ossos | `scripts/animation-engine/fbx-interop.mjs`; `tests/animation-fbx-interop.test.js` (opcional) |
| F7 | **Blender como leitor independente**: FBX sintético com pré-rotações e as 6 ordens de rotação importado pelo Blender; posição de cada osso por quadro vs. leitor próprio | 118 ossos × 21 quadros: ≤ 0,005 mm (2 variações) | `scripts/animation-engine/fbx-reader-vs-blender.mjs` |
| F8 | YCDs gerados relidos pelo **CodeWalker** offline (3 amostras) | 3/3 lidos, 101 970 valores sem diferença; regravados e relidos em strict | `Invoke-YcdOracle.ps1` + `compare-oracle.mjs` |
| F9 | Arquivos FBX reais de malha (4, binário 7.4, de 0,8 a 22 MB) | lidos em até 10 ms cada (malhas não são descomprimidas); sem esqueleto → `convertible: false`, `FBX_NO_SKELETON` com frase em pt-BR | conferência manual pela API |

A fixture do Blender não fica no Git (a política do repositório proíbe `.fbx`). Para regenerar e conferir:

```powershell
$blender = (Get-ChildItem "$env:LOCALAPPDATA\RedHornStudio\StudioData\runtime\components\blender-5.2-windows-x64-*\blender.exe").FullName
node scripts/animation-engine/fbx-interop.mjs --blender $blender --out <pasta-fora-do-repo> [--samples <pasta-de-saida-ycd>]
node scripts/animation-engine/fbx-reader-vs-blender.mjs --blender $blender --out <pasta-fora-do-repo>
$env:RPFORGE_FBX_INTEROP_DIR = '<pasta-fora-do-repo>'; node --test tests/animation-fbx-interop.test.js
```

Lição da fixture: o Blender grava em cada take a pose que estiver sobrando nos ossos que a ação não anima. Um FBX com várias ações pode trazer, de fato, um braço levantado nas outras — a conversão é fiel ao arquivo.

## 8. Limites de segurança (`FBX_LIMITS`; a plataforma só pode reduzir)

Arquivo 96 MiB · 600 000 nós · profundidade 48 · 4096 propriedades por nó · vetor decodificado 64 MiB · total decodificado 256 MiB · texto 1 MiB · 8192 nós de cena · 1024 ossos candidatos · 256 takes · 100 000 curvas · 1 000 000 chaves por curva. Custo medido (Node local): FBX do Blender de 3,6 MB com 3 takes → inspecionar ~90 ms, converter ~100 ms, ~32 MB de heap.

## 9. O que é comprovado, inferido e não comprovado

**Comprovado por teste automatizado + comparação independente (offline):** leitura binária 7.x; hierarquia, pré-rotação, ordens de rotação, unidades e eixos (Blender dos dois lados, F6/F7); curvas lineares/constantes densas (um ponto por quadro); conversão de rig igual ao do jogo; escrita do YCD (CodeWalker, F8).

**Comprovado só por teste próprio (sem implementação independente):** ASCII 7.x (nenhum arquivo ASCII real disponível); curvas cúbicas e com peso (o Blender só exporta chaves por quadro, então não serve de oráculo — por isso o aviso `FBX_SPARSE_CUBIC_KEYS`); pivôs/offsets de rotação e escala; ajuste de pose T→A e tabela de apelidos (**nenhum FBX real de Mixamo, Unreal ou Biped foi testado** — não havia nenhum na máquina).

**Inferido de dados reais, sem confirmação no jogo:** raiz com rotação identidade na pose de repouso e personagem de frente para +Y com a esquerda em −X; quadril → `SKEL_ROOT`; ossos sem trilha mantêm a pose anterior do jogo (por isso os intermediários são fixados); base de 30 fps.

**Não comprovado:** reprodução no GTA V/FiveM de qualquer arquivo gerado; efeito da trilha mover; torção de mãos/pés em rigs em T; `InheritType` com escala não uniforme; pré/pós-extrapolação de curvas; blocos múltiplos (recusado).

**Recusado ou limitado de propósito:** FBX 6.x e anteriores; mais de uma camada animada; hierarquia espelhada (escala negativa); `RotationOrder` esférica; mais de 1800 quadros; chaves TCB (viram reta, com aviso); malhas, blendshapes, câmeras e constraints são ignorados.

### Teste no jogo (pela responsável) — o que valida a ferramenta

Três amostras ficam em `D:\RedHorn\output\rpforge-animacao-teste\` com instruções (`LEIA-ME.txt`). Se o braço **esquerdo** subir no lugar do direito, ou o personagem aparecer de costas/deitado, o erro está na convenção de eixos do espaço do ped (§4, "inferido"); se a animação tocar mas com o corpo torto só nos ossos intermediários, está na hipótese dos ossos fixados (§5.5).

## 10. Histórico: ferramenta ia-emotescript (inspecionada sem executar)

`ia-emotescript-main.zip` (SHA-256 `44b82464…`), sem licença: nada foi copiado. Ela usa Blender em segundo plano + Sollumz + CodeWalker, mapa fixo Mixamo→GTA de 52 ossos, retarget absoluto em espaço de mundo com offset por direção anatômica, giro global pelo vetor entre os quadris, deslocamento do quadril escalado pelo comprimento das pernas e gravado em `SKEL_ROOT`. A implementação daqui é independente e usa as mesmas ideias gerais (técnicas públicas), com matemática e testes próprios, sem Blender nem CodeWalker em runtime. Diferença relevante: as tags dos ossos vêm do esqueleto de referência, nunca de hash do nome (a fórmula por nome só acerta 29 ossos auxiliares).
