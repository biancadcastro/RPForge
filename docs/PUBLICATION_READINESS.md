# Revisão pré-publicação — 1 de novembro de 2026

Escopo: passo 1, preparar o repositório para a decisão de abertura. O repositório
continua **privado**. Esta revisão não autoriza mudança de visibilidade, publicação
de release, candidatura ou assinatura pela SignPath.

## Resultado

O conteúdo atual e o histórico foram revisados para a abertura do código. Não foram
encontradas credenciais pelos critérios da varredura executada. Há uma decisão de
privacidade da autoria e configurações a concluir antes/depois de tornar público,
descritas abaixo. Isso não é uma garantia de ausência de qualquer segredo ou falha.

| Área | Conferência |
| --- | --- |
| Histórico Git | 45 commits anteriores à revisão examinados com Gitleaks 8.30.1; zero achados. Ferramenta obtida da release oficial, com SHA-256 conferido. Nova varredura ao concluir os commits da revisão. |
| Arquivos históricos | Sem arquivos de jogo, instaladores, DLLs, arquivos de ambiente ou chaves privadas nos nomes versionados. |
| Logs de Actions | Logs das três execuções anteriores examinados; zero achados do Gitleaks. |
| Anexos e distribuição no GitHub | Nenhuma issue, release ou artifact de Actions existente no início da revisão. |
| Autoria | Um endereço de autor que não é GitHub no-reply está presente no histórico. Nenhum endereço foi copiado para este relatório e o histórico não foi reescrito. |
| Dependências npm | Auditoria sem vulnerabilidades conhecidas reportadas na data da revisão. |
| Código próprio | LICENSE, NOTICE, package.json, lockfile e SBOM usam GPL-3.0-only de forma consistente. |
| Terceiros | Licenças do Node, xmldom, fontes e toolchains preservadas e inventário atualizado. |
| Manual | PDF recomposto com fontes abertas Pixelify Sans e Atkinson Hyperlegible; avisos OFL preservados. |
| Compilação local | Preparação do menu atualizada para obter LLVM/SDK por versão e hash fixados, sem depender dos caches com nomes pessoais da máquina original. Bootstrap do SDK e sintaxe PowerShell verificados sem criar instalador. |
| Proteção de arquivos | Política compartilhada por CI e inventário recusa chaves, distribuições e tipos adicionais de assets GTA; testes de regressão adicionados. |
| Testes locais | 46 testes do Node e verificador SignPath aprovados. |
| Integração contínua | Matriz com Windows/Linux e Node 22/24. Execuções anteriores verdes; nova execução após o push da revisão. |

As capturas usam exemplos fictícios. A imagem de YTYP mostra um caminho do workspace
de demonstração; não há conteúdo pessoal, modelo do GTA ou chave nessa imagem. As
pastas locais ignoradas, backups, certificados, logs e acervo não serão enviados
ao tornar este repositório público.

## Configurações verificadas no GitHub

- Visibilidade privada e apenas a mantenedora como colaboradora.
- Actions habilitadas com token padrão somente de leitura; sem permissão para aprovar PRs.
- Exigência de actions fixadas em SHA habilitada durante a revisão.
- Alertas de vulnerabilidade de dependências habilitados durante a revisão.
- Configuração de atualizações de dependências preparada, sempre por PR para revisão.
- Sem segredos ou variáveis de Actions cadastrados na consulta da revisão.
- Fluxo SignPath manual e desativado, sem organização, política ou Publisher presumidos.
- CODEOWNERS existente; guias de contribuição, segurança, formulários de issues e modelo de PR adicionados.

## Decisões e ações que permanecem separadas

### Antes de autorizar a visibilidade pública

1. Decidir se o endereço de autoria atual pode continuar no histórico público.
   Mudar apenas o endereço de novos commits não oculta os commits antigos. Uma
   eventual reescrita precisa ser combinada separadamente porque muda os IDs usados
   na proveniência de builds anteriores. Não foi feita nesta revisão.
2. Confirmar o conteúdo final que se deseja abrir, incluindo histórico e documentação.
3. Autorizar explicitamente a mudança de visibilidade. Push no repositório privado
   não substitui essa autorização.

### Logo depois da abertura, antes de aceitar contribuições externas

1. Configurar a proteção da branch main, com checagens obrigatórias e revisão das
   mudanças de distribuição. A consulta atual retorna HTTP 403: o plano do GitHub
   não oferece essa proteção enquanto o repositório está privado. A revisão não
   alterou o plano nem tornou o projeto público para contornar a limitação.
2. Habilitar e testar o canal privado de relatos de vulnerabilidade e revisar as
   opções de detecção de segredos disponíveis para repositórios públicos.
3. Conferir novamente permissões, logs de Actions e atualização de dependências.

### Antes de uma release para usuários

- Compilar uma revisão identificada, testar a distribuição e anexar código-fonte
  correspondente, licenças e hashes. Não reapresentar o instalador 0.3.1 existente
  como se tivesse sido compilado dos commits desta revisão.
- Separar claramente edição local de testes e edição de distribuição. O certificado
  de teste não substitui a assinatura pública e não deve ser usado para prometer
  funcionamento imediato em computadores que não confiam nele.
- Manter a candidatura SignPath como etapa própria. A aprovação depende da avaliação
  da Foundation, incluindo os requisitos de versão disponível e reputação verificável.

## Evidências locais

Relatórios de varredura e logs permanecem em `.tools/publication-review`, fora do Git.
Não contêm achados brutos publicados. O PDF e os avisos de fonte estão versionados
com a documentação. Nenhum instalador foi criado nesta revisão.

Referências: [consequências da mudança de visibilidade](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility),
[condições da SignPath Foundation](https://signpath.org/terms),
[Gitleaks](https://github.com/gitleaks/gitleaks).
