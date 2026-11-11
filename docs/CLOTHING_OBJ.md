# Roupas para OBJ — primeira implementação

Ferramenta Pro, incluída no instalador atual (1.0.1; motor em `engines\clothing`).
Exige login e licença assinada com a capacidade `clothing.obj`. O processamento é
local, sem Blender e sem envio de modelos ou texturas à API.

## Fluxo

Na bancada ou no menu Ferramentas, abra **Roupas para OBJ**. Selecione o YDD,
o YTD correspondente (dispensável quando a difusa está embutida), o LOD e a pasta
de destino. A ferramenta salva somente OBJ e MTL diretamente no destino e mostra uma
prévia 3D do próprio OBJ entregue. O cancelamento aguarda o processo terminar
e remove somente os arquivos temporários daquela operação.

Os arquivos recebem o nome da peça, com sufixo numérico quando esse nome já
existe. O OBJ referencia o MTL correspondente. Cada geometria mantém seu grupo
de material. Não são criados PNG, SVG, JSON nem subpastas. O MTL não referencia
imagens que não foram exportadas. A prévia apresenta a malha sem textura.

## Ação rápida pelo Explorer

Clique com o botão direito em um YDD e escolha **Exportar para OBJ com RPForge**.
A ação também fica disponível sobre uma pasta e no espaço vazio dentro dela.
Quando existe um único YDD diretamente na pasta, ele vem selecionado; se houver
vários ou estiverem em subpastas, use o seletor de peça para escolher o arquivo.
A ação existe no menu moderno do Windows 11 e no clássico. Abre uma janela
compacta, sem consulta de versão nem navegação do app completo. Sem sessão
conectada, a janela mostra primeiro o login integrado e depois retoma a peça. O
menu só é exibido quando o cache local de acesso indica licença Pro válida. O YDD vem
selecionado, com destino inicial na mesma pasta; nenhum arquivo é escrito antes
da confirmação. Pode-se escolher outro destino.

Somente YTDs adjacentes com o mesmo componente, ID e prefixo são sugeridos.
Uma correspondência é pré-selecionada; múltiplas variações exigem uma escolha
explícita. O seletor de arquivos continua disponível. A ação moderna fica
oculta para YTDs, links e seleções múltiplas. A associação padrão de
abertura dos arquivos YDD permanece inalterada.

O argumento `--obj <arquivo.ydd>` é encaminhado pelo executável do Explorer ao
Electron. `clothing-launch.mjs` prepara as sugestões no processo principal,
que mantém a autoridade sobre os caminhos selecionados.

## Escopo e preservação

- YDD Legacy RSC7 versão 165 e YTD versão 13. Os casos reais validados são duas
  roupas freemode, uma masculina e uma feminina; isso não representa certificação
  de todos os tipos de drawable ou formatos de textura.
- O LOD padrão é High. Não existe substituição silenciosa por outro LOD.
- Posições e normais nativas, triangulação e escala original preservadas.
  Eixos GTA Z-up; UV OBJ usa `V = 1 - GTA V`. UVs fora do tile são mantidos.
- As texturas permanecem nos arquivos originais; não são exportadas ou modificadas.
- Não exporta o rig, animações, shaders GTA, normal maps ou specular maps.
  Os dados completos permanecem nos YDD/YTD originais. OBJ é uma entrega para
  pintura, não um formato de retorno autossuficiente para o jogo.
- Materiais sem difusa, UVs/normais ausentes e dados inválidos interrompem a
  operação. Não se usa uma textura ou normal inventada para completar o pacote.
- Originais são somente lidos e seus hashes são conferidos antes da publicação.
  Arquivos de resultados existentes não são sobrescritos.

## Motor

`scripts/clothing/ClothingDecoder.cs` é um adaptador somente de leitura para a
biblioteca CodeWalker.Core. É compilado como executável x64 para .NET Framework
do Windows; não precisa iniciar PowerShell ou Blender durante a exportação.
DirectXTex/texconv converte as difusas DDS para PNG. O motor encerra após cada
leitura; o processo de trabalho Electron também encerra após a operação.

`scripts/Prepare-ClothingEngine.ps1` recebe explicitamente os caminhos da
biblioteca CodeWalker e do texconv. Prepara apenas `.tools/clothing-engine`,
com hashes dos executáveis e bibliotecas. Não gera instalador, modifica o acervo
ou instala componentes do sistema. O código Node recusa componentes diferentes
dos registrados no manifesto local. A definição de versões fixadas, licenças,
avisos e empacotamento redistribuível desses componentes deve ser concluída antes
de incluir a ferramenta em uma próxima distribuição. O manifesto local é uma
verificação de integridade de desenvolvimento, não uma assinatura do fornecedor.

## Integração e verificações

- `src/clothing.js`: validação, OBJ/MTL, guias UV e publicação sem sobrescrita.
- `desktop-web/electron/main.mjs`: seleções nativas e autoridade dos caminhos;
  o renderer escolhe somente a finalidade da seleção e o LOD.
- `desktop-web/components/clothing-workspace.tsx`: interface e progresso.
- `desktop-web/components/clothing-viewer.tsx`: prévia do OBJ com Three.js,
  desenhada por evento e liberada ao sair da ferramenta. Sem loop de renderização
  contínuo. A iluminação é ilustrativa e não reproduz shaders GTA. Para limitar
  memória de GPU, a prévia aceita texturas até 4096 por dimensão e 16 milhões de
  pixels somados; o pacote exportado mantém a resolução original mesmo quando
  a prévia é recusada por tamanho.
- `tests/clothing.test.js`: leitura independente com OBJLoader, índices de
  múltiplas malhas, UVs fora do tile e recusa de dados inválidos.
- `scripts/check-clothing-real.mjs <spec.json> <destino>`: teste opcional com
  acervo autorizado. O JSON contém duas entradas com `gender` (`male` e `female`),
  `model`, `texture` e `reference` (OBJ histórico).
- `desktop-web/scripts/check-clothing.mjs <spec.json> <destino>`: teste real
  pela interface. Apenas o diálogo de seleção é automatizado; leitura,
  exportação, PNGs, prévia WebGL e arquivos finais são reais. Confere também
  permissões IPC, pixels visíveis no canvas, cancelamento e saída dos workers.

Os testes não colocam peças privadas no repositório. As entradas ficam fora do
projeto e evidências/resultados locais em `output/`, ignorado pelo Git.

## Validação real inicial — 4 de novembro de 2026

| Peça comum | Vértices | Triângulos | Difusa |
| --- | ---: | ---: | --- |
| Masculina, Camisa #003 | 1.993 | 2.656 | 2048 × 2048 |
| Feminina, Camisa #001 | 988 | 1.462 | 2048 × 2048 |

Geometria e UVs comparados com os OBJs existentes no acervo usando um leitor
independente. Considerada a transformação entre Z-up e Y-up, o maior desvio foi
aproximadamente 0,00000051, compatível com as seis casas decimais da referência.
Comparadas também a ordem dos triângulos e a associação de UVs por canto.

As normais nativas são preservadas sem recálculo. Os OBJs históricos possuem
normais normalizadas/arredondadas; não são considerados referência binária delas.
Uma segunda leitura do YDD confirma que os valores nativos chegam ao OBJ.
Os PNGs foram comparados com as imagens do acervo via Pillow: mesmos pixels RGBA
e resolução nas duas peças. Foram conferidos hashes dos originais, repetibilidade,
nova pasta a cada execução e falha limpa quando falta o YTD necessário.
