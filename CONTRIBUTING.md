# Contribuir com o RPForge

Relatos de problemas, melhorias e correções são bem-vindos. Antes de começar,
confira o [README](README.md), o [manual do usuário](docs/guia-usuario/Manual-RPForge-0.3.1.pdf)
e as issues existentes.

## Relatar um problema

Use o formulário de bug em Issues. Informe a versão do RPForge, a versão do Windows,
o passo em que aconteceu e a mensagem exibida. Explique o resultado esperado e o observado.

Não anexe credenciais, certificados privados, arquivos pessoais, conteúdo pago ou
arquivos do GTA. Quando uma reprodução exigir um arquivo, prefira um exemplo sintético
que você tenha direito de compartilhar. Para falhas de segurança, siga [SECURITY.md](SECURITY.md).

## Preparar uma alteração

1. Crie uma branch para uma mudança de escopo definido.
2. Preserve os arquivos originais e os comportamentos de revisão antes de gravar.
3. Inclua testes para alterações funcionais. As fixtures do projeto são sintéticas.
4. Execute `npm ci --ignore-scripts`, `npm test` e `npm run signpath:check`.
5. Para mudanças na janela, execute os testes de interface descritos em
   [DESENVOLVIMENTO_INTERFACE.md](docs/DESENVOLVIMENTO_INTERFACE.md).
6. Atualize as instruções de uso quando o comportamento visível mudar.

Não inclua `node_modules`, `.tools`, arquivos de jogo, instaladores, chaves ou logs
pessoais no commit. A compilação da janela para desenvolvimento não exige gerar um instalador.

As instruções de assinatura ficam em [SIGNPATH_BUILD.md](docs/SIGNPATH_BUILD.md).
O fluxo de distribuição é separado das contribuições: um pull request não publica
release e não autoriza assinatura. Não é necessário ter certificado para executar os testes do conversor.

## Licença e revisão

Envie apenas material que você possa licenciar nos termos aplicáveis ao projeto.
O código próprio usa GPL-3.0-only; componentes de terceiros conservam suas licenças.
Avise se introduzir dependências, fontes ou imagens e inclua os respectivos avisos.

As contribuições serão revisadas pela mantenedora. Não há prazo garantido de resposta.
