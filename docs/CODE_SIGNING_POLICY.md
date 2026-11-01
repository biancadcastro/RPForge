# Code signing policy

Status: preparacao para candidatura; o RPF Forge ainda nao foi aprovado pela SignPath Foundation.
Os pacotes locais atuais usam certificado de desenvolvimento. Eles nao sao assinaturas
de distribuicao da SignPath. O projeto nao deve apresentar selo de aprovacao ou atribuir
assinaturas a SignPath antes de sua confirmacao.

## Responsabilidades propostas

- Autoria e manutencao: [biancadcastro](https://github.com/biancadcastro).
- Revisao de contribuicoes externas: biancadcastro; novos revisores precisam ser designados pela mantenedora.
- Aprovacao de pedidos de assinatura e publicacao: biancadcastro, explicitamente, para cada versao.

A configuracao efetiva de permissoes e de autenticacao multifator nas contas do GitHub e
da SignPath ainda precisa ser confirmada pela mantenedora. Nao ha integracao ativa ou
credencial da SignPath neste repositorio.

## Origem dos artefatos

O processo de distribuicao devera compilar os binarios proprios a partir de uma revisao
identificada do repositorio, com ferramentas e dependencias fixadas e testes pertinentes.
O aplicativo, a extensao do Explorer e os pacotes terao nome e versao coerentes.
Arquivos de terceiros, como o Node.js, manterao suas licencas e assinaturas originais;
nao serao assinados como se fossem codigo proprio do RPF Forge.

## Privacidade e alteracoes do sistema

Consulte [PRIVACY.md](PRIVACY.md). O conversor atual processa os arquivos localmente,
sem telemetria ou envio de assets. A instalacao registra o comando do Explorer e o
desinstalador. A distribuicao final devera informar essas alteracoes e permitir remocao.
A confianca manual no certificado de teste foi uma etapa autorizada de desenvolvimento;
ela nao deve fazer parte da distribuicao publica.

## Apos eventual aprovacao

Somente depois da confirmacao da Foundation, incluir a atribuicao exigida nas paginas
do projeto e de download: "Free code signing provided by SignPath.io, certificate by SignPath Foundation".
Atualizar este documento com os papeis reais e a politica aprovada. A integracao de CI
nao devera publicar releases sem a autorizacao da mantenedora.

Referencias: [condicoes da SignPath Foundation](https://signpath.org/terms) e
[pagina de candidatura](https://signpath.org/apply).
