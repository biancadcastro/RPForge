# Proposta de integração — motor de animações (para revisão, não aplicada)

Nada aqui altera o contrato compartilhado (`RPFORGE-CONTRATO-UI-API.md`), o Worker do motor na API ou configurações de implantação. É a superfície que este módulo oferece; a integração será feita depois, separadamente.

## Módulo

`src/animation-engine/index.js` — ESM puro. Dependências: `node:zlib` (Workers com `nodejs_compat`) e `../rsc7.js`. Sem filesystem, rede, processos, eval, banco, filas, segredos, créditos ou autenticação (teste `engine core stays pure`). Bundle de benchmark: 77,5 KB. Não deve ser distribuído no app ou navegador.

```js
export const ENGINE = {name: 'rpforge-animation-engine', version: '0.1.0', profiles: ['ycd-skel-v1']};
inspectYcd(bytes, {limits?, signal?})            // estrutura, notas, veredito strictProfile
decodeYcd(bytes, {limits?, strict?, times?, signal?}) // amostras Float32Array por trilha (+ amostragem opcional)
writeYcd(animation, {encoding?, limits?, signal?})    // bytes + relatório de erro por trilha; relido em strict antes de retornar
reencode(bytes, {clip?, name?, discard?, encoding?, limits?, signal?}) // bytes + discarded + verification
matchSkeleton(bytes, skelText, {require?, limits?, signal?})          // tags presentes/ausentes no esqueleto
```

Todas retornam `{ok: true, engine, ..., metrics: {wallMs}}` ou `{ok: false, engine, error: {code, message, details?}, metrics}`. Nunca lançam para erro de formato; nunca retornam bytes parciais. Erro inesperado vira `{code: 'INTERNAL'}` sem stack.

Pelo RPC do Worker do motor (`WorkerEntrypoint`), sugerimos os métodos `animationInspect`, `animationWrite`, `animationReencode` com o mesmo formato; `Uint8Array` atravessa o RPC por cópia estruturada. Entrada = bytes já validados por tamanho na API; saída = bytes + JSON. Persistência, R2, fila, idempotência, créditos e estados de plataforma ficam fora do motor.

## Entradas

- `bytes`: `Uint8Array`/`ArrayBuffer` de um YCD (RSC7 v46).
- `animation`: ver PROFILE.md (nome, frames, fps **ou** duration, trilhas por tag).
- `encoding`: `{mode: 'quantized'|'raw', positionTolerance, rotationComponentTolerance, staticRotationAngleTolerance}`.
- `discard`: subconjunto de `clipTags, clipProperties, unsupportedTracks, animationMetadata, otherClips` — decisão do usuário/revisão, nunca implícita.
- `limits`: subconjunto de `DEFAULT_LIMITS`; valores acima do máximo do motor são rejeitados (`RangeError` → tratar como bug do chamador).
- `signal`: `AbortSignal`; verificado entre estágios (cancelamento cooperativo, não preemptivo).

## Códigos de erro (estáveis)

`INVALID_INPUT, INPUT_TOO_LARGE, OUTPUT_TOO_LARGE, INVALID_ENVELOPE, DECOMPRESSION_FAILED, LIMIT_EXCEEDED, POINTER_OUT_OF_RANGE, INCONSISTENT_REFERENCE, CYCLE, OVERLAPPING_BLOCKS, UNREFERENCED_DATA, UNKNOWN_FIELD, UNSUPPORTED_STRUCTURE, UNSUPPORTED_CHANNEL, NONFINITE_VALUE, INVALID_QUATERNION, ROTATION_ENCODING (reservado), SKELETON_INVALID, SKELETON_MISMATCH, CANCELLED, INTERNAL`.

Sugestão de classificação na plataforma: `INVALID_INPUT/…/SKELETON_MISMATCH` → erro do arquivo/pedido (não reprocessar, não cobrar); `LIMIT_EXCEEDED/INPUT_TOO_LARGE/OUTPUT_TOO_LARGE` → fora da capacidade do perfil; `CANCELLED` → sem resultado; `INTERNAL` → falha do motor (reter entrada, alertar).

## Diagnósticos e metadados de validação

- `notes[]` (inspect): `{code: 'UNKNOWN_FIELD'|'UNSUPPORTED_STRUCTURE'|'UNREFERENCED_DATA', path, value|details}` — exibíveis na revisão ("o arquivo tem eventos de clip que não serão preservados").
- `strictProfile`: `'ycd-skel-v1'` quando o arquivo é integralmente do perfil.
- `report` (write): por trilha codificação usada, `maxPositionError` (m), `maxAngleError` (rad), `hemisphereFlips`; tamanho do bloco, bits por frame, bytes de saída.
- `verification` (reencode): `maxPositionError`, `maxAngleError`, pior trilha/tempo, `diffs` estruturais (vazio = ok).
- Para cache/aprovação: chave = hash da entrada + `ENGINE.version` + perfil + parâmetros normalizados. A versão muda sempre que bytes de saída mudarem.

## Medições disponíveis

`metrics.wallMs` por chamada (tempo de parede dentro do isolate). Medições detalhadas e limitações em PERFORMANCE.md. CPU faturada remota não medida.

## Limites recomendados para começar (Worker)

Entrada ≤ 4 MiB comprimida, região ≤ 8 MiB, perfil ≤ 1800 frames / 512 trilhas; uma operação de escrita/reencode por isolate de cada vez até medir memória remota (~60–66 MB transitórios no maior caso local).

## Fora do motor (decisão da plataforma)

Planos, créditos, disponibilidade, estados de job, retenção, nomes de arquivo de saída, publicação, preview web (o motor fornece amostras; o navegador só apresenta).
