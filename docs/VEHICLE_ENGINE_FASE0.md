# Motor de veículos: fase 0 (13/11/2026)

Pesquisa técnica do Editor de veículos (plano em `D:\RedHorn\Desenvolvimento\RPForge-Editor-Veiculos-Plano.md`, seções 4, 6 e 8).
O código fica em `src/vehicle-engine/`. Ainda não está ligado ao app nem ao site.

Legenda: **[V]** verificado (teste, oráculo ou arquivo do jogo) · **[I]** inferido, falta conferir.

## Resumo

| Objetivo | Resultado |
|---|---|
| Ler YFT de veículo no motor próprio | **Feito [V].** 337 de 337 YFTs do acervo local batem 100% com o oráculo (1.087.879 conferências, colisão incluída). A M3 abre em cerca de 0,1 s. |
| Ida e volta sem mudanças | **Feito [V].** As páginas descomprimidas saem idênticas byte a byte, e o oráculo lê o resultado igual ao original. O arquivo comprimido não fica idêntico; explicação abaixo. |
| Editar e regravar | **Prova feita [V].** Editar no mesmo lugar (osso, parâmetro de shader) e mover um bloco para uma página nova funcionam, conferidos pelo oráculo. |
| Estrutura do vehiclelayouts | **Feito [V].** Tirada dos arquivos do GTA instalado: 386 `LAYOUT_*`, 935 veículos. Detalhes em [vehicle-engine/VEHICLELAYOUTS_PESQUISA.md](vehicle-engine/VEHICLELAYOUTS_PESQUISA.md). |
| Gravar YFT com peças e ossos novos | **Base pronta [V].** O gravador completo (reempacotar páginas e reescrever ponteiros) funciona em 335 de 337 arquivos do acervo, conferido pelo oráculo. As 2 recusas têm cloth. Faltam as operações de acrescentar osso, geometria e shader. |

## O que o leitor entrega

`readYft(bytes)` devolve `{model, view, resource}`. O modelo traz:

- **Fragmento:** nome (`pack:/REDHORNM3BIBIS`), esfera de contorno, gravidade e flutuação.
- **Drawable principal**, com os modelos de cada LOD (`high/med/low/vlow`) e as distâncias de LOD. Cada geometria traz:
  - número de vértices e de índices;
  - stride e declaração de vértice (posição, pesos, índices de osso, normal, cores, UV0–7, tangente) com tipo e deslocamento;
  - tabela de ossos da geometria;
  - índice do shader.
  - `geometryPositions()` e `geometryIndices()` extraem a malha para a prévia 3D.
- **Esqueleto:**
  - cada osso traz nome, tag, índice, pai, irmão, flags, rotação, translação e escala;
  - também são lidas a tabela de pais, as matrizes, os índices de filhos e a tabela de busca por tag;
  - `stats.bones` vem com `boneLimit: 128` e `bonesOverLimit`, e `stats.seatBones` lista os ossos `seat_*`.
- **Shaders e materiais:**
  - cada shader traz o arquivo `.sps` (ex.: `vehicle_paint1.sps`), o render bucket e os parâmetros;
  - cada parâmetro é uma textura (pelo nome, que é a referência ao YTD) ou um vetor/lista de vetores com o valor;
  - as texturas embutidas no próprio YFT também são lidas;
  - `stats.referencedTextures` traz a lista do que precisa existir no `.ytd`.
- **Física:**
  - LOD de física com grupos (nome, pai, filhos, janela de vidro, massa) e filhos (grupo, tag do osso, massa, drawable da peça e versão danificada);
  - colisão composta com o tipo de cada filho (geometry, disc, box…).
- **Extras:** luzes do modelo, vidros (`VehicleGlassWindows`), cloth, drawables extras.
- `model.warnings`: o que o arquivo tem de estranho mas o jogo aceita. Exemplos: contagem de página divergente, e campos zerados por mods "protegidos" (que o leitor contorna usando a contagem do buffer, como o jogo faz).
- `coverage(view)`: quanto do arquivo foi explicado.
  - A colisão também é mapeada por dentro: vértices, polígonos, materiais, octantes e BVH, com contagens conferidas pelo oráculo.
  - No acervo inteiro, só 0,058% dos bytes não-nulos ficam sem explicação (mediana por arquivo: 0,018%; p90: 0,2%).
  - O pior caso é a gaiola da XCLASSPOL (11%), que tem cloth (`EnvironmentCloth`). O cloth ainda não é mapeado e só aparece nesse arquivo.
  - Na M3 sobram 2.131 bytes, em campos pequenos soltos.

