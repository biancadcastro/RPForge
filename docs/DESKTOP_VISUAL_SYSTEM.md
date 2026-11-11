# Sistema visual do desktop

O site **https://rpforge.dev** é a referência visual. O desktop usa a mesma paleta, as
mesmas fontes e o mesmo sistema de botões; não substituir por uma interface genérica do
Windows. Paleta, fontes, nomes, glossário e regras de mensagem: [IDENTIDADE.md](IDENTIDADE.md).

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `app/tokens.css` | Única origem de cores, famílias, medidas, foco e movimento. |
| `app/controls.css` | Botões, campos, foco, `.notice`, toast, diálogo de confirmação, trilha. Carregado por último. |
| `app/globals.css` | Base e estruturas gerais. |
| `app/workspace.css` | Shell, navegação, formulários e páginas (incorporou a antiga `alignment.css`). |
| `app/atelier.css` | Editor de pele e resultados. |

Não criar folhas novas para sobrepor fonte ou cor de uma tela; ajustar a regra dona.

## Botões

Iguais ao site: lisos (sem relevo, sombra ou texto em pixel), **Atkinson 15 px/700**,
altura `--control-height` (44 px; 36 px só em ferramentas densas do editor).

| Variante | Classe | Aparência |
| --- | --- | --- |
| Primária | `.button.primary` | Fundo `#ff7b25`, borda `#ff8c43`, texto `#20150d`; hover `#ff8d43` |
| Secundária | `.button.secondary` | Superfície, borda `--field-border` |
| Perigo | `.button.danger` | Fundo `--danger-bg`, borda `--danger-border`, texto `--danger` |
| Texto | `.button.ghost` / `.text-link` | Transparente, 14 px, sublinha no hover; alvo mínimo 32 px |
| Ícone | `.button.icon` | Quadrado 44 px; **`aria-label` obrigatório** |

- Um raio (`--control-radius`) e um foco (`--focus`, anel laranja 2 px com afastamento 3 px)
  para todos os controles.
- Desabilitado: opacidade `.45` e cursor `not-allowed`.
- Carregando: `aria-busy="true"` mostra o spinner **junto** do texto do botão (o texto
  não some). Com movimento reduzido, o spinner fica parado.
- Uma ação primária por área.

## Campos

Borda `--field-border` (`#6e6a78`, ≥ 3:1), hover `--field-border-hover`, inválido com
`aria-invalid="true"` em `--danger`. Validação de pasta e de "Nome no jogo (spawn)"
aparece no campo enquanto se digita (`.field-error`).

## Onde cada mensagem vai

| Situação | Componente |
| --- | --- |
| Aviso transitório, sem campo ou etapa (pasta não abriu, conta conectada/desconectada, prévia 3D indisponível, autorização renovada, aviso de abertura) | Toast — `components/toast.tsx` (`useToast`) |
| Mensagem persistente ligada a um campo ou etapa (erro da operação, validação, revisão) | Aviso inline — `components/notice.tsx` (`.notice`), o único estilo inline |
| Ação destrutiva (descartar revisão de pele, "Desconectar este computador") | Diálogo — `components/confirm-dialog.tsx`; nunca `window.confirm` |

### Toast

- Tons: info (laranja), sucesso (`#7fd49b`), aviso (âmbar `#ffc857`), erro (`--danger`);
  barra lateral na cor do tom, ícone pixel, título em Atkinson, ação opcional (ghost) e
  botão fechar ("Fechar notificação").
- Some em ~6 s; pausa com mouse ou foco em cima. **Erro fica até fechar.**
- No máximo 3 ao mesmo tempo; repetidos não se acumulam. Canto inferior direito.
- `aria-live="polite"` (`role="status"`) para info/sucesso/aviso; `aria-live="assertive"`
  (`role="alert"`) para erro.
- Sem animação de entrada com `prefers-reduced-motion`.
- Nunca texto de desenvolvedor: a mensagem passa pelo helper e o detalhe técnico fica
  recolhido.

### Aviso inline (`.notice`)

Tons `error` (padrão), `warning`, `info`, `success`; título opcional, texto, ação opcional e
"Detalhe técnico" recolhido quando a mensagem traz o marcador. `role="alert"` só no erro.
Não criar outros estilos de nota/alerta.

### Diálogo de confirmação

`role="alertdialog"`, foco começa em cancelar ("Continuar editando" por padrão), Esc
cancela, Tab fica preso no diálogo, botão de confirmar na variante `danger`.

## Mensagens

Todo erro passa por `userMessage()` (`lib/user-message.ts`), que remove "Error:" e
prefixos de IPC, troca falhas de rede por "Sem conexão com o RPForge…" e separa o detalhe
técnico pelo marcador `"\n\nDetalhe técnico: "` (o mesmo de `src/user-error.js`). Erros
internos chegam como "Algo deu errado. Feche e abra a ferramenta novamente."; RPF
corrompido mostra o texto amigável com o detalhe técnico recolhido.

## Páginas

- Trilha `Início / grupo / ferramenta` (`components/breadcrumb.tsx`); separadores
  decorativos, item atual com `aria-current="page"`.
- O resultado mantém a mesma trilha e o mesmo título da configuração; o estado é um `h2`.
- O foco começa no título da página.
- Roupas para OBJ, Roupas para Neon e Separar pele usam um só layout
  (`components/clothing-setup.tsx`): "Selecionar peça YDD", "Selecionar textura YTD",
  pasta de destino e ação primária. "Exclusivo do plano Pro" só aparece para quem não é Pro.
- `PageHeading` compõe os cabeçalhos; `OperationResult` atende RPF, YTYP, OBJ, Neon e pele;
  `OperationProgress` é o diálogo de processamento das ferramentas de roupas.

## Verificação

1. `npm run desktop:typecheck`, `npm run desktop:build` e `npm run desktop:test`.
2. `node desktop-web/scripts/check-login-gate.mjs` (limites Free/Pro).
3. `node desktop-web/scripts/check-visual.mjs`: telas em Electron com dados sintéticos;
   confere fontes (controles em Atkinson, nenhum texto pequeno em Pixelify), a cor da
   primária, o toast de sucesso, overflow, erros do renderer e triagem WCAG automatizada.
4. Checks de OBJ/Neon/pele com espécimes usam cópias isoladas; a galeria
   (`node desktop-web/scripts/build-visual-gallery.mjs`) vai para
   `output/visual-website/gallery/index.html`, fora do Git.

Esses comandos não empacotam nem instalam. Triagem automatizada não substitui teste com
leitor de tela.
