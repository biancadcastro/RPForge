# Estabilização de autenticação e publicação

A interface canônica do desktop é `desktop-web` (Electron/Next). A implementação C# existente permanece para compatibilidade de infraestrutura e não deve receber uma segunda jornada de conta. Não remover infraestrutura legada sem verificar as referências do instalador e do Explorer.

`globals.css` define base e tokens; `workspace.css` define o shell e controles comuns; `atelier.css` define a composição do editor e resultados; os antigos ajustes de `alignment.css` foram incorporados a `workspace.css`. Novas telas devem reutilizar `OperationProgress`, `OperationResult` e os controles existentes. Não criar uma nova camada global para corrigir uma tela. A consolidação completa do CSS legado deve ser incremental, com capturas e testes de cada fluxo.

## Ordem de uma futura publicação

1. Validar a base revisada e preservar os dados de produção. Este trabalho não publica serviços nem gera instaladores.
2. Aplicar na API a migração aditiva `0011_desktop_retry_identity.sql` depois das anteriores. Ela adiciona `request_hash` e atualiza o marcador do esquema para 11. Não apagar instalações ou mesclar por nome de computador.
3. Publicar a API e verificar liveness/readiness. Readiness exige marcador e colunas reais. Clientes antigos continuam podendo iniciar uma nova instalação; reconectar uma identidade existente exige a nova prova assinada.
4. Publicar o site com os cabeçalhos gerados pelo export, preservando CSP específica por página. Validar hidratação, retorno OAuth, conta, MFA e revogação no domínio real.
5. Somente mediante pedido explícito, gerar a distribuição do aplicativo revisado, inventariar a fonte e os componentes, validar assinatura e instalação limpa em outra máquina e atualizar a disponibilidade anunciada. Não associar estes testes locais ao instalador público existente.

## Verificações locais

- Aplicativo: `npm test`, `npm run desktop:typecheck`, `npm run desktop:build`, `npm run desktop:test`, `node desktop-web/scripts/check-login-gate.mjs`.
- API: `npm run check`; inclui reconexão repetida, concorrência, repetição assinada, replay divergente, limite de dois dispositivos, relógio e isolamento de MFA por origem.
- Site: `npm run check`; inclui export e navegação com API isolada, CSP, acessibilidade automática, revogação e MFA.
- Motores de roupas: checks OBJ/Neon/pele usam cópias isoladas de peças reais; nunca publicar os modelos de teste ou escrever no acervo original.

Os testes de publicação interrompem apenas processos filhos criados pelo próprio ensaio. A recuperação compara identidade e hash e preserva backups, resultados editados e temporários com arquivos inesperados. A licença já emitida pode permanecer válida offline até 72 horas após revogação.

## Limites ainda externos

Os checks locais não comprovam instalação limpa, produção, OAuth real, entrega de e-mail, hardware diferente, restauração de banco ou alertas da nuvem. Alterações preexistentes e fontes não versionadas precisam ser consolidadas numa revisão antes de afirmar reprodução a partir de checkout limpo. Não misturar essas alterações em um commit automático geral.
