# Desempenho — medições locais (06/11/2026)

**Ambiente:** i7-13650HX (20 threads), 31,6 GiB, Windows 11 26300 (notebook; frequência varia). Node v24.22.0 (V8 13.6, zlib 1.3.2.1). workerd 1.20261101.1 local (`workerd serve`, `nodejs_compat`, data 2026-11-01), bundle 77 516 bytes, sem bindings, `fetch` desviado para um stub 503 (registrado: *stubbed*).

**Método:** por caso/operação, 5 chamadas de aquecimento (3 no workerd), depois 30 lotes (15 no workerd) de *k* chamadas, *k* escolhido para o lote durar ≥ 20 ms (≥ 50 ms no workerd, cujo relógio é grosso). Valores = ms por chamada (média do lote); p50/p95 sobre os lotes — **não** são percentis de chamadas individuais. CPU (Node) = `process.cpuUsage` do processo inteiro (inclui threads do GC). workerd = tempo de parede dentro do isolate; não é CPU faturada. Execução sequencial, sem concorrência.

**Casos:** sintéticos `small` (21 trilhas, 31 frames, 4,5 KB), `emote` (130 trilhas, 300 frames, mover, 223 KB), `long` (128 trilhas, 1800 frames = 60 s a 30 fps, 1,30 MB), e um emote real de terceiros (172 trilhas, 1641 frames, 490 KB, SHA-256 `4751bd36…`; só lido).

## Resultados (p50 / p95, ms por operação)

| Caso | Operação | Node | CPU Node p50 | workerd local | Antes da otimização (Node p50) |
|---|---|---:|---:|---:|---:|
| small | ler (strict, inclui inflate) | 0,22 / 0,30 | 0,25 | 0,32 / 0,37 | 0,54 |
| small | escrever quantizado (inclui deflate) | 0,56 / 0,64 | 0,50 | 0,80 / 0,95 | 3,33 |
| small | reencode | 1,2 / 1,3 | 1,0 | 2,7 / 3,2 | 4,0 |
| emote | ler | 8,2 / 9,0 | 7,8 | 17,3 / 22,0 | 18,5 |
| emote | amostrar todas as trilhas a 30 Hz | 2,4 / 4,9 | 2,0 | 6,4 / 6,8 | 4,9 |
| emote | escrever quantizado | 17,2 / 19,1 | 16,0 | 29 / 31,5 | 173 |
| emote | escrever raw | 22,9 / 25,1 | 31 | 39 / 42,5 | 453 |
| emote | inflate / deflate nível 6 | 0,67 / 4,2 | — | 1,0 / 6,6 | 1,1 / 7,9 |
| emote | reencode | 47 / 54 | 47 | 107 / 111 | 254 |
| long | ler | 43,6 / 47,8 | 47 | 92 / 101 | 100,5 |
| long | amostrar 30 Hz | 11,8 / 12,4 | 15,5 | 35 / 45,5 | 28,9 |
| long | escrever quantizado | 121 / 157 | 125 | 166 / 180 | 1021 |
| long | escrever raw | 179 / 218 | 187 | 225 / 237 | 2577 |
| long | inflate / deflate | 4,2 / 32,8 | — | 6,0 / 39 | 6,2 / 42,9 |
| long | reencode | 299 / 494 | 313 | 575 / 612 | 1498 |
| real 1641 f | ler (inspect) | 38,6 / 43,8 | 32 | 39 / 45 | 43,5 |
| real 1641 f | reencode | 358 / 484 | 359 | 343 / 366 | 615 |

Tamanhos: `quantized` é 2,2–2,7× menor que `raw` (long: 1,30 MB × 3,45 MB). O desvio-padrão entre lotes chega a 15–25% no caso long; a mesma operação **não alterada** (inflate) variou ~30% entre execuções no mesmo dia — trate números isolados como ruidosos.

**Otimização aplicada (commit `d8f4c9e`)**, guiada pelo perfil de CPU: escrita de bits por palavra num `Uint32Array` pré-alocado (antes: um laço por bit com `Math.pow`), leitura com janela de 5 bytes, laços sem closures. Escrita 4,5–14× mais rápida; os bytes de saída ficaram idênticos (hashes do corpus sintético já validados pelo oráculo). Gargalos restantes: planejamento por trilha (~16%), zlib (~14%), decodificação de canais (~12%).

## Memória (limitações)

Crescimento de heap V8 + ArrayBuffers logo após **uma** chamada, sem GC entre o início e o fim: inclui lixo, é um limite superior de alocação transitória, não pico real nem memória de isolate. Máximo por caso: small 4 MB, emote 60 MB, long 63 MB, real 66 MB. `maxRSS` do processo de benchmark inteiro: 375 MB. O limite de 128 MB por isolate do Workers não foi medido; os ~60–66 MB transitórios nos casos grandes indicam que concorrência dentro de um isolate e animações maiores que o perfil exigem medição antes de liberar.

## Tempo de tarefa e custo

Tempo total de uma requisição local ao workerd (bundle já carregado, executando o benchmark inteiro): 56 s — é a soma das repetições, não uma tarefa. Uma tarefa realista de reencode de emote longo fica entre ~0,3 s (Node) e ~0,6 s (workerd local) de parede. **CPU faturada pela Cloudflare não foi medida**; não converter estes números em custo sem um ensaio remoto autorizado. Limite padrão de CPU por invocação do Workers (30 s) está duas ordens de grandeza acima do maior caso medido.

## Reproduzir

```powershell
node --expose-gc scripts/animation-engine/bench/bench-node.mjs <saida.json> [externo.ycd]
node scripts/animation-engine/bench/bench-workerd.mjs <RPForge-API>\node_modules <pasta-saida> [externo.ycd]
```
O runner workerd só importa `esbuild` e executa `@cloudflare/workerd-windows-64` de um `node_modules` já instalado (sem modificá-lo), sem conta, sem wrangler e sem config compartilhada.
