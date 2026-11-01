# Code signing policy

Status: preparacao para candidatura; o RPForge ainda nao foi aprovado pela SignPath Foundation.
Os pacotes locais atuais usam certificado de desenvolvimento. Eles nao sao assinaturas
de distribuicao da SignPath. O projeto nao deve apresentar selo de aprovacao ou atribuir
assinaturas a SignPath antes de sua confirmacao.

## Responsabilidades propostas

- Autoria e manutencao: [biancadcastro](https://github.com/biancadcastro).
- Revisao de contribuicoes externas: biancadcastro; novos revisores precisam ser designados pela mantenedora.
- Aprovacao de pedidos de assinatura e publicacao: biancadcastro, explicitamente, para cada versao.

A mantenedora informou que a autenticacao multifator do GitHub ja esta habilitada.
Os papeis, as permissoes e o MFA na SignPath serao confirmados na candidatura. A integracao esta preparada,
desativada por padrao, sem credencial da SignPath neste repositorio.

## Origem dos artefatos

O caminho `Build-UnsignedBinaries.ps1` compila os binarios proprios a partir de uma revisao
identificada, com ferramentas e dependencias fixadas, verificacoes e testes pertinentes.
Produto, versao, empresa e nomes originais dos binarios sao gerados e conferidos juntos.
O manifesto de origem e o SBOM acompanham os binarios sem assinatura.
Arquivos de terceiros, como o Node.js, manterao suas licencas e assinaturas originais;
nao serao assinados como se fossem codigo proprio do RPForge.
O workflow preparado e manual, usa runners GitHub e actions fixadas por SHA, exige
opt-in, configuracao aprovada e ambiente com revisao humana para pedir assinatura.
Ele nao publica releases e nao produz instaladores.

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
