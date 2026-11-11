# Ferramenta enviada (ia-emotescript), importação FBX e retarget

## 1. Inspeção de `ia-emotescript-main.zip` (sem executar nada)

Arquivo: `C:\Users\bianc\Downloads\ia-emotescript-main.zip`, SHA-256 `44b82464a5065a3a9c80e33c233399ba604e11fd746f9e3045c0a08e5d7ee26b`, 41 entradas. Foram extraídos para uma pasta temporária **apenas** `.py/.md/.ps1/.spec` e lidos como texto. Não foram executados: `dist/FBX2YCD.exe` (14,8 MB, PyInstaller), `build/*.pkg/.pyz`, `.pyc`, scripts PowerShell, Blender.

**Licença:** nenhum arquivo LICENSE/aviso no ZIP. Sem licença explícita, nada do código pode ser copiado ou traduzido para o motor proprietário. O que segue descreve comportamento para orientar uma reimplementação independente.

| Item | O que a ferramenta faz |
|---|---|
| Entrada | FBX (rig Mixamo `mixamorig:*` ou rig GTA `SKEL_*`); template `.blend` masculino/feminino |
| Execução | `blender --background --python fbx2ycd.py` (bpy, mathutils) + addon **Sollumz** (GPL-3.0) para gerar CodeWalker XML; binário via CodeWalker.Core em PowerShell (`xml2ycd.ps1`) |
| Retarget | Mapa fixo Mixamo→GTA de 52 ossos (corpo + 30 falanges). Retarget **absoluto em espaço de mundo**: cada osso de destino copia a orientação de mundo do osso de origem, com um offset constante por osso calculado no rest pose alinhando a *direção anatômica* (vetor até o próximo osso da cadeia) |
| Correções | Yaw global pelo vetor quadril-esq→quadril-dir; root motion = deslocamento do quadril em relação ao **1º frame**, escalado pela razão de comprimento de perna (coxa→pé), gravado no `SKEL_ROOT`; *ground fix* pelo mínimo da altura dos pés; filtro triangular opcional (meia-janela 0–3) em quaternions e root motion; offset Z opcional |
| Tempo | todos os frames inteiros do range da action; fps da cena após o import (fallback 30); duração = (fim−início)/fps |
| Preview | Blender Workbench, MP4 480×640, até 60 s |
| Saída | `.ycd.xml` (Sollumz) e, se configurado, `.ycd` via CodeWalker |

**Pressupostos e riscos encontrados:**
- A documentação interna afirma que *bone tags são calculados pelo nome (hash ELF)*. Conferido contra os `.skel` de referência: a fórmula só reproduz 29 tags de ossos auxiliares; os ossos `SKEL_*` têm tags fixas (Pelvis 11816 vs 56200 calculado). Se a ferramenta realmente gerar tags por nome, animaria ossos errados; não verificado porque o código do Sollumz e os templates não foram executados.
- Template `.blend`: `TEMPLATE MALE.blend` (Blender 3.01, SHA-256 `3bd8f9c4…`), `TEMPLATE FEMALE.blend` (3.03, `cec2464f…`) — identificados só pelo cabeçalho; contêm o ped (derivado de assets da Rockstar) e possivelmente scripts; **não abertos**. Direitos de redistribuição não verificados. O motor não precisa deles: rig/rest pose vêm dos `.skel` (dados).
- Vídeo→mocap é delegado a serviços externos (QuickMagic, Rokoko, DeepMotion); não há IA no código.

**Reimplementável de forma independente:** mapeamento de nomes Mixamo (fatos de nomenclatura públicos), retarget por orientação de mundo com offset de rest pose (técnica geral), root motion com escala por comprimento de perna, ground fix e suavização — todos como operações versionadas e verificáveis, com nossa própria matemática. **Depende de dados ausentes:** um FBX Mixamo autorizado (não há nenhum `.fbx` local), a pose/rest do rig Mixamo usada pelo fornecedor e validação no jogo.

## 2. Leitura de FBX — opções

