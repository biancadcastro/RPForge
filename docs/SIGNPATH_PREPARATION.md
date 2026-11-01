# Preparacao para SignPath Foundation

Decisao da mantenedora: seguir pela SignPath para o projeto de codigo aberto.
Estado: preparacao local; sem candidatura enviada e sem garantia de aprovacao.

## Ja disponivel

- Codigo proprio sob GPLv3 (GPL-3.0-only) e repositorio Git com historico.
- Documentacao do produto, testes do conversor e testes da janela.
- Rascunho de [Code signing policy](CODE_SIGNING_POLICY.md) e descricao de [privacidade](PRIVACY.md).
- [Compilacao verificavel preparada](SIGNPATH_BUILD.md), com toolchains fixadas por versao e SHA-256.
- Metadados de produto e versao consistentes, verificados nos dois binarios proprios.
- Inventario de [terceiros](../THIRD_PARTY_NOTICES.md), avisos completos, SBOM e proveniencia gerados com o build.
- Workflow GitHub manual, sem instalador ou publicacao, com assinatura desativada e gates de revisao.
- Configuracao de artefatos restrita aos binarios proprios e identidade publica separada do pacote de teste.

## Antes da candidatura

- Concluir e revisar a interface que esta sendo trabalhada separadamente.
- Confirmar os responsaveis pelos papeis de autoria, revisao e aprovacao.
- Confirmar MFA nas contas envolvidas; nao registrar codigos ou segredos no repositorio.
- Revalidar o inventario de licencas se a nova interface adicionar dependencias.
- Executar o workflow preparado no GitHub apenas quando houver autorizacao para enviar o codigo;
  a verificacao local nao substitui a comprovacao de origem fornecida pelo GitHub/SignPath.
- Preencher o Publisher exato depois da aprovacao e testar a migracao descrita em SIGNPATH_BUILD.md.
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
