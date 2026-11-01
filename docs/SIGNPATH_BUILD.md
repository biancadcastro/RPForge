# Compilacao e integracao preparadas para SignPath

## Estado e limites

Esta preparacao nao e uma aprovacao da SignPath. Nenhuma conta, aplicativo GitHub,
protecao remota, segredo, assinatura ou publicacao e configurada automaticamente.
O workflow e manual; a etapa de assinatura permanece bloqueada por padrao.

O alvo atual sao dois binarios proprios: `RPFForge.exe` e `ForgeShell.dll`.
Nao sao produzidos Setup, MSI ou MSIX por esse caminho. A identidade de distribuicao
tem um template separado; o pacote `.Local` e o certificado de desenvolvimento nao
podem ser reutilizados como identidade publica.

## Preparar os binarios sem assinatura

No Windows x64, com Git, Node e as dependencias de desenvolvimento instalados:

```powershell
npm ci --ignore-scripts
npm run signpath:check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Build-UnsignedBinaries.ps1
```

O build normal exige uma revisao Git limpa. `-AllowDirty` existe apenas para diagnostico
local, fica registrado na proveniencia e nao e aceito para envio pelo workflow.
Use um destino novo em `.tools` para cada compilacao; o script nao apaga builds anteriores.

`build/toolchains.json` fixa versoes, URLs HTTPS e SHA-256 de cada arquivo baixado.
O bootstrap verifica os downloads e os executaveis/bibliotecas do cache antes do uso.
A compilacao usa Roslyn e referencias .NET fixados, sem depender do compilador que veio
na maquina. A extensao usa LLVM-MinGW fixado. O runtime Node upstream e verificado,
mantendo sua assinatura original. Os runtimes e compiladores nao sao assinados em nome
do projeto.

Saidas: binarios sem assinatura, metadados consistentes, `SHA256SUMS`,
`build-manifest.json`, `sbom.cdx.json` e avisos completos em `licenses/`.
A proveniencia identifica revisao, hash da arvore de arquivos versionados, hashes dos
binarios e da toolchain, e distingue build local de build hospedado. Nao inclui caminhos
pessoais, nome da maquina, credenciais ou conteudo de assets.

Para conferir a repetibilidade local, gere dois destinos novos a partir do mesmo commit
limpo e execute `Test-BinaryReproducibility.ps1 -First <primeiro> -Second <segundo>`.
O teste compara a origem e os hashes dos dois binarios. Isso nao afirma reproducibilidade
entre imagens distintas de Windows; a origem hospedada ainda sera validada no GitHub.

## Workflow preparado, ainda nao executado no GitHub

`.github/workflows/signpath-build.yml` usa runners hospedados pelo GitHub, actions
fixadas por SHA e permissoes de leitura. A execucao manual normal compila e guarda um
artefato do workflow; nao cria uma release e nao gera instalador.

Para habilitar um pedido de assinatura no futuro, todos estes passos sao necessarios:

1. Obter aprovacao da Foundation e confirmar os responsaveis e MFA.
2. Instalar e configurar a integracao GitHub oficial apos autorizacao da mantenedora.
3. Cadastrar a configuracao `signpath/artifact-configuration.xml` e a politica aprovada
   que exige aprovacao manual para cada solicitacao.
4. Preencher os identificadores reais em `signpath/project.json` e revisar as flags
   `enabled` e `approvedByFoundation` por alteracao de codigo.
5. Criar o ambiente `signpath-signing` com a mantenedora como revisora obrigatoria,
   restringir a branch main e desabilitar bypass de revisao. A ferramenta nao altera
   essas configuracoes. Confirmar se o plano/visibilidade do repositorio suporta as regras.
6. Guardar `SIGNPATH_API_TOKEN` somente como segredo desse ambiente. Definir as variaveis
   `SIGNPATH_ENABLED=true`, `SIGNPATH_ORGANIZATION_ID` e `SIGNPATH_POLICY_SLUG` com os
   valores aprovados; nunca inserir tokens em arquivos ou exemplos.
7. A mantenedora executa o workflow na main com `request_signing=true`, aprova o ambiente
   e, quando solicitado, aprova o pedido na SignPath.

O workflow confere a configuracao e os revisores efetivos antes de chamar a action de
assinatura. Os binarios enviados precisam vir do artefato produzido no mesmo workflow.
Mesmo depois disso, a publicacao de uma release continua sendo uma operacao separada.

## Identidade e migracao futuras

O template `signpath/identity.template.xml` usa `RedHorn.RPFForge`, separado de
`RedHorn.RPFForge.Local`. O Publisher deve receber o Subject exato do certificado
aprovado, nunca um nome presumido.

`Prepare-DistributionIdentity.ps1` gera somente o XML com versao coerente; recusa
placeholders e identidade de teste. Nao empacota ou registra nada.
O empacotamento e a assinatura MSIX, a assinatura do instalador e o teste de migracao
serao feitos quando houver aprovacao e um pedido explicito para preparar a distribuicao.
Uma migracao devera preservar os addons e dados, retirar somente a integracao `.Local`
e evitar duas entradas simultaneas do menu. Certificados de teste nao devem ser removidos
silenciosamente caso ainda sejam usados por outra instalacao.

## Interface em desenvolvimento paralelo

Nenhum arquivo de interface e alterado por essa preparacao. O contrato de compilacao
atual coleta `desktop/*.cs` e injeta metadados gerados fora dessa pasta. Se a nova interface
trocar de tecnologia, adaptar somente a etapa de build, mantendo nomes, versoes,
proveniencia, avisos e testes. O payload final deve passar por nova revisao de licencas.

Referencias: [regras Foundation](https://signpath.org/terms),
[origem de builds GitHub](https://docs.signpath.io/trusted-build-systems/github),
[configuracao dos artefatos](https://docs.signpath.io/artifact-configuration/reference).
