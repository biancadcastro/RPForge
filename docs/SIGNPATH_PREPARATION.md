# Preparacao para SignPath Foundation

Decisao da mantenedora: seguir pela SignPath para o projeto de codigo aberto.
Estado: preparacao local; sem candidatura enviada e sem garantia de aprovacao.

## Ja disponivel

- Codigo proprio sob MIT e repositorio Git com historico.
- Documentacao do produto, testes do conversor e testes da janela.
- Rascunho de [Code signing policy](CODE_SIGNING_POLICY.md) e descricao de [privacidade](PRIVACY.md).
- Integracao local do Windows e scripts de compilacao existentes para estudo da futura pipeline.

## Antes da candidatura

- Concluir e revisar a interface que esta sendo trabalhada separadamente.
- Confirmar os responsaveis pelos papeis de autoria, revisao e aprovacao.
- Confirmar MFA nas contas envolvidas; nao registrar codigos ou segredos no repositorio.
- Revisar as licencas e avisos de dependencias, runtime e bibliotecas nativas vinculadas.
- Fixar ferramentas e preparar uma compilacao verificavel em CI; os caches locais
  `.tools` e o certificado de teste nao podem ser requisitos ocultos da distribuicao.
- Definir metadados de produto/versao nos binarios proprios.
- Separar a identidade de distribuicao do pacote atual de teste, ajustando o Publisher
  ao certificado aprovado. Planejar a migracao das instalacoes de desenvolvimento.
- Quando a mantenedora autorizar: tornar o codigo publico e disponibilizar uma versao
  inicial documentada. A avaliacao inclui a origem e a reputacao verificavel do projeto.
- Revisar os requisitos vigentes e enviar a candidatura somente com autorizacao explicita.

## Depois da aprovacao

Configurar os identificadores e permissoes fornecidos pela SignPath, definir quais
artefatos proprios serao assinados e integrar o fluxo de aprovacao manual da mantenedora.
Revisar primeiro o suporte de assinatura de EXE, DLL e pacote de identidade MSIX do projeto.
Preservar os binarios upstream e suas assinaturas, sem reapresenta-los como codigo proprio.

Nada neste roteiro autoriza criar contas, instalar GitHub Apps, disponibilizar codigo,
enviar formularios, gerar instaladores ou publicar uma release automaticamente.

Fontes consultadas: [SignPath Foundation](https://signpath.org/),
[condicoes](https://signpath.org/terms), [candidatura](https://signpath.org/apply).