| Opção | Licença | Runtime Worker | Avaliação |
|---|---|---|---|
| Parser próprio de FBX binário 7.x (árvore de nós, arrays deflate) | proprietária | sim (JS puro + `node:zlib`) | **Recomendado** para produção: formato de nós é simples; só precisamos de Objects/Connections/AnimationStack/Layer/CurveNode/Curve/Model/Pose |
| ufbx (C, arquivo único) | MIT **ou** domínio público (Unlicense) — confirmar no repositório antes de usar | via WASM (~centenas de KB) | Melhor **oráculo offline**; alternativa de produção se o parser próprio não fechar o perfil |
| three.js `FBXLoader` (já em devDependencies, v0.186.1) | MIT | depende de `three` | Oráculo offline secundário em Node (curvas/hierarquia) |
| Autodesk FBX SDK | proprietária Autodesk, nativa | não | Fora (nativo, termos de redistribuição) |
| assimp / OpenFBX | BSD-3 / MIT | WASM pesado | Sem vantagem sobre ufbx |
| Blender | GPL | não | Proibido em runtime; no máximo oráculo manual offline |

## 3. Perfil FBX proposto (`fbx-mixamo-v1`)

FBX **binário 7.4/7.5** (ASCII recusado até haver corpus); 1 AnimationStack selecionado explicitamente; 1 layer; esqueleto único com prefixo `mixamorig`/`mixamorig\d*:`; unidades do `GlobalSettings` (UnitScaleFactor, Up/Front/Coord axis) aplicadas explicitamente; curvas `Lcl Rotation` (Euler com `RotationOrder` declarado → quaternion por conversão definida), `Lcl Translation`; `PreRotation/PostRotation/RotationPivot/ScalingPivot` aplicados por fórmula FBX documentada; interpolação de chaves cúbica/linear/constante amostrada nos frames do perfil; limites: ≤ 1800 frames, ≤ 128 ossos, ≤ 32 MiB. Recusar: constraints, blendshapes, múltiplos personagens/stacks implícitos, escala animada não uniforme, layers adicionais.

## 4. Arquitetura (estágios separados e testáveis)

```
FBX bytes ─▶ fbx/parse (árvore de nós, limites) ─▶ fbx/scene (modelos, hierarquia, curvas)
          ─▶ normalize (eixos/unidades → metros, Z-up do GTA; Euler→quaternion; tempo → frames)
          ─▶ map (Mixamo nome → tag do .skel alvo; ausentes/ambíguos = erro)
          ─▶ retarget (rest Mixamo → rest .skel; root motion; opções versionadas)
          ─▶ ycd-skel-v1 writer (já comprovado) ─▶ verificação semântica
```
Cada transformação geométrica (troca de eixo, escala de unidade, correção de pose) é registrada no relatório com seus parâmetros.

## 5. Retarget — critérios para a etapa própria

- Entrada: animação normalizada + rest pose de origem + `.skel` alvo (masculino ou feminino, escolhido explicitamente).
- Mapeamento só por tabela versionada; osso sem par = erro, nunca adivinhado.
- Métricas de aceite (por clip, em espaço de mundo do alvo, via FK de `skeleton.js`): erro de direção dos segmentos dos membros vs origem ≤ 2° (p95); deslize de pé durante contato ≤ 2 cm; penetração no chão ≤ 1 cm; continuidade (ângulo entre frames sem saltos > 3× a mediana); duração e fps preservados; root motion com escala reportada.
- Oráculo: mesma animação aplicada no Blender **manualmente e offline** por pessoa autorizada, ou ufbx + FK próprio comparando posições de juntas.

## 6. Próxima prova FBX concreta

1. Obter 3 FBX Mixamo **autorizados** (idle, caminhada com deslocamento, dança com giro) e registrar origem/licença.
2. Parser binário próprio + comparação de hierarquia/curvas contra ufbx (WASM ou CLI de teste) — mesmo método deste motor (inspect, mutação, oráculo).
3. Normalização + mapeamento → `ycd-skel-v1` sem retarget (rig GTA no FBX), comparado pelo oráculo YCD.
4. Só então retarget Mixamo→GTA com as métricas acima, e teste no jogo.