Recusas são tipadas (`EngineError` com `code`), como no motor de animação: ponteiro fora da região, string sem terminador, contagens incoerentes, osso com pai inválido.

### Prova contra carros reais [V]

**REDHORNM3BIBIS:**
- 119 ossos, só LOD alto (1 modelo, 101 geometrias, 292.515 triângulos, 264.298 vértices);
- 112 shaders, nenhuma textura embutida;
- 22 grupos e 22 filhos de física, colisão composta;
- assentos `seat_dside_f`, `seat_pside_f`, `seat_dside_r`, `seat_pside_r`;
- colisão: 17 geometrias, 4 discos e 1 caixa (a primeira geometria tem 943 vértices, 1.665 polígonos e 2 materiais);
- todas as conferências iguais.

**Acervo local** (`D:\RedHorn\Loja\**\*.yft`, 337 arquivos: carros, `_hi`, mods de tuning, motos, helicópteros, barcos, caminhões):
- 337 de 337 iguais ao oráculo;
- distribuição de LODs: 305 só com o LOD alto, 18 com os quatro, 10 com três, 2 com dois;
- o maior arquivo tem 1,95 milhão de triângulos e abre em 0,3 s;
- o máximo de ossos é 127;
- 103 arquivos têm mais de 100 ossos, ou seja, muitos carros estão perto do limite de 128;
- 123 têm `VehicleGlassWindows`, 19 têm texturas embutidas e 8 têm luzes no modelo.

O que o oráculo confere, campo a campo: nome; colisão (tipo de cada filho, vértices, polígonos, materiais, nós da BVH); ossos (nome, tag, índice, pai, irmão, flags, translação, rotação); por LOD e geometria, o shader, vértices, índices, stride, flags e tipos da declaração e a tabela de ossos; shaders (nome, arquivo, bucket, hash e tipo de cada parâmetro, nome da textura); texturas embutidas; contagem de vidros e luzes; física (grupos, filhos, massa, drawables, colisão, LOD 2).

Diferenças de leitura que foram tratadas:
- Os nomes dos grupos de física ficam num bloco próprio. Nos arquivos salvos pelo CodeWalker esse bloco aponta para dentro do grupo; nos outros, não.
- Nomes com bytes fora de ASCII, como `hänsch` e os nomes ofuscados do Defender "protegido": o oráculo decodifica como UTF-8 e o motor como latin1. A comparação dobra esses bytes.

## Ida e volta

1. **Envelope [V].** `decodeYftResource` → `encodeYftResource` com as mesmas flags de página: as páginas saem idênticas e nenhum ponteiro se move.
   - O arquivo comprimido **não** fica idêntico. Testamos o deflate do Node em todos os níveis de 1 a 9 com memLevel 8 e 9, e nenhum reproduz o original, que foi feito por outro compressor.
   - O nosso fica cerca de 3–4% maior no nível 6 (M3: 12,05 MB contra 11,65 MB). Isso não muda nada para o jogo, que só vê as páginas descomprimidas.
   - "Idêntico" aqui quer dizer: páginas iguais byte a byte.
2. **Regravação de todos os campos entendidos [V].** `writeYft(read)` escreve de volta, no mesmo endereço:
   - nomes, ossos e tabela de pais;
   - shaders e vetores de parâmetros;
   - distâncias de LOD e máscaras;
   - posições de vértice, luzes e massas de física.
   - Na M3, a saída é idêntica às páginas originais, e o oráculo lê o resultado igual ao original (0 diferenças).
3. **Edição no lugar [V].** Movemos `seat_dside_f` 5 cm em Z e trocamos um vetor do shader 0.
   - O oráculo vê exatamente essa mudança, e mais nada: o osso aparece alterado no esqueleto principal e nos 22 filhos de física, que compartilham o mesmo esqueleto.
   - Um nome mais longo que o espaço que ele ocupa é recusado (`UNSUPPORTED_STRUCTURE`), porque exige realocação.
