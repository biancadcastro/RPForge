# Perfil `ycd-skel-v1` — animação esquelética YCD

Versão do motor: `rpforge-animation-engine 0.1.0`. Código: `src/animation-engine/ycd-write.js` (escrita), `ycd-read.js` (leitura), `quat.js`, `sample.js`, `skeleton.js`, `convert.js`.

## Entrada (dados explícitos)

```js
{
  name: 'emote_name',            // ^[a-z0-9][a-z0-9_@-]{0,63}$  (sem caminho/extensão)
  frames: 2..1800,
  fps: 1..120,                   // inteiro: duração = (frames-1)/fps
  // ou duration: segundos (> 0), sem fps — usado para preservar a duração de um arquivo existente
  tracks: [
    {bone: 0..65535, type: 'position',      values: frames*3},  // metros, local ao pai
    {bone: 0..65535, type: 'rotation',      values: frames*4},  // quaternion x,y,z,w, local ao pai
    {bone: 0,        type: 'moverPosition', values: frames*3},  // root motion
    {bone: 0,        type: 'moverRotation', values: frames*4},
  ],
}
```

`bone` é a **tag** do osso (identificador semântico do jogo), nunca índice. O motor não converte nome→tag nem remapeia: quem chama resolve tags pelo esqueleto de referência (`skeleton.js`), e `matchAnimation` acusa tags ausentes (`SKELETON_MISMATCH` quando exigido). Par (osso, tipo) duplicado é `INVALID_INPUT`. Euler não é aceito.

## Convenções

- **Quaternions**: ordem x,y,z,w; q ≡ −q. Entrada com |q| fora de 1 ± 0,005 é recusada (`INVALID_QUATERNION`); dentro, é normalizada (quantização de arquivos reais chega a 0,27%). NaN/∞ → `NONFINITE_VALUE`.
- **Continuidade**: amostras consecutivas são alinhadas ao mesmo hemisfério (relatório informa `hemisphereFlips`), para a interpolação seguir o caminho curto.
- **Rotação constante**: gravada como StaticQuaternion (x,y,z; w reconstruído ≥ 0), após trocar q por −q se w < 0. Se o w reconstruído errar mais que `staticRotationAngleTolerance` (perto de 180°), grava 4 StaticFloat exatos.
- **Tempo**: frame i no tempo i/fps; amostragem entre frames: posição por interpolação linear, rotação por nlerp com alinhamento de hemisfério (`sample.js`). Fora de [0, duração] satura.
- **Root motion**: explícito, só pelas trilhas mover (5/6, osso 0). O motor não extrai nem soma root motion de outros ossos. Com mover, `flags = 16`.
- **Estrutura gravada**: 1 clip `pack:/<nome>.clip`, 1 animação, 1 bloco de sequência (`chunkSize 255`, `limit = frames + 30`), BoneIds ordenados por (trilha, tag), tipo de dado 0/1, UsageCount 2, VFTs 0, `Unknown_1Ch` 0. Cada escolha segue o padrão dominante no levantamento ou a referência; nenhuma foi verificada no jogo.

## Codificação e tolerâncias

| Modo | Canais animados | Erro |
|---|---|---|
| `quantized` (padrão) | QuantizeFloat por componente; componente constante → StaticFloat | posição ≤ 1e-4 m; componente de quaternion ≤ 5e-5 ⇒ ângulo ≤ 2‖Δq‖ ≤ 2·√4·5e-5 = 2e-4 rad (0,011°) |
| `raw` | RawFloat (exato em float32) | ≤ arredondamento float32 (~6e-8) |

O writer escolhe o menor número de bits que cumpre a tolerância, **decodifica com a mesma fórmula float32 do leitor** e mede o erro real por trilha (`report.tracks[].maxPositionError/maxAngleError`). Se não cabe em 24 bits, usa RawFloat. Tolerâncias configuráveis entre 0 e 0,1.

Comparações: posição em metros (máx. por componente), rotação pelo ângulo `2·acos(|q1·q2|/(|q1||q2|))` — invariante a q/−q e à normalização. A verificação de transformação usa 2,5e-4 rad (o limite acima mais folga float32). Não há acúmulo de erro: cada frame é codificado independentemente (sem deltas), então o erro não cresce com a duração — confirmado no caso de 1800 frames (mesmo máximo que 31 frames).

## Recusas do perfil

Frames fora de 2–1800, mais de 512 trilhas, nome inválido, tipos de trilha fora da lista, mover com osso ≠ 0, posição |v| > 10 km, saída acima do limite (`OUTPUT_TOO_LARGE`). Nada é gravado parcialmente: o writer lança antes de existirem bytes, e `writeYcd` (API) ainda relê a saída em modo strict antes de devolvê-la.

## Reencode (`ycd.reencode`)

Lê um YCD qualquer suportado pelo leitor, seleciona um clip, converte para o perfil e verifica semanticamente contra a origem. Tags/propriedades do clip, metadados desconhecidos da animação (`flags` diferentes, `Unknown_1Ch`, hash de sequência), trilhas fora do perfil e outros clips **só são descartados se a categoria vier em `discard`**, e todo descarte volta listado em `discarded`. Clip com start/end/rate fora do padrão é recusado.
