# Identidade RPForge

Regra geral: o app desktop segue a identidade do site **https://rpforge.dev**. A fonte da
verdade é o código — `desktop-web/app/tokens.css` (cores, fontes, medidas) e
`desktop-web/app/controls.css` (botões, campos, aviso, toast, diálogo). Este documento
resume as regras; o detalhe de componentes está em
[DESKTOP_VISUAL_SYSTEM.md](DESKTOP_VISUAL_SYSTEM.md).

Slogan único: **Você cria. O RPForge organiza.** Não usar outras frases de efeito.

## Marca

Logo, símbolo e ícone vêm de uma única matriz vetorial aprovada. A interface usa PNGs
renderizados dessa matriz e o ICO correspondente no executável; nada depende de arquivos
externos, do diretório pessoal ou de conexão. Não gerar versões novas da marca.

- O manifest gerado traz `-- Convertido com RPForge`. Janela, metadados e instalador usam
  **RPForge**.
- Ícone do Windows: símbolo sem fundo, margens reduzidas, tamanhos 16–256 px no ICO; a
  janela e o executável usam o mesmo arquivo.
- Menu do Explorer: executável `RPFForge.exe`, ícones `shell/rpforge-mark-v3.ico`,
  agrupamento com `Assets/MenuLogo.png` e `resources.pri` na raiz externa da instalação
  (integração sparse; os recursos são copiados para a raiz antes de atualizar a
  identidade, sem reiniciar o Explorer). Referência:
  https://github.com/microsoft/winappCli/blob/main/docs/guides/sparse.md

## Paleta (única, compartilhada com o site)

| Token | Cor | Uso |
| --- | --- | --- |
| `--bg` | `#121218` | Fundo da janela |
| `--surface` | `#1d1d27` | Painéis, navegação, cartões |
| `--surface-sunken` / `--surface-raised` / `--surface-hover` | `#18181f` / `#25232d` / `#2c2a36` | Áreas rebaixadas, cabeçalhos/toast, hover |
| `--line` / `--line-strong` | `#343444` / `#4a4a5c` | Separação de áreas |
| `--field-border` (hover `#8c8792`) | `#6e6a78` | Contorno de campos e botões secundários (contraste ≥ 3:1 sobre o fundo, WCAG 1.4.11) |
| `--text` | `#f5f1e8` | Texto principal |
| `--muted-strong` / `--muted` / `--subtle` | `#c4becc` / `#b4b3c0` / `#9b9aa8` | Texto auxiliar |
| `--orange` (hover `#ff8d43`, borda `#ff8c43`) | `#ff7b25` | Ação principal, seleção, foco, info |
| `--primary-ink` | `#20150d` | Texto sobre laranja |
| `--success` | `#7fd49b` | Concluído |
| `--warning` | `#ffc857` | Aviso (âmbar) |
| `--danger` (borda `#b4574a`) | `#ff9a8a` | Erro e ações destrutivas |

Estados sempre vêm com ícone e texto, nunca só com cor. As cores de Roupa/Pele
(`--role-*`) e dos eixos têm significado funcional e continuam distintas. Não criar cores
literais nas telas: usar os tokens.

## Fontes

- **Atkinson Hyperlegible** (Regular/Bold) em tudo que é lido: textos, campos, navegação,
  botões, rótulos, nomes de arquivo, IDs, caminhos, tabelas.
- **Pixelify Sans**, peso regular, **só** em títulos com 28 px ou mais e no logo.
- Nunca Pixelify em nomes de arquivo, IDs, caminhos, botões ou rótulos pequenos. Motivo:
  no negrito o "c" parece "o" — `dlc.rpf` era lido como `dlo.rpf`.
- Detalhe técnico recolhido usa monoespaçada (`ui-monospace`, Consolas).
- Arquivos e licenças OFL ficam em `desktop-web/public/fonts`; sem fontes remotas nem
  instalação global.

## Nomes canônicos

| Ferramenta | Menu do Explorer |
| --- | --- |
| Converter RPFs | Converter RPFs com RPForge |
| Gerar YTYP | Gerar YTYP com RPForge |
| Roupas para OBJ | Roupas para OBJ com RPForge |
| Roupas para Neon | Roupas para Neon com RPForge |
| Separar pele | Separar pele com RPForge |

Os mesmos nomes aparecem no título da página, na barra da janela, na trilha e no
resultado. A página de instruções se chama **Ajuda**.

## Glossário

| Use | Evite |
| --- | --- |
| Free / Pro (plano) | Gratuito |
| Entrar (ação) | Login, Logar |
| site | website, portal |
| recurso (pasta de recurso FiveM) | addon, resource |
| Nome no jogo (spawn) | Spawn name, Nome de spawn |
| Malha (exibição 3D) | Wireframe |
| LOD Alto / Médio / Baixo | High/Med/Low, LOD 0/1/2 |
| nome de exibição | display name |
| plurais reais ("1 arquivo", "3 arquivos") | "arquivo(s)" |
| Tentar de novo | Tentar novamente, Retry |

## Mensagens

- Um único tradutor: `src/user-error.js` (processo principal) e
  `desktop-web/lib/user-message.ts` (interface). Nenhum componente mostra `String(error)`.
- Nunca exibir "Error:", stack, texto do .NET/CodeWalker ou nomes internos.
- Erro interno: **"Algo deu errado. Feche e abra a ferramenta novamente."**
- RPF danificado: "Este RPF parece corrompido ou foi gerado por uma ferramenta
  incompatível.", com o detalhe técnico recolhido.
- Detalhe técnico viaja após o marcador `"\n\nDetalhe técnico: "` e é mostrado em
  "Detalhe técnico" recolhido.
- Depois de um erro, uma única ação **Tentar de novo**.