4. **Realocação [V].** `relocateBlock` anexa uma página de sistema no fim da região, para que nenhum endereço existente mude:
   - move a tabela de 119 ossos para a página nova e atualiza o ponteiro;
   - zera a cópia antiga;
   - recria o bloco de informações de página com uma página a mais.
   - O oráculo e o motor leem o esqueleto idêntico.

Como repetir com o oráculo (offline, Windows PowerShell 5.1, fora do produto):

```
node scripts/vehicle-engine/make-edit-fixtures.mjs <yft> <pasta-fora-do-repo>
powershell.exe -File scripts/vehicle-engine/Invoke-YftOracle.ps1 -ListFile <lista> -OutDirectory <pasta> -LibraryDirectory <CodeWalker> -Blocks 0
node scripts/vehicle-engine/compare-oracle.mjs <pasta>
```

Os testes ficam em `tests/vehicle-engine.test.js` (`node --test`). São 9 testes:
- 5 sintéticos: envelope, páginas anexadas, realocação, recusas, nomes;
- 4 com a M3: resumo, regravação idêntica, edição, realocação.
- Os testes com a M3 são pulados se o arquivo não existir (`RPFORGE_TEST_YFT` troca o caminho). O carro é de cliente e nunca entra no repositório.

## Layout de assentos (§6 do plano) [V]

Resumo da pesquisa feita nos arquivos do GTA instalado (detalhes, exemplos de XML e tabela dos 386 layouts em [vehicle-engine/VEHICLELAYOUTS_PESQUISA.md](vehicle-engine/VEHICLELAYOUTS_PESQUISA.md)):

- **Onde ficam:** `common.rpf\data\ai\vehiclelayouts.meta`, que é substituído por `update\update.rpf\common\data\ai\vehiclelayouts.meta`. Os DLCs ficam em `dlcpacks\<dlc>\dlc.rpf\common\data\ai\vehiclelayouts*.meta`, e os patches em `update.rpf\dlc_patch\...`.
- **Cadeia:** `vehicles.meta <layout>` → `CVehicleLayoutInfo`, que tem:
  - **`Seats[]`:** `SeatInfo` → `CVehicleSeatInfo`, com:
    - `SeatBoneName` (o osso do YFT, ex.: `seat_dside_f`);
    - `ShuffleLink`, `ShuffleLink2` e `RearSeatLink`;
    - `SeatFlags` e `DefaultCarTask`.
  - **`Seats[]`, animação sentado:** `SeatAnimInfo` → `CVehicleSeatAnimInfo`, com:
    - `InsideClipSetMap` (clipset sentado);
    - `DriveByInfo` → `CVehicleDriveByInfo` → `DriveByAnimInfos` → `CDrivebyWeaponGroup`.
  - **`EntryPoints[]`:** `EntryPointInfo` → `CVehicleEntryPointInfo`, com:
    - `DoorBoneName`, `SecondDoorBoneName` e `DoorHandleBoneName`;
    - `WindowId`, `VehicleSide` e `AccessableSeats[]`;
    - `VehicleExtraPointsInfo` e `Flags`.
  - **`EntryPoints[]`, animações:** `EntryPointAnimInfo` → `CVehicleEntryPointAnimInfo`, com:
    - os clipsets de entrar e sair;
    - `EntryTranslation` e `EntryHeadingChange`.
  - **Campos do próprio layout:**
    - `LayoutFlags`, `HandsUpClipSetId` e `SteeringWheelOffset`;
    - `MaxXAcceleration` e `AnimRateSet`;
    - os clipsets de 1ª pessoa.
- **Câmera de 1ª pessoa e drive-by no vehicles.meta:**
  - `povCameraName` e `PovCameraOffset`, além dos offsets de passageiro;
  - `FirstPersonDriveByIKOffset` e família;
  - `firstPersonDrivebyData` → `CFirstPersonDriveByLookAroundData`. Há um item por assento, na ordem dos assentos [I].
- **Ossos que o jogo procura no YFT:**
  - assentos: `seat_dside_f/pside_f/dside_r/pside_r`, `seat_dside_r1…r6`, `seat_pside_r1…r6`, `seat_f`, `seat_r`, `seat_a/b/c`;
  - portas: `door_dside_f/pside_f/dside_r/pside_r` e `boot`;
  - maçanetas: `handle_*`;
  - janelas: o meta usa o enum `WindowId`; o motor do jogo liga cada valor a um osso `window_*` [I].
