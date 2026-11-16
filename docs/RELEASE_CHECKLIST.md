# Preparação da primeira release

Atualizado em 1 de novembro de 2026. Versão candidata na época: **0.3.1**.

> Estado em 10 de novembro de 2026: versão atual **1.0.1** (`package.json`). O
> `Build-Installer.ps1` monta o instalador com a interface Electron + Next
> (`Prepare-DesktopPayload.ps1`) e o motor de roupas; o WinForms fica como fallback
> legado. Binários e MSIX continuam assinados com o certificado local de teste;
> a SignPath segue pendente e `signpath/project.json` permanece com `enabled: false`.
> Não há atualização automática: novas versões são instaladas pelo instalador.
> Os bloqueios de distribuição abaixo continuam válidos.

## Situação atual

- Repositório público, histórico preservado com autorização da mantenedora.
- Main protegida com quatro verificações obrigatórias, sem force push ou exclusão;
  a administradora mantém permissão de exceção.
- Detecção de segredos, proteção de push, atualizações de segurança do Dependabot
  e relatos privados de vulnerabilidade habilitados.
- Solicitação à SignPath enviada em 1 de novembro de 2026. Aprovação pendente;
  nenhum prazo informado. Integração de assinatura permanece desativada.
- Notas para usuários preparadas em [RELEASE_NOTES_0.3.1.md](RELEASE_NOTES_0.3.1.md).

## Evidências da candidata

Os binários de preparação são compilados com ferramentas fixadas por versão e hash,
metadados de produto, testes de interface e extensão, inventário de licenças, SBOM
e manifesto de origem. Eles ficam em `.tools/release-candidate`, fora do Git.
Esses arquivos não são um instalador e não devem ser oferecidos como versão assinada.

O registro de validação fica em `output/release-candidate`, fora do Git. A revisão
e os hashes dos binários identificam exatamente o código testado; alterações
posteriores de código exigem uma nova candidata.

## Bloqueios de distribuição

O fluxo atual `Build-Installer.ps1` compila novamente os binários e chama
`Build-Shell.ps1`, que cria a identidade local de teste. Não é ainda um fluxo
de montagem de instalador público a partir dos artefatos assinados da SignPath.

Antes da distribuição, implementar e validar:

1. Entrada explícita dos binários assinados implementada para preparação e validação,
   sem recompilar os arquivos após a aprovação. Consulte [SIGNED_PACKAGING.md](SIGNED_PACKAGING.md).
   A montagem pública permanece bloqueada até a identidade MSIX estar definida.
2. Identidade/Publisher de distribuição e assinatura da identidade MSIX compatível.
   A assinatura dos EXE/DLL, isoladamente, não valida o MSIX do menu moderno.
3. Assinatura e verificação do instalador final, com as licenças, avisos e código-fonte
   correspondentes ao pacote distribuído.
4. Instalação limpa em Windows 11 sem confiança no certificado de desenvolvimento.
   Não pedir ao público que importe o certificado local de teste.

Se a SignPath exigir uma versão já disponível, decidir separadamente como lançar
uma prévia sem assinatura. Essa decisão não autoriza distribuir o instalador local
atual como se estivesse pronto para outros computadores.

## Matriz de aceite do instalador final

| Cenário | Aceite |
| --- | --- |
| Instalação limpa | Pasta Programs/RPForge, licença e atalhos corretos; nenhuma importação de certificado de teste |
| Atualização | Arquivos do app atualizados, projetos e saídas preservados |
| Menu moderno | Comando disponível na pasta e no fundo da pasta, somente para conteúdo compatível |
| Conversão | Fixture sintética convertida pela interface e pelo runtime incluído sem Node no PATH |
| Nomes e caminhos | Pasta com espaços e caracteres especiais; spawn com maiúsculas |
| Saída existente | Cancelar, outro nome e backup/substituição preservam os dados esperados |
| Cancelamento/erro | Mensagem compreensível, sem saída parcial apresentada como concluída |
| Desinstalação | Integração removida, projetos, RPFs e saídas preservados |
| Arquivos finais | Assinaturas, hashes, versão, SBOM, licenças e fonte correspondente conferidos |

O teste automatizado local `Test-Installer.ps1` usa uma instalação de auditoria,
mas altera temporariamente a integração do Explorer e depende do certificado local.
Ele não substitui o teste em Windows limpo e não foi executado nesta preparação.

## Publicação

Manter a release em preparação até concluir os bloqueios acima. Gerar o pacote final
somente após definir a identidade e a assinatura de distribuição. Não reaproveitar
o instalador local antigo como se tivesse sido gerado desta candidata.

O envio à SignPath e a abertura do repositório já foram autorizados; a publicação
da release continua sendo uma etapa separada.
