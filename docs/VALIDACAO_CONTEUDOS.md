# Validação de YTYP, roupas e mapas — 2026-11-01

Validação local, sem publicação ou instalador e sem alterações na base FiveM.

## Executado

- Suite automatizada de backend: conversão, referências, preservação do original, conflitos, backup, corrupção, alterações depois da prévia e casos inválidos.
- Interface instalada: origem → análise → edição do nome → revisão → conversão para veículos, roupas e mapas. Geração automática de YTYP e repetição sem substituir arquivos existentes.
- Leitor binário independente CodeWalker: YTYPs sintéticos com 1, 2 e 256 arquétipos; hashes e limites geométricos de 3 modelos YDR reais comparados com os YTYPs gerados.
- RPFs de teste montados localmente com arquivos reais da loja: um mapa com YMAP/YTYP/YDR/YMF e duas peças de roupa, feminina e masculina, com YDD/YTD/YMT e ShopPedApparel.
- Leitor independente abriu os 10 assets binários reais convertidos. O SHA-256 dos arquivos de saída corresponde aos de entrada. Os 14 arquivos originais usados no ensaio permaneceram intactos.
- Limite de lote: 257 modelos produzem dois YTYPs, preservando o último modelo.

Os arquivos reais e relatórios detalhados permanecem somente em `.tools`, fora do Git. Nenhum conteúdo da loja foi incluído nos testes versionados.

## Falha corrigida

Um mapa real revelou que arquivos `.ymf` eram recusados. O conversor agora preserva os manifestos binários YMF em `stream`, como conteúdo de mapa. O caso foi incluído nos testes de backend e da janela.

Referência: [guia de mapas da Cfx](https://docs.fivem.net/docs/assets-manual/beginner-series/part-4/), que inclui o manifesto YMF no fluxo de mapas.

## O que ainda não foi validado

Não foi executado um servidor/cliente FiveM para observar renderização, colisões, posicionamento de mapas, roupas no menu de aparência ou dependências de outros recursos. O resultado confirma extração, organização, geração de manifest, integridade binária e leitura dos assets; não é garantia de compatibilidade de qualquer pacote dentro do jogo. MLOs complexos e outras estruturas não cobertas continuam sujeitos aos limites documentados.
