# Auditoria de acesso Pro — 04/11/2026

Escopo: sessão desktop, armazenamento seguro, renovação, assinatura da licença, menu do Explorer e execução de roupas. Nenhum teste gravou no acervo. A API de produção foi consultada somente para leitura e pelas renovações normais da própria conta; não houve alteração de plano ou flexibilização de autorização.

## Constatações e correções

1. **Validação dependia de buscar as chaves públicas em cada processo.** Uma falha nessa chamada retornava acesso nulo mesmo com um JWT Pro válido salvo. Agora as chaves já verificadas ficam no armazenamento seguro, são reutilizadas durante a validade assinada e atualizadas quando a assinatura exige outra chave. Assinaturas inválidas, instalações diferentes, expiração e revogação continuam bloqueando acesso.
2. **A renovação só era coordenada dentro de um cliente.** Outro processo podia manter o refresh token antigo em memória e enviá-lo após sua rotação. Os diagnósticos anteriores também podiam interferir nisso ao abrir outro cliente enquanto o app estava aberto. Agora a renovação usa um bloqueio de arquivo comum, relê a sessão criptografada dentro dele e grava a rotação antes de liberá-lo. Dois processos reais foram verificados com uma única renovação.
3. **Falha ao salvar podia deixar o token consumido na memória.** O novo estado é mantido e a gravação é tentada novamente antes de renovar; o mesmo cliente não volta a enviar o token anterior. Arquivos temporários têm nomes únicos e permanecem criptografados.
4. **Mensagem confundia indisponibilidade com falta de Pro.** Agora sessão ausente, autorização inválida e indisponibilidade de validação têm mensagens próprias. A mensagem de plano Pro permanece para uma licença válida sem a capacidade exigida.
5. **Sessão em memória podia ficar diferente da sessão salva.** A leitura inicial é compartilhada, uma leitura vazia pode ser repetida e a sessão segura atual é relida antes de renovar. Isso também evita renovar a conta anterior após conectar outra.
6. **Menu moderno podia usar uma visão antiga do registro.** A extensão local 1.0.0.7 usa o cache atômico da própria instalação antes do registro virtualizado. Free e Pro foram validados pela COM registrada do Windows. O cache do menu não autoriza conversões; a execução verifica a licença assinada.
7. O armazenamento passou para as APIs assíncronas atuais de safeStorage, mantendo compatibilidade de leitura das sessões existentes. Eventos de diagnóstico não incluem tokens, chaves privadas, senhas ou e-mails.

## Verificação

- 99 testes do app passaram, incluindo concorrência, revogação, falha de gravação, cache de chaves e assinatura.
- 106 testes da API passaram. Nenhuma mudança de código ou implantação da API foi necessária.
- A instalação local corresponde por SHA-256 aos módulos auditados.
- Na conta real: análise e separação feminina, Neon da roupa isolada e OBJ masculino concluíram com cópias temporárias.
- Três renovações reais atenderam nove validações simultâneas sem reutilização de token.
- Dois processos Electron separados reconheceram Pro com uma única renovação real.
- Após reiniciar o app, a conta real executou análise com indisponibilidade de rede simulada, usando somente a licença e as chaves previamente verificadas.
- Os comandos modernos e clássicos registrados reconheceram Pro na pasta informada pela usuária. A transição Free oculta os comandos e nega sua invocação; o estado Pro real foi restaurado.

O processo que mostrou a mensagem original não possuía diagnóstico suficiente para atribuir aquela ocorrência a uma única causa. As falhas acima foram reproduzidas e corrigidas; reiniciar o aplicativo, isoladamente, não foi considerado validação suficiente. Uma queda do processo exatamente entre a resposta do servidor e a persistência da nova sessão ainda pode exigir reconectar a conta; a proteção da API contra reutilização de tokens não foi removida.

Evidências locais de desenvolvimento: `.tools/audit-full-tests.log`, `.tools/audit-api-tests.log`, `.tools/audit-real-flows.log`, `.tools/audit-real-parallel.log`. Esses arquivos e as peças temporárias não são artefatos de distribuição.

## Repetição pelo Explorer e migração de sessão

A auditoria adicional reproduziu divergência de armazenamento entre a abertura normal e a abertura com identidade MSIX. Foi unificado o perfil Electron (incluindo a chave do armazenamento seguro), além do arquivo de conta. A preparação do perfil ocorre fora da identidade empacotada antes do registro do menu e da atualização local. Os arquivos antigos são preservados.

Uma primeira invocação real da COM registrada reconheceu a mesma conta Pro, mas a repetição posterior falhou: a leitura do armazenamento compartilhado voltou vazia e o fallback carregou uma sessão antiga, cuja renovação foi recusada. Portanto, a evidência inicial não é suficiente para considerar a persistência entre identidades resolvida. Foi impedido o reaproveitamento de refresh tokens legados após migração, exclusão ou falha de decifragem. A sessão real precisa ser reconectada e a repetição normal/Explorer ainda está pendente; não publicar com esta auditoria como aprovação final.

A última execução dos testes automatizados passou com 101 testes. A atualização local dos módulos foi aplicada sem gerar instalador. Nenhum dado do acervo foi usado como destino.
