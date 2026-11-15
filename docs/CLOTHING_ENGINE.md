# Motor de roupas em JS (`src/clothing-engine`)

Substitui, para o website, os adaptadores .NET do app (`ClothingDecoder.exe`, `ClothingNeon.exe` e
`ClothingSkin.exe`, que usam CodeWalker.Core). Roda no navegador: a peça não sai do computador da
pessoa. O CodeWalker só é usado offline, como oráculo de comparação.

| Arquivo | Papel |
| --- | --- |
| `ydd-read.js` | Leitor de YDD v165 (dicionário de drawables): shaders, texturas embutidas, esqueleto, LODs, geometrias. Registra blocos e ponteiros como o leitor de YFT. |
| `ydd-write.js` | Regravação completa pelo reempacotador do motor de veículos (`yft-repack.js`), com a versão 165. |
| `vertex.js` | Decodificação de todos os tipos de componente de vértice (float, half, dec3n, colour, ubyte4). |
| `obj.js` | Roupas para OBJ: OBJ + MTL de um LOD (mesmo contrato do app, docs/CLOTHING_OBJ.md). |
| `neon.js` | Roupas para Neon: preset `ped_emissive.sps` (bloco de parâmetros copiado da saída do motor antigo), cor (255,185,255,0), UV1 e tangentes quando faltam. |
| `skin.js` | Separar pele: classificação por LOD, revisões manuais e gravação dos YDDs de roupa e pele. |
| `skin-reference.js`, `sha256.js` | Impressões digitais dos triângulos do corpo freemode (mesma regra e mesmo `skin-triangles.json` do app). |

O motor devolve regiões (`{system, graphics, systemFlags, graphicsFlags, version: 165}`). Quem chama
codifica: Node com `encodeYftResource` (vehicle-engine/resource.js), o navegador com o codificador
assíncrono do site.

## Verificação (15/11/2026, acervo RedHorn em `D:\RedHorn\Loja`)

- Leitura: 1.918 de 1.925 YDDs. Recusados: 2 cabelos com mais de 65.536 vértices numa geometria e 5 com ponteiro fora das regiões.
- Ida e volta (ler → reempacotar → codificar → ler): 1.918 de 1.918 sem diferença em geometria, shaders, rig e texturas.
- Geometria contra o `ClothingDecoder.exe`: 17 de 17 peças com posições, normais, UVs e índices idênticos.
- Neon contra o `ClothingNeon.exe`: 4 de 4 peças com shaders, declaração, canais e cor idênticos (tangentes até 1e-3); aceitação/recusa igual em 57 de 58 (o motor antigo recusa um cabelo que o novo converte e confere).
- Separar pele contra o `ClothingSkin.exe`: análise igual em 46 de 46 peças; separação igual (bytes dos vértices de cada face, por LOD) em 6 de 6.
- Testes: `node --test tests/clothing-engine.test.js`. Os casos com peças reais rodam com `RPFORGE_CLOTHING_SAMPLES` apontando para um JSON fora do repositório (`{"neon": [...], "skin": [...], "reference": ".../skin-triangles.json"}`).

Nada disso substitui o teste dentro do FiveM.
