# RPForge 0.3.1 — rascunho da primeira release

Status: preparação. Este texto não anuncia uma versão disponível para download.

## Seus arquivos, prontos para o FiveM

O RPForge ajuda a transformar arquivos RPF abertos do GTA V Legacy em recursos
organizados para o FiveM, com uma interface para revisar tudo antes de converter.

- Converta veículos e outros conteúdos reconhecidos pelo aplicativo.
- Mantenha o spawn original ou escolha outro nome, com maiúsculas e minúsculas.
- Organize os metadados em `data` e as peças de tuning em `stream/mods`.
- Remova referências a peças de tuning ausentes para evitar opções quebradas.
- Gere YTYPs a partir de modelos YDR.
- Confira avisos antes de gravar e escolha como tratar uma pasta de saída existente.
- Preserve os arquivos de origem e mantenha backups quando substituir uma saída.

O aplicativo trabalha localmente e não exige login, assinatura comercial ou
instalação separada do Node.js, OpenIV ou CodeWalker.

## Requisitos e limites

- Windows 11 x64 e .NET Framework 4.8 ou posterior.
- RPF7 do GTA V Legacy com conteúdo OPEN/NONE. RPFs criptografados e GTA V Enhanced
  não são aceitos.
- Use arquivos próprios ou que você tenha autorização para converter.
- A conversão não substitui a conferência do recurso no jogo. Dependências externas,
  configurações especiais de MLO e casos não reconhecidos podem exigir ajustes.
- O RPForge não altera seu `server.cfg`. Copie a saída para `resources` e adicione
  o `ensure` indicado ao configurar seu servidor.

## Instalação e ajuda

Quando a release for publicada, esta seção receberá os links do instalador, dos
hashes SHA-256 e do código-fonte correspondente.

Consulte o [manual ilustrado](guia-usuario/Manual-RPForge-0.3.1.pdf), a
[política de privacidade](PRIVACY.md) e a [Code signing policy](CODE_SIGNING_POLICY.md).

## Pendências antes da publicação

Este bloco é interno à preparação e deve ser removido da descrição final:

- Resolver a identidade de distribuição do menu moderno e a assinatura do pacote
  MSIX; o certificado local de desenvolvimento não pode ser exigido dos usuários.
- Integrar os binários aprovados e assinados à montagem do instalador, sem
  recompilá-los ou substituí-los por versões locais sem assinatura.
- Validar o instalador final em Windows limpo, sem certificado local confiável,
  incluindo instalação, atualização, menu, conversão e desinstalação.
- Conferir hashes, licenças, código-fonte e assinatura dos arquivos finais.
- Após eventual aprovação, incluir a atribuição exigida pela SignPath na política
  de assinatura e conferir seu link na página de download.
- Obter autorização da mantenedora para publicar a release.
