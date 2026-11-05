# Planos Free e Pro

O Free mantém conversão de arquivos RPF, revisão e geração de YTYP sem exigir conta ou conexão.
O Pro inclui exportação de roupa para OBJ, conversão Neon e separação de pele (análise e exportação).

O aplicativo valida o JWT RS256 emitido pela API, incluindo assinatura, emissor, audiência,
instalação, início e expiração. O processo principal verifica o acesso antes de iniciar
qualquer processamento pago, inclusive nas ações do Explorer.

O servidor concede o Pro por um registro ativo `plan.pro` em `license_entitlements`.
Esse registro expande as permissões `clothing.obj`, `clothing.neon` e `clothing.skin`.
Sem ele, o plano é Free. Não há ativação pelo cliente nem cobrança nesta etapa.
As permissões individuais sem `plan.pro` não liberam essas ferramentas.

A renovação ocorre ao consultar a sessão, com cache de um minuto. A licença vale
por até 72 horas, limitada também pela expiração dos direitos ativos. Revogações
passam a valer na próxima renovação bem-sucedida; sem conexão, a licença já emitida
pode permanecer válida até expirar. As chaves públicas são obtidas por HTTPS em
`/v1/desktop/licenses/keys` e persistidas no armazenamento protegido da conta.
Uma falha de rede, inclusive após reiniciar, permite usar uma licença válida já
verificada com essas chaves. O primeiro acesso sem chaves locais exige conexão.

Cada perfil local mantém uma identidade e uma chave privada protegidas, inclusive
após desconectar a conta. Reautorizar essa identidade exige prova assinada e reutiliza
a mesma vaga; nomes de computadores não são usados para mesclar registros.
Reinstalar o Windows, apagar os dados locais ou usar outro perfil pode criar uma nova
identidade. As vagas antigas podem ser revogadas em Conta → Gerenciar conta e computadores.
Instalações sem token renovável ou invalidadas por mudança de segurança deixam de reservar vagas.

Ativação e renovação têm recuperação idempotente por cinco minutos com a mesma prova.
Erro de relógio e falha temporária preservam a identidade e a sessão; revogação real
invalida o acesso. Senha, MFA e OAuth terminam no mesmo protocolo de licença nativa.

A API e o aplicativo precisam ser publicados juntos para disponibilizar este recurso.
Preços, checkout e concessão automática após pagamento ainda não estão implementados.