- **`LAYOUT_*` reais:**
  - **386** layouts no total, usados por **935** veículos;
  - mais usados: `LAYOUT_STANDARD` (84), `LAYOUT_LOW` (69), `LAYOUT_LOW_RESTRICTED` (47), `LAYOUT_TRUCK` (34), `LAYOUT_STD_EXITFIXUP` (25), `LAYOUT_VAN` (20), `LAYOUT_BIKE_SPORT` (18), **`LAYOUT_STD_HIGHWINDOW` (16)**;
  - `LAYOUT_STD_HIGHWINDOW` tem 4 assentos (`SEAT_STANDARD_*` com `SEAT_ANIM_STD_HIGHWINDOW_*`), 4 entradas (`ENTRY_POINT_STANDARD_*` com `ENTRY_POINT_ANIM_STD_BOBCAT_*`) e é usado, por exemplo, pelo baller.
- **Mods:** em 522 arquivos de layout dos recursos da base, o padrão é criar um layout com nome próprio reaproveitando os `SEAT_*`, `SEAT_ANIM_*` e `ENTRY_POINT_*` do jogo (463 arquivos).
  - 39 arquivos copiam o vehiclelayouts inteiro do jogo.
  - O fxmanifest usa `data_file 'VEHICLE_LAYOUTS_FILE'` com glob.
  - **Conflitos reais encontrados:**
    - `LAYOUT_LANCER` aparece em 22 recursos;
    - `LAYOUT_LOW_RHD` aparece em 21 recursos, com 2 versões diferentes;
    - 102 itens reaproveitam nomes do jogo com conteúdo próprio.
  - Isso confirma que a "conferência de nome repetido" do plano tem valor.
- **M3:** o `vehicles.meta` usa `LAYOUT_STD_HIGHWINDOW`.
  - O `firstPersonDrivebyData` aponta para `LOW_REDHORNM3BIBIS_FRONT_LEFT/RIGHT`, que **não existem** em lugar nenhum: referência quebrada [V].
  - O `vehiclelayouts.meta` dela só redefine `LOW_MASSACRO2_FRONT_LEFT/RIGHT`, itens que já existem no jogo e que o carro não usa.
  - O fxmanifest diz "Convertido com RPForge", mas o código do conversor (`src/`) não mexe nesses campos: a referência quebrada provavelmente já veio no carro original, ou foi renomeada à mão [I]. Não é um bug confirmado do conversor, mas é exatamente o tipo de erro que a conferência do editor de assentos deve apontar ("referência a item inexistente"). Redefinir itens do jogo também pode afetar outros carros [I].

O catálogo com cada layout (assentos com osso, entradas com porta, lado e assentos alcançados, veículos que usam) foi gerado fora do repositório, porque são dados do jogo. Ele pode virar a "biblioteca de layouts" do editor. O script `scripts/vehicle-engine/Export-VehicleLayouts.ps1` refaz a extração (oráculo offline).

## O que falta para gravar YFT com peças e ossos novos

O caminho atual, editar no lugar e anexar páginas no fim, tem um teto físico:
- Só podem ser anexadas páginas **do mesmo tamanho ou menores** que a menor página do arquivo. Caso contrário, a ordem das páginas muda e todos os endereços se movem.
- Na M3, isso dá **no máximo cerca de 224 KiB extras** (uma página de 128, uma de 64 e uma de 32 KiB).
- Isso basta para ossos novos e peças pequenas. Não basta para uma peça grande (um para-choque de 10 mil vértices com stride 68 ocupa 680 KB, e cada buffer precisa caber inteiro numa página).

Por isso o editor precisa de dois gravadores:

**A. Edição no lugar + anexos pequenos.** Já provado. Basta para:
- materiais e cores: parâmetros de shader e troca de textura por nome que caiba no espaço;
- esconder peças, zerando a máscara ou degenerando os triângulos de uma geometria;
- mover ossos, como os assentos;
- adicionar poucos ossos e anexos leves.

