# Manutenção da documentação de usuários

Conteúdo: `docs/guia-usuario/conteudo.json`. A versão navegável e o PDF são gerados
por `build_manual.py`, usando ReportLab e fontes abertas incluídas no projeto. O PDF final
fica em `output/pdf` e uma cópia acompanha o guia em `docs/guia-usuario`.

Edição atual: 1.0.0 (`version` em `conteudo.json`), gerando `Manual-RPForge-1.0.0.pdf`.
As capturas `v1-*.png` mostram a interface Electron com exemplos fictícios; os PNGs
sem prefixo são da interface 0.3.1, sem a moldura desenhada pelo Windows, da
edição histórica 0.3.1. O conteúdo ainda não cobre as ferramentas Pro de roupas (OBJ, Neon e
Separar pele) nem o acesso Free/Pro. A tela de YTYP registra uma geração real de um modelo sintético. Não há
assets do jogo, acervo privado ou credenciais no pacote de documentação.

As logos são as variantes finais aprovadas da identidade RPForge. Pixelify Sans
mantém seu aviso OFL em `assets/OFL.txt`. Atkinson Hyperlegible, usada no corpo do PDF,
mantém seu aviso em `assets/Atkinson-OFL.txt`. Os arquivos originais de marca não foram
alterados.

## Revisão editorial solicitada

Referência: https://github.com/lynote-ai/humanize-text

Foram consultados README, `docs/techniques.md` e `docs/pipeline.md`. A abordagem de
reescrita em rodadas foi adaptada localmente ao português: primeiro a ordem das
instruções, depois a linguagem e, por fim, a conferência dos significados e dos
nomes dos botões no aplicativo.

O pipeline externo do projeto não foi executado: exige serviços de LLM/tradução e
chaves de API, e seu fluxo padrão termina em inglês. Nenhum texto do RPForge foi
enviado a esses serviços. Não foi aplicada tradução intermediária, avaliação de
detectores ou alteração de fatos para produzir o manual.

## Validação da edição 0.3.1 (histórica)

- 18 páginas renderizadas com Poppler e revisadas visualmente.
- Extração de texto, fontes, limites inferiores e índice clicável conferidos.
- HTML aberto no navegador; busca, navegação e diálogo de ampliação testados.
- Imagens carregadas e ausência de rolagem horizontal verificadas.
- Todas as referências locais de imagens, fontes, páginas e PDF verificadas.

Estas alterações não geram nem substituem o instalador do aplicativo.
