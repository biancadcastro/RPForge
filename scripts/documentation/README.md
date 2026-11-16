# Manutenção da documentação de usuários

Conteúdo: `docs/guia-usuario/conteudo.json`. A versão navegável e o PDF são gerados
por `build_manual.py`, usando ReportLab e fontes abertas incluídas no projeto. O PDF final
fica em `output/pdf` e uma cópia acompanha o guia em `docs/guia-usuario`.

Edição atual: 1.0.1 (`version` em `conteudo.json`), gerando `Manual-RPForge-1.0.1.pdf`
(25 páginas: capa, índice e 23 capítulos, incluindo planos Free e Pro e as ferramentas
Pro de roupas). `Manual-RPForge-1.0.0.pdf` e `Manual-RPForge-0.3.1.pdf` ficam como
histórico e não são regenerados.

Para gerar, instale ReportLab (`python -m pip install reportlab`, de preferência em um
ambiente virtual) e rode `python scripts/documentation/build_manual.py` na raiz. O script
grava `output/pdf/Manual-RPForge-<versão>.pdf`, copia o PDF para `docs/guia-usuario`,
reescreve `docs/guia-usuario/index.html` e registra o limite inferior de cada página em
`.tools/manual-layout.json`. Ele falha se algum capítulo não couber em uma página.

As capturas `v101-*.png` mostram a interface Electron 1.0.1 (barra lateral, conta no
rodapé) e vêm de `desktop-web/scripts/check-visual.mjs`, que abre o app em modo de teste
com fixtures sintéticas (`scripts/Create-DesktopFixtures.mjs`) e conta fictícia. Para que
os caminhos exibidos não revelem o perfil do Windows, rode com a pasta temporária em
`C:\Users\Public\Documents`:

```bash
cd desktop-web
TEMP='C:\Users\Public\Documents' TMP='C:\Users\Public\Documents' node scripts/check-visual.mjs ../output/visual-website/manual-1.0.1
```

Mapeamento usado: `01-inicio` → `v101-inicio`, `10-rpf-configuracao` → `v101-configurar`,
`11-rpf-revisao` → `v101-revisao`, `12-rpf-resultado` → `v101-resultado`,
`05-ytyp-resultado` → `v101-ytyp`, `31-rpf-compacto` → `v101-acao-rapida`,
`15-conta-entrar` → `v101-conta`, `20-conta-conectada` → `v101-planos`,
`22-obj-configurado` → `v101-obj`, `25-neon-configurado` → `v101-neon` e
`28-pele-configurado` → `v101-pele`. As telas de roupas mostram arquivos fictícios
selecionados, antes do processamento; as fixtures não são peças reais, então o editor 3D
de Separar pele e os resultados de OBJ e Neon não têm captura nesta edição.

Os arquivos `v1-*.png` pertencem à edição 1.0.0 (navegação superior) e os PNGs sem
prefixo à edição 0.3.1; ambos ficam como histórico e não são usados pelo guia atual.
Não há assets do jogo, acervo privado ou credenciais no pacote de documentação.

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

## Validação da edição 1.0.1

- 25 páginas geradas; menor limite inferior de conteúdo 54,2 pt (mínimo exigido 48 pt).
- Páginas renderizadas e revisadas visualmente; 25 entradas no índice clicável do PDF.
- HTML servido localmente: 23 capítulos, imagens carregadas, busca testada e sem
  rolagem horizontal em 1280 px e 375 px.
- Referências locais de imagens, estilos, script e PDF conferidas.

## Validação da edição 0.3.1 (histórica)

- 18 páginas renderizadas com Poppler e revisadas visualmente.
- Extração de texto, fontes, limites inferiores e índice clicável conferidos.
- HTML aberto no navegador; busca, navegação e diálogo de ampliação testados.
- Imagens carregadas e ausência de rolagem horizontal verificadas.
- Todas as referências locais de imagens, fontes, páginas e PDF verificadas.

Estas alterações não geram nem substituem o instalador do aplicativo.
