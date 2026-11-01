# Auditoria local do RPForge 0.3.0 — 2026-11-01

A revisão foi realizada em rodadas de inspeção, reprodução de falhas, correção e testes.
O instalador final foi gerado mediante solicitação da mantenedora. Nenhum código,
instalador ou release foi publicado; a assinatura SignPath continua desativada.

## Correções verificadas

- Geração de vários YTYPs: uma falha posterior agora desfaz os arquivos criados pela
  operação, preservando arquivos preexistentes e saídas que tenham sido substituídas
  ou editadas. Teste de regressão provoca falha após publicar o segundo arquivo de 257 modelos.
- Interface: inspeção da pasta protegida pelo tratamento de erros, mensagens corretas
  após sucesso/falha de YTYP e instruções consistentes com os botões atuais.
- Estado inicial/pasta vazia: controles de configuração ficam ocultos, evitando a
  sobreposição com o painel inicial. Teste do fluxo verifica a exclusão dos dois estados.
- Ajuda: validação visual inclui o final da rolagem e o acesso às licenças.
- Explorer: seleção de várias pastas não usa a pasta de fundo como origem. O novo teste
  reproduziu o erro com a DLL anterior e passou após a correção.
- Instalador: marca RPForge, ícones próprios e as duas ações clássicas RPF/YTYP.
  Instruções de uso e tipos suportados atualizados.
- Pacote: binários com metadados verificados, runtime Node fixado, SBOM, proveniência
  e avisos completos, incluindo Pixelify Sans. Assets e índice PRI são arquivos
  gerenciados pela instalação, inclusive para remoção na desinstalação.
- Desinstalação: comandos de uma cópia não removem a integração pertencente a outra.
- Teste de instalação: AppId de auditoria separado, cópia de todos os quatro menus e
  restauração do pacote original. Entrada original de desinstalação e arquivos da
  instalação habitual são comparados antes/depois para detectar alterações.

## Resultado das rodadas

| Verificação | Resultado |
| --- | --- |
| Testes Node de conversão, conteúdo, XML, spawns, tuning, conflitos, integridade, backups e YTYP | 44 aprovados |
| Fluxo da interface | Veículos, roupas, mapas/YMF, nome inválido, revisão obrigatória, backup, pasta vazia e YTYP com erro/sucesso aprovados |
| Revisão visual | 9 imagens; janela normal e compacta, início, configuração, revisão, ajuda/rolagem, erro e resultado |
| Extensão nativa | COM, ciclo de vida, RPF/YDR, pasta vazia, fundo de pasta e seleção múltipla aprovados |
| Preparação SignPath | Verificador aprovado; solicitações de assinatura continuam bloqueadas |
| npm audit | Nenhuma vulnerabilidade conhecida reportada nas dependências instaladas |
| Metadados e runtime | EXE/DLL x64 com versões consistentes; assinatura upstream do Node preservada |
| Primeiro ciclo do instalador | Instalação, reinstalação, menus, GUI/CLI sem PATH, desinstalação e restauração aprovados |
| Ciclo final, com as últimas correções | Repetido e aprovado; proteção contra desinstalação por outra cópia também verificada |

O fluxo instalado foi exercitado com arquivos sintéticos, caminhos contendo espaços
e `&`, sem encontrar Node/npm pelo PATH. As saídas e os originais permaneceram após
desinstalar. Um arquivo pessoal sintético dentro da instalação temporária também foi
preservado. Ao final, o pacote moderno original voltou à versão registrada anteriormente;
os hashes dos seus arquivos e a entrada de desinstalação permaneceram iguais.

## Instalador final

- Arquivo local: `release/RPF-Forge-Setup-0.3.0-x64.exe`.
- SHA-256: `db3cf8446d3c12a1e559b5f85ba5c437a9a17bb67a6c223adc3fa13fdb1fcdd2`.
- Revisão usada para os binários/payload: `c90a922228798a65d7b49301d1e3a12744e917da`;
  manifesto registra fonte limpa. Alterações posteriores são testes/documentação.
- Instalador EXE sem assinatura de distribuição; identidade MSIX assinada com o
  certificado local de teste já autorizado. Não foram adicionados certificados de confiança.
- A instalação habitual foi preservada; execute o instalador para atualizar e testar
  manualmente a nova versão.

Logs ficam em `.tools/installer-final-build.log` e `.tools/installer-final-lifecycle.log`;
as imagens, em `.tools/audit-030-visual-final`. Dados e logs temporários permanecem locais.

## Limites desta auditoria

Validação no Windows desta máquina, que já confia no certificado de teste. Não substitui
teste em máquina limpa, todos os percentuais de DPI, leitores de tela, todos os discos e
formatos de conteúdo, nem teste de carregamento dentro do FiveM. Nenhum servidor/base
FiveM foi alterado. A revisão não garante ausência de qualquer defeito ou vulnerabilidade.
