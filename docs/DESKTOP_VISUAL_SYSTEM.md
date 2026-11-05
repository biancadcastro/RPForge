# Referência visual do desktop

O website **https://rpforge.dev** é a referência visual do RPForge. Esta padronização foi solicitada em 5 de novembro de 2026. Não substituir sua linguagem por uma interface genérica do Windows ou por uma identidade diferente no editor.

## Contrato visual

- Títulos: Pixelify, com os arquivos já distribuídos pelo projeto. Textos, campos e navegação: Atkinson Hyperlegible.
- Fundo `#121218`, superfície `#1d1d27`, texto `#f5f1e8`, bordas estruturais `#343444` e laranja `#ff7b25`.
- Ação primária: fundo `#e9843d`, contorno `#ffd0a5` e texto escuro `#20150d`. Manter o relevo do website e o foco visível. O texto claro anterior não deve voltar ao botão laranja.
- Controles de ação usam Pixelify; ferramentas compactas do editor e campos usam Atkinson para leitura de dados. A densidade é adaptada ao desktop, com altura base de 44 px, sem reduzir a fonte do conteúdo indiscriminadamente.
- Os estados de configuração, progresso, erro e resultado devem usar os mesmos tokens e componentes. As cores de Roupa/Pele, eixos e advertências têm significado funcional e permanecem distintas.

## Responsabilidade dos arquivos

`tokens.css` é a origem da paleta e das famílias. `globals.css` contém base e estruturas existentes. `controls.css` possui o desenho dos botões compartilhados. `workspace.css` possui shell, navegação, formulários e páginas. `atelier.css` possui a geometria do editor e dos resultados.

A antiga camada `alignment.css` foi incorporada à geometria de `workspace.css`. Não criar uma nova folha para sobrepor fontes ou cores de uma tela. Ajustar a regra que possui essa responsabilidade.

`PageHeading` compõe os cabeçalhos. `OperationResult` atende RPF, YTYP, OBJ, Neon e pele. `OperationProgress` é o diálogo de processamento compartilhado pelas ferramentas de roupas. Os rótulos e ações preservam seus nomes e comportamentos.

## Verificação e capturas

1. Executar `npm run desktop:typecheck`, `npm run desktop:build` e `npm run desktop:test`.
2. Executar `node desktop-web/scripts/check-login-gate.mjs` para preservar os limites Free/Pro.
3. Executar `node desktop-web/scripts/check-visual.mjs`. O ensaio cobre 32 telas/estados em Electron, verifica fontes, cores aplicadas, overflow, erros do renderer e triagem WCAG automatizada. Usa perfis e dados sintéticos; não toca a conta real.
4. Os checks OBJ/Neon/pele com espécimes devem usar cópias isoladas. Seus prints podem ser incorporados por `node desktop-web/scripts/build-visual-gallery.mjs`.
5. A galeria é gravada em `output/visual-website/gallery/index.html`; prints abrem em resolução completa. `output` permanece fora do Git.

Esses comandos compilam somente a interface local e fazem testes. Não empacotam distribuição, executável ou instalador. Uma triagem automatizada de acessibilidade não é certificação nem substitui avaliação com leitor de tela.
