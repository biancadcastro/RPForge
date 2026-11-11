# Segurança

## Relatos sensíveis

Não publique credenciais, arquivos pessoais ou instruções de exploração em uma issue comum.
Quando o recurso estiver habilitado no repositório público, use
[Report a vulnerability](https://github.com/biancadcastro/RPForge/security/advisories/new)
na aba Security para enviar um relato privado à mantenedora.

Se esse canal não estiver disponível, escreva para `privacidade@rpforge.dev` com o assunto
"Segurança". O mesmo endereço recebe avisos de suspeita de vazamento de dados pessoais e
pedidos de titulares de dados. Dúvidas de uso e problemas comuns vão para
`suporte@rpforge.dev` ou para as issues do repositório.

Informe a versão afetada, o impacto, os passos mínimos para reproduzir e, se possível,
uma reprodução sintética. Remova tokens, caminhos pessoais e conteúdo de terceiros dos anexos.
Não faça testes em servidores, contas ou arquivos de outras pessoas sem autorização.

## Escopo atual

O RPForge 1.0.1 é uma versão de testes assinada com certificado local. Cada versão do
aplicativo recebe suporte por 12 meses a partir do lançamento, em regime de melhor esforço;
as correções são entregues em versões novas, não em versões antigas.
Não há prazo de resposta ou correção garantido.

## Dados pessoais e incidentes

O tratamento de dados está descrito em [PRIVACY.md](docs/PRIVACY.md) e na política publicada em
<https://rpforge.dev/docs/privacidade/>. Se um relato indicar exposição de dados pessoais de
contas, ele é tratado como incidente de segurança: contenção, avaliação de risco e, quando
houver risco ou dano relevante, comunicação aos titulares e à ANPD nos prazos legais.

O conversor aceita RPFs abertos de GTA V Legacy e não oferece descriptografia,
execução de scripts de addons ou envio de assets para serviços de conversão.
As ferramentas Pro de roupas usam a API `api.rpforge.dev` somente para login e
licença; a sessão fica criptografada localmente (ver [PRIVACY.md](docs/PRIVACY.md)).

O certificado local de desenvolvimento não é uma assinatura pública de distribuição.
Não compartilhe chaves privadas nem adicione confiança em certificados desconhecidos.
O estado de assinatura é descrito na [Code signing policy](docs/CODE_SIGNING_POLICY.md).