**B. Gravador com realocação completa** (`src/vehicle-engine/yft-repack.js`, feito em 13/11). Ele recolhe todos os blocos, reempacota em páginas novas e reescreve todos os ponteiros. É a base para peças grandes, rodas trocadas e LODs. Como funciona:
- **Ponteiros:** o leitor registra cada campo de ponteiro que segue (`view.pointerFields`). Uma varredura (`unfollowedPointers`) procura valores com cara de ponteiro que ninguém segue. Se achar algum dentro de uma estrutura conhecida, o gravador **recusa** o arquivo, porque não saberia relocá-lo.
- **Trechos:** os blocos lidos viram trechos contínuos. Bytes não-nulos logo depois de um trecho viajam junto com ele ("cauda"). É assim que estruturas só em parte entendidas, como o `EvtSet`, chegam intactas.
- **Dados mortos:** um trecho solto com ponteiros que nada referencia é descartado. Exemplo: a marca d'água "1.0.0.49 / oycrims" da M3. Se algum ponteiro conhecido apontar para ele, o gravador recusa.
- **Ponteiros para arrays vazios:** ponteiro não nulo com contagem 0 ganha 16 bytes copiados do original, para continuar válido.
- **Páginas:** nenhum trecho cruza fronteira de página, e cada trecho mantém o alinhamento módulo 16. Cada classe de página respeita o limite do seu campo de contagem. A página da raiz fica em primeiro lugar.
- **Informações de página:** o bloco é recriado com espaço para qualquer número de páginas, e as contagens saem corretas, inclusive em arquivos que tinham contagem desatualizada.
- **Mapeado para isso:** colisão por dentro, arquétipos, arrays por filho e transformações da física, limites das juntas, `EvtSet`, pixels de textura embutida (DXT1/DXT5/A8) e o segundo ponteiro de nome do `FragDrawable`. Os tamanhos de bloco foram conferidos com o `BlockLength` do CodeWalker.
- **Ainda não mapeado:** o cloth (`EnvironmentCloth`). Arquivos com cloth são recusados.

