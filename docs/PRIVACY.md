# Privacidade — RPForge

Esta descricao corresponde ao codigo atual (versao 1.0.1, interface Electron em
`desktop-web/`). O texto exibido no instalador fica em `installer/legal/PRIVACY.txt`.

## Arquivos do usuario

- A leitura, extracao, verificacao e conversao de RPFs, a geracao de YTYP e as
  ferramentas de roupas (OBJ, Neon e Separar pele) acontecem no computador do usuario.
- Nenhuma ferramenta envia modelos, texturas, nomes de arquivos ou caminhos para a API
  ou para servicos externos.
- A interface conversa com o processo principal do Electron por IPC; cada operacao roda
  em um processo de trabalho local que encerra ao terminar. Nao ha servidor HTTP local.
  O fallback WinForms legado (`desktop/`) ainda troca pedidos com o conversor por
  arquivos temporarios, removidos ao finalizar a operacao.
- Previa, avisos e diagnostico de peso aparecem na interface; nao e gravado relatorio JSON no recurso.
- Os RPFs e YDDs originais sao preservados. Quando o usuario escolhe substituir uma saida,
  o backup fica ao lado do recurso e permanece sob controle do usuario.

## Conta e licenca

- Converter RPFs e Gerar YTYP funcionam sem conta e sem conexao.
- Roupas para OBJ, Roupas para Neon e Separar pele exigem entrar na conta e uma licenca Pro
  assinada. Somente nesse fluxo o app se comunica com `https://api.rpforge.dev`:
  - autorizacao do computador: identificador de instalacao, chave publica RSA gerada
    localmente, nome do computador (nome de host do Windows, limitado a 60 caracteres)
    e um desafio PKCE;
  - entrada por e-mail: e-mail, senha e, quando ativo, o codigo MFA, enviados a API para
    autenticar. A senha nao e salva pelo aplicativo;
  - Discord, Google e GitHub: a autorizacao abre no navegador padrao; o app consulta a
    API ate a confirmacao, sem copiar cookies do navegador;
  - renovacao e desconexao: refresh token com prova assinada pela chave da instalacao;
    a API devolve uma licenca assinada (plano, capacidades, identificador da conta e da
    instalacao, validade maxima de 72 horas) e o perfil publico;
  - chaves publicas de verificacao da licenca (`/v1/desktop/licenses/keys`).
- Com uma conta conectada, a licenca e renovada ao abrir o app completo ou uma acao
  rapida de roupas e a cada cinco minutos enquanto o app estiver aberto, com cache de
  um minuto. Sem conta conectada, essas verificacoes nao fazem pedidos de rede.
- A interface recebe apenas nome de exibicao e avatar. O avatar e carregado do
  provedor (Discord, GitHub ou Google). E-mail, tokens e chaves nao chegam a interface.
- O plano Pro e concedido manualmente no servidor. O app nao tem preco, checkout nem
  pagamento.

## Dados locais

- Sessao, refresh token, licenca e chave privada da instalacao ficam em
  `%LOCALAPPDATA%\RPForge\account\desktop-session.bin`, criptografados pelo
  `safeStorage` do Electron (protecao do Windows).
- `%LOCALAPPDATA%\RPForge\logs\session.jsonl` registra apenas eventos de estado da
  sessao (evento, status, codigo de erro, plano, modo); nunca tokens, identidades,
  caminhos, senhas ou chaves.
- Para o menu do Explorer, o app grava `%LOCALAPPDATA%\RPForge\menu-access.bin` e
  `HKCU\Software\RPForge\ToolAccess` com mascara de ferramentas Pro, expiracao e pasta
  de instalacao. O Explorer nao consulta a rede.

## Outros pontos

- Nao ha telemetria, publicidade nem consulta automatica de atualizacao. Atualizacoes
  sao manuais, pelo instalador.
- Os botoes de conta e downloads abrem `rpforge.dev` no navegador padrao.
- A instalacao configura o menu do Explorer e os dados de desinstalacao. A remocao do
  programa nao deve apagar os recursos ou arquivos de trabalho do usuario. Desinstalar
  nao exclui a conta no servico.

Os scripts de desenvolvimento podem baixar dependencias e ferramentas dos seus
fornecedores oficiais. Esse e um fluxo separado da conversao local de assets.
Qualquer mudanca de tratamento de dados exigira revisao desta descricao antes de
ser distribuida.
