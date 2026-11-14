# RPForge Texture Studio

Painel gratuito para o Photoshop 2025+ (v26+) que abre a textura de um modelo com o guia
de UV por cima e salva o resultado de volta no arquivo certo:

| Modelo | Texturas | Salva em |
| --- | --- | --- |
| `.yft` veículos | `.ytd` com o mesmo nome | o `.ytd` (com cópia do original) |
| `.ydd` roupas, cabelos, peças | `.ytd` de mesmo nome, `<textura>.ytd` ou os `.ytd` da pasta | o `.ytd` de onde a textura veio |
| `.ydr` objetos e props | `.ytd` com o mesmo nome | o `.ytd` |
| `.obj` qualquer modelo | imagens do `.mtl` (PNG/JPG) | a própria imagem (com cópia do original) |

Texturas embutidas dentro de um `.ydd`/`.ydr`/`.yft` (normal, specular etc.) também são salvas: os pixels
novos são gravados no lugar, no mesmo tamanho, formato e número de mipmaps, sem mexer na geometria.
Texturas de OBJ podem ser PNG, JPG ou TGA (decodificadores próprios para a prévia 3D).

## Prévia 3D (segundo painel)

`Plugins › RPForge Texture Studio › Texture Studio — Prévia 3D`, ou o botão **Ver em 3D**. É um
painel próprio: pode ficar flutuando em outro monitor, do tamanho que quiser.

- Mostra o modelo com as texturas reais (difusa e livery por cima, no UV1), com renderizador
  próprio em JavaScript (`engine/render.js`): z-buffer, textura com correção de perspectiva,
  luz suave dos dois lados, cut-out de decalques. Rápido ao arrastar (meia resolução), nítido ao
  soltar (supersampling 2×). REDHORNM3, 253 mil triângulos: ~65 ms rápido, ~100–150 ms nítido.
- **Ao vivo**: o documento ligado à textura é relido quando o histórico do Photoshop muda e a
  pintura aparece no modelo sem salvar. Com o guia visível, as camadas são compostas sem o guia.
- **Marcar ponto**: clique no modelo e o painel cria guias do Photoshop no ponto da textura.
- **Destacar** acinzenta o que não usa a textura aberta; **Eixo** troca Y/Z (OBJ deitado);
  **Centralizar**; arraste gira, Shift+arraste move, roda aproxima, clique duplo centraliza.

Ao abrir uma textura, além do guia aramado, podem ser criadas (Opções) as camadas extras do
antigo "Criar sobreposições de UV" do Photoshop 2020: **Sombreado** e **Mapa normal**
(ocultas, travadas e nunca salvas).

Veículos: rodas e peças dos filhos do fragmento entram no lugar pelos ossos do esqueleto (a roda
`wheel_lf` é reaproveitada em todas as rodas, girada 180° do lado direito, como no jogo). Vidros
aparecem translúcidos. Texturas totalmente transparentes (ainda não pintadas) aparecem como cinza. O motor é 100% do
RPForge, em JavaScript, e roda dentro do painel: sem servidor, sem executável e sem
bibliotecas de terceiros. Nada sai do computador.

## Peças (`photoshop/texture-studio/`)

| Arquivo | Papel |
| --- | --- |
| `engine/inflate.js`, `engine/deflate.js` | DEFLATE próprio (descompactar e compactar) |
| `engine/rsc7.js` | Contêiner RSC7: leitura, distribuição de blocos em páginas, gravação |
| `engine/ytd.js` | Leitor e gravador de dicionários de textura (v13), preservando os campos desconhecidos |
| `engine/yft.js` | Leitor de fragmentos (v162): materiais, samplers, UV0/UV1, texturas embutidas |
| `engine/bc.js` | Decodifica BC1–BC5, BC7 (todos os modos) e formatos sem compressão; codifica BC1/3/4/5, BC7 (modo 6) e sem compressão; mipmaps na convenção do GTA |
| `engine/uv.js` | Desenha o guia de UV (preenchimento e bordas suavizadas) |
| `engine/index.js` | API usada pelo painel: `VehicleSession`, `replaceTexture` |
| `main.js`, `index.html`, `styles.css` | Painel UXP |

## Build

`node scripts/build-texture-studio.mjs` desenha os ícones, valida o manifest e todos os
arquivos que o painel carrega, confere a sintaxe e gera:

- `output/texture-studio-plugin/` — a pasta a carregar no UXP Developer Tool (sem `package.json`, que só serve aos testes);
- `output/rpforge-texture-studio-<versão>.ccx` — o pacote.

Não carregue `photoshop/texture-studio/` diretamente. Se o painel abrir com problema, `boot.js`
mostra o texto do erro no próprio painel.

## Fluxo no Photoshop

1. **Abrir veículo…**: escolha o `.yft` (ou o `.ytd`). O par com o mesmo nome (inclusive a partir de `_hi.yft`) é achado sozinho.
2. A lista mostra as texturas usadas pelo modelo, com as liveries (`DiffuseSampler2`) primeiro.
3. **Abrir** cria um documento com as camadas `Guia UV n (não é salvo)` (travadas), `Pintura` e `Textura original`. A livery abre com o UV1 visível; texturas pequenas abrem em 2048.
4. **Salvar no YTD** lê a composição sem os guias, comprime no formato escolhido (manter o original, DXT5, DXT1, BC7 ou sem compressão), gera os mipmaps e grava. O primeiro salvamento da sessão guarda `NOME.backup-<data>.ytd`. Há também **Salvar cópia…**.
5. Uma textura que o modelo usa mas que não está no YTD aparece como **nova** e é adicionada ao salvar.
6. **Reabrir o PSD depois**: o documento guarda nos metadados XMP (namespace `https://rpforge.dev/ns/texture-studio/1/`, campo `rpforge:link`) a textura, o arquivo de destino e os arquivos abertos no painel (modelo, `.ytd`, imagens do OBJ). Ao abrir um documento que o painel ainda não conhece, ele lê esse campo, recarrega os arquivos e religa a textura. O PSD pode mudar de pasta; o modelo e o `.ytd` precisam continuar no mesmo lugar (senão o painel avisa e pede para abrir o modelo). Como reserva, documentos já salvos também ficam lembrados pelo caminho do arquivo no armazenamento do painel. Os metadados guardam caminhos absolutos do computador de quem pintou.

## Testes

- `node --test tests/texture-studio.test.js`: DEFLATE contra o zlib, páginas RSC7, codecs BC, YTD e o painel inteiro rodando num Photoshop simulado (`tests/texture-studio-panel-sim.cjs`).
- Com `RPFORGE_VEHICLE_DIR=<pasta com X.yft e X.ytd>`, roda também o teste com veículo real (trabalha numa cópia).
- Validação manual feita (CodeWalker usado só como juiz externo, fora do plugin): REDHORNM3 regravado sem mudanças → 99/99 texturas idênticas; livery trocada → 98 idênticas + a nova 2048×2048 DXT5 com 10 mips; textura nova em BC7 adicionada. O leitor de YFT bateu 209/209 usos de textura com o CodeWalker. O decodificador BC7 é bit a bit idêntico ao do DirectXTex.

## Pendências

- Testado no Photoshop real em 14/11/2026: funcionou bem. Ícones e prévia 3D prontos.
- Publicar no site (página `/photoshop/`, branch `feat/pagina-photoshop` do RPForge-Site) e na Adobe Marketplace: ver `docs/MARKETPLACE_TEXTURE_STUDIO.md`.
- `photoshop/` ainda não está no git.
- Sem suporte ao Enhanced (gen9).