**Resultado no acervo [V]** (`scripts/vehicle-engine/repack-corpus.mjs`: reempacotar → reler com o motor → CodeWalker lê o arquivo novo → comparar com o original):
- **335 de 337** arquivos reempacotados: o motor relê o mesmo veículo (só endereços e flags de página mudam), e o oráculo confere **1.087.351 campos sem nenhuma diferença**.
- As **2 recusas** são as duas cópias da gaiola da XCLASSPOL, que tem cloth. A recusa é a correta.
- 60 arquivos tinham dados mortos (marcas d'água de exportador), que foram descartados.
- O tamanho descomprimido fica entre 50% e 104% do original (mediana 98%). O pior tempo é 1,8 s, no carro de 1,95 milhão de triângulos.
- Na M3 reempacotada, o oráculo vê 0 diferenças, e nenhum bloco cruza fronteira de página (há teste para isso).
- O kit de teste no jogo ganhou a cópia `rpf0reemp`, que é a M3 inteira reempacotada.

**Operação de crescer: geometria nova (feita em 13/11) [V].** `src/vehicle-engine/yft-grow.js` (`addGeometries`):
- acrescenta geometrias a um modelo do drawable principal ou de um drawable filho (ex.: a roda);
- copia a declaração de vértices e os cabeçalhos de buffer de uma geometria do mesmo modelo;
- cresce os arrays de ponteiros, o mapeamento de shader e as caixas;
- relê o resultado para validar e reempacota.

Conferido pelo motor e pelo oráculo:
- cubo no capô da M3: 101 → 102 geometrias;
- roda nova no drawable da roda: 12 → 13 geometrias.

O editor do site usa essa operação para importar peças e trocar rodas. **Ainda falta:** acrescentar osso (assento, sirene, extra) e shader novo.

Para **adicionar um osso** (ex.: um `seat_*` novo, que não tem física nem malha), é preciso:
- crescer a tabela de ossos, a tabela de pais, as duas tabelas de matrizes e os índices de filhos (a semântica dos índices de filhos ainda precisa ser conferida [I]);
- inserir a tag na tabela de busca por tag;
- atualizar a contagem e, se o fragmento usar, `FragBoneTransforms` e as matrizes do `FragDrawable`.
- Se o osso for de peça móvel (porta, capô), entram também grupo e filho de física, filho da colisão composta (transformação, caixa, flags) e massa.

Para **anexar uma peça**, é preciso:
- criar geometria, buffer de vértices, declaração, buffer de índices e tabela de ossos da geometria;
- crescer a tabela de AABB, os ponteiros de geometria e o mapeamento de shader do modelo;
- se precisar, criar um shader novo no `ShaderGroup` (ponteiros, bloco de parâmetros, referências de textura);
- prender a peça a um osso, pela ligação do modelo ou por pesos.

**Para rodar no navegador** (bancada do site):
- O motor já usa só `Uint8Array`, `DataView` e `TextDecoder`. O único ponto do Node é `node:zlib`, que dá para trocar por `DecompressionStream('deflate-raw')`, `CompressionStream` ou pako.
- Um carro de 22 MB descomprimido cabe na memória de um worker.

## Riscos

- **Nada foi testado dentro do jogo** (`gameValidation: not performed`). O oráculo confirma que o CodeWalker lê o arquivo, não que o jogo aceita. Antes da fase 3, é preciso testar no FiveM.
  - **Recurso de teste pronto:** `D:\RedHorn\output\rpforge-fase0-teste`, gerado por `scripts/vehicle-engine/make-game-check.mjs`. Tem quatro cópias da M3, que usam o `.ytd` original:
    - `rpf0assento`: banco do motorista 30 cm mais alto (sentar e ver o ped mais alto);
    - `rpf0capo`: osso do capô 30 cm mais alto (o capô deve aparecer flutuando);
    - `rpf0ossos`: tabela de ossos movida para uma página nova (deve ficar igual ao original: dirigir, abrir portas, bater).
    - `rpf0reemp`: arquivo inteiro reempacotado pelo gravador B (deve ficar igual ao original).
  - Se os três se comportarem como esperado, a edição no lugar e a realocação estão validadas no jogo.
- **Mods "protegidos"** (campos zerados de propósito, nomes ofuscados): ler funciona. Regravar pode desfazer a proteção, ou o arquivo pode ter armadilhas que o jogo tolera e nós não. É preciso decidir a política de produto: avisar ou recusar.
- **Limite de 128 ossos:** 103 dos 337 arquivos já passam de 100. Ossos novos (assentos, sirenes, peças) vão bater nisso com frequência; o contador de ossos do plano é essencial.
- **Compressão:** a saída fica de 3% a 4% maior que o original. Pode-se testar o nível 9 ou zopfli no futuro se o tamanho do recurso importar.
- **O teto de anexos sem realocação** (cerca de 224 KiB na M3) vale só para o gravador A; o gravador B não tem esse teto.
- **Dados descartados:** o gravador B descarta trechos que nada referencia (60 arquivos do acervo). Pelo formato, o jogo não alcança dados sem ponteiro, mas isso só fica confirmado com o teste no jogo.
- **Proveniência:** os layouts foram estudados pelos metadados do CodeWalker (MIT), lidos por reflexão, e confirmados pelo oráculo. O CodeWalker não é carregado pelo motor.

## Estimativa (trabalho de engenharia, sem contar revisão e testes no jogo)

| Etapa | Esforço |
|---|---|
| Fase 2: leitura no navegador (worker, troca do zlib, malha para three.js, contadores) | 3–5 dias |
| Fase 3: gravador A (materiais, cores, esconder peças/emblemas, mover ossos, metas) + testes no FiveM | 1–2 semanas |
| Ossos novos sem física (assentos) pelo gravador A, com páginas anexadas | 3–5 dias |
| ~~Mapa completo de ponteiros~~ | **Feito em 13/11**, exceto o cloth (2–3 dias) |
| ~~Gravador B (reempacotar páginas) + ida e volta no acervo pelo oráculo~~ | **Feito em 13/11** (335/337) |
| Operações de crescer sobre o gravador B: osso novo (com tag e matrizes), geometria nova, shader novo | 1–2 semanas |
| Fase 4: anexar peças, trocar rodas, ossos com física | 2–3 semanas sobre o gravador B |

O critério técnico de pronto (ida e volta pelo gravador B no acervo inteiro) foi cumprido. O risco maior agora é **o jogo**: nada disso foi carregado no FiveM. A cópia `rpf0reemp` do kit de teste é o primeiro passo.
