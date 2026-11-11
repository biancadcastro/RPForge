# Identidade e componentes RPForge

## Marca

Logo, símbolo e ícone foram preparados a partir de uma única matriz vetorial aprovada no Recraft. A interface incorpora PNGs renderizados dessa matriz e o ICO correspondente no executável. Não depende do projeto Recraft, de arquivos no diretório pessoal ou de conexão para funcionar.

O manifest gerado identifica a ferramenta com `-- Convertido com RPForge`. A janela, os metadados de produto e o nome padrão do instalador também usam **RPForge**.

## Paleta

| Token | Cor | Uso |
| --- | --- | --- |
| Background | `#14141B` | Fundo da janela |
| Surface | `#1C1C26` | Navegação e áreas de trabalho |
| Raised | `#252531` | Campos e cabeçalhos |
| Border | `#34344A` | Contornos discretos |
| Text | `#F4F1EA` | Texto principal |
| Muted | `#B1AEBB` | Texto auxiliar |
| Orange | `#FF7A32` | Ação principal, seleção e foco |
| Warning | `#FFD166` | Avisos |
| Error | `#FF7676` | Falhas |
| Success | `#4ADE80` | Conclusão |

Na interface Electron + Next.js, o botão laranja (`#E9843D`, contorno `#FFD0A5`) usa
texto escuro `#20150D` e o relevo discreto definido nos controles atuais do site,
conforme `desktop-web/app/tokens.css` e [DESKTOP_VISUAL_SYSTEM.md](DESKTOP_VISUAL_SYSTEM.md). Estados têm mensagens além da cor.

## Tipografia

**Pixelify Sans Regular/Bold**, os mesmos arquivos usados no site, em títulos e
botões. **Atkinson Hyperlegible Regular/Bold** nos textos, campos e navegação. Os
arquivos e licenças OFL locais estão em `desktop-web/public/fonts`; não há
instalação global de fontes nem carregamento pela internet.

**Consolas** em caminhos, spawns e diagnóstico técnico. Os códigos de caracteres precisam permanecer fáceis de distinguir.

## Componentes

- Botão primário: laranja, relevo inferior discreto, hover e pressionamento visíveis.
- Secundário: superfície grafite, contorno e foco explícito.
- Navegação: cabeçalho como o do site, menu de ferramentas com busca e estado selecionado em laranja.
- Campo de origem: espaço interno e moldura que acompanha o foco.
- Tabelas: cabeçalho Pixelify, valores técnicos monoespaçados e campos editáveis demarcados.
- Checkbox: marca laranja com confirmação gráfica; mantém o controle nativo por baixo.
- Seletor: campo escuro com seta laranja; opções reais do DataGridView.
- Estado vazio: símbolo da marca e instrução da próxima ação.

Alterações de layout não devem introduzir versões regeneradas da marca, fontes remotas, progresso fictício ou estados de sucesso sem resposta do conversor.

O ícone do Windows usa o símbolo vetorial aprovado sem fundo, com margens reduzidas e versões de 16, 20, 24, 32, 40, 48, 64, 128 e 256 pixels no ICO. A janela e o recurso do executável usam o mesmo arquivo; o texto Converter com RPForge foi preservado.


O agrupamento do menu moderno usa a identidade RPForge e o executável RPFForge.exe. As ações usam shell/rpforge-mark-v3.ico. O agrupamento usa Assets/MenuLogo.png, variantes targetsize sem placa e resources.pri na raiz externa da instalação. O teste do menu verifica os arquivos físicos e a transparência, além do cadastro.


A integração sparse resolve os arquivos visuais na ExternalLocation. O build prepara Assets e resources.pri; o registro copia esses recursos para a raiz instalada antes de atualizar a identidade. A atualização preserva janelas RPForge abertas e não reinicia o Explorer. A aparência foi conferida no menu principal do Explorer.

Referência: https://github.com/microsoft/winappCli/blob/main/docs/guides/sparse.md
