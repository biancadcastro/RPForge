# Privacidade — RPForge

Esta descricao corresponde ao codigo atual em desenvolvimento.

- A leitura, extracao, verificacao e conversao de RPFs acontecem no computador do usuario.
- O conversor nao envia modelos, texturas, nomes de arquivos ou caminhos para servicos externos.
- Nao ha telemetria, conta obrigatoria, publicidade ou verificacao de licenca comercial.
- A interface troca pedidos com o processo local do conversor por arquivos temporarios;
  nao abre servidor HTTP. Esses pedidos sao removidos ao finalizar a operacao.
- Previa, avisos e diagnostico de peso aparecem na interface; nao e gravado relatorio JSON no addon.
- Os RPFs originais sao preservados. Quando o usuario escolhe substituir uma saida,
  o backup fica ao lado do addon e permanece sob controle do usuario.
- A instalacao configura o menu do Explorer e os dados de desinstalacao. A remocao do
  programa nao deve apagar os addons ou arquivos de trabalho do usuario.

Os scripts de desenvolvimento podem baixar dependencias e ferramentas dos seus
fornecedores oficiais. Esse e um fluxo separado da conversao local de assets.
Uma futura consulta de atualizacoes ou mudanca de tratamento de dados exigira revisao
desta descricao antes de ser distribuida.
