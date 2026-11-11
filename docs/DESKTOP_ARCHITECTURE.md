# Interface desktop — Electron + Next.js

A interface atual fica em `desktop-web/`. Next.js produz arquivos estáticos, servidos
pelo protocolo local `rpforge://app`. Não há servidor Next. Converter RPFs e Gerar
YTYP funcionam sem internet e sem conta; somente a conexão da conta e a validação da
licença das ferramentas Pro acessam `https://api.rpforge.dev`. O motor de conversão
existente em `src/` é preservado.

## Organização

| Área | Responsabilidade |
| --- | --- |
| `desktop-web/components/desktop-app.tsx` | Sessão, integração com o desktop e estado independente de cada ferramenta. |
| `components/main-navigation.tsx` | Cabeçalho, busca de ferramentas, foco e navegação. |
| `components/home-screen.tsx` | Entrada das ferramentas com a identidade visual do site. |
| `components/tool-workspace.tsx` | Configuração, revisão, resultado e versão compacta das operações. |
| `lib/desktop.ts` | Contratos tipados e registro de ferramentas usado pela home e pela navegação. |
| `electron/main.mjs` | Janelas, instância única, pastas autorizadas, diálogos e IPC. |
| `electron/preload.cjs` | API restrita exposta à interface; sem Node.js no renderer. |
| `electron/workflow.mjs` | Revisões, snapshots das escolhas e autorização da conversão. |
| `electron/worker.mjs` | Executa o motor Node em um processo temporário e encerra ao terminar. |

As ferramentas atuais, registradas em `lib/desktop.ts`, são:

| Ferramenta | Acesso | Entrada |
| --- | --- | --- |
| Converter RPFs | Free, sem login | Pasta com `.rpf` |
| Gerar YTYP | Free, sem login | Pasta com `.ydr` |
| Roupas para OBJ | Pro (`clothing.obj`) | Peça `.ydd` ou pasta |
| Roupas para Neon | Pro (`clothing.neon`) | Peça `.ydd` ou pasta |
| Separar pele | Pro (`clothing.skin`) | Peça `.ydd` ou pasta |

Assetto foi retirado da
interface, CLI, bridge e código de conversão. As fontes e imagens locais são as
mesmas do site RPForge. Pixelify é usada nos títulos e ações; Atkinson, nos textos.

## Ferramentas e estado

O registro em `lib/desktop.ts` gera a home e o menu de ferramentas. Uma ferramenta
nova recebe um ID estável, metadados, contrato de operação e sua implementação de
tela. Etapas internas não entram na navegação principal.

O estado das ferramentas fica separado e é preservado ao navegar. Durante uma
operação, sair da ferramenta ou fechar a janela é bloqueado. Uma nova revisão
invalida a anterior; hashes de origem e configurações aprovadas ficam no processo
principal e não são aceitos como autoridade quando enviados pelo renderer.

## Ações rápidas e instâncias

- Abrir sem pasta: aplicativo completo.
- Informar uma pasta: conversão rápida, com prévia e confirmação antes de gravar.
- `--ytyp <pasta>`: geração de YTYP em janela compacta.
- `--configure <pasta>`: configuração completa.
- `--obj <peça.ydd>` / `--obj-folder <pasta>`: Roupas para OBJ em janela compacta.
- `--neon <peça.ydd>` / `--neon-folder <pasta>`: Roupas para Neon.
- `--skin <peça.ydd>` / `--skin-folder <pasta>`: Separar pele.

As ações de RPF e YTYP não exigem conta. As ações de OBJ, Neon e Separar pele exigem
uma sessão conectada: sem sessão, a janela mostra o login integrado e mantém a ação
pendente; após a conexão, retoma a ferramenta e os caminhos solicitados. Não há
verificação de versão nesse fluxo.

A entrada por e-mail e senha (com MFA quando ativo) acontece na própria janela;
Discord, Google e GitHub abrem no navegador padrão. Em ambos os casos, o processo
principal cria um pedido temporário com PKCE e chave RSA por instalação, aguarda a aprovação e recebe uma sessão
própria. Não copia cookies do navegador. O refresh token e a chave privada ficam
criptografados pelo `safeStorage` do Electron no perfil local; somente nick e
avatar chegam à interface. Pedidos podem ser cancelados e expiram em dez minutos.
Renovações concorrentes compartilham a mesma requisição para evitar reutilizar
tokens rotativos. Uma sessão revogada é removida do armazenamento local, preservando a identidade da instalação.
A confirmação visual fica em `https://rpforge.dev/conectar-app/`, com a identidade
do website. A API oferece somente contexto autenticado e registro de consentimento;
o endereço legado de confirmação encaminha para o website. Os callbacks cadastrados
nos provedores continuam na API, pois fazem a troca segura do código OAuth.

O aplicativo usa uma única instância Electron, com no máximo uma janela completa
e uma janela rápida. Processos de trabalho são criados apenas durante as operações
e encerrados ao concluir. Os processos internos de Chromium/Electron são parte do
runtime, não são cópias extras do app. Não se mantém servidor Next em segundo plano.

`desktop/ForgeWebLauncher.cs` mantém o ponto de entrada do executável usado pelos
atalhos locais. Se a interface web estiver compilada e o Electron estiver presente,
ele encaminha os argumentos e encerra. O WinForms permanece como fallback legado;
o instalador local agora inclui o runtime Electron, o frontend exportado e os
arquivos de execução, sem servidor Next nem dependência da pasta do repositório.
As condições de assinatura e identidade pública continuam exigindo uma revisão
própria antes de publicar uma release.
Os testes não modificam instalações. `npm run update:local`, executado
explicitamente, faz backup dos arquivos substituídos e pode ligar a instalação
local a uma cópia autocontida em `desktop-web` por `desktop-development.json`. Isso mantém
os caminhos do menu de contexto e preserva o perfil da conta. O atualizador mantém
backup do código e do payload anterior. Não altera certificados.

O instalador apresenta termos/licença com aceite separado da autorização opcional
do certificado, documentos de privacidade e avisos completos de componentes para
leitura offline. O teste `scripts/Test-Installer.ps1 -ElectronDesktop` instala e
reinstala em uma pasta isolada, testa o Electron e o conversor dessa cópia e depois
desinstala, verificando preservação dos dados e restauração dos menus originais.

## Desenvolvimento

```powershell
npm ci
npm --prefix desktop-web ci
npm run desktop:typecheck
npm run desktop:build
npm run desktop:test
npm run desktop:legacy:build
npm run desktop:start
```

O teste desktop usa fixtures sintéticas, verifica conversão com spawn editado,
revisão, YTYP, estado ao navegar, modos rápidos e encerramento dos workers. As
imagens ficam em `output/electron/`, fora do versionamento. Todos os processos
de teste são fechados ao terminar.

`node --test --test-concurrency=2` valida os testes do motor, revisões e roteamento.
A compilação de desenvolvimento não cria instalador, não publica versão e não
altera projetos pessoais, certificados ou registros do Windows.

A interface desktop usa navegação lateral persistente, catálogo funcional de ferramentas e superfícies de trabalho compactas. A identidade visual mantém a paleta e o logotipo do RPForge, com Segoe UI nos controles e dados para legibilidade nativa no Windows. Nas telas de resultado, títulos e ações usam Pixelify e ícones em pixel, conforme a referência aprovada. `workspace.css` concentra as regras compartilhadas de densidade, navegação e painéis. A barra superior é integrada ao app, com ações restritas por IPC para a janela remetente. Os modos rápidos de roupas usam a sessão conectada; todos os modos rápidos continuam separados da navegação completa.

A seleção 3D de roupas fica em `lib/mesh-selection.ts`, separada da classificação e da exportação. Seleções por clique, área e pincel são transitórias; a atribuição produz overrides explícitos por face. O visualizador reutiliza um contexto WebGL e renderiza em resposta a eventos, com descarte dos recursos ao sair da tela. Os testes de peças reais usam cópias isoladas fora do acervo; testes de conta e RPF usam fixtures sem credenciais reais.

Menus Pro são apresentados apenas após validar uma licença assinada com as capacidades correspondentes. O app sincroniza um cache local mínimo (máscara, expiração e instalação) na abertura, ao conectar a conta e periodicamente enquanto estiver aberto. O Explorer não consulta a rede: `IExplorerCommand` e `IExplorerCommandState` ocultam comandos sem acesso ou expirados. A mesma regra vale para o menu moderno e Mostrar mais opções. O cache é apenas de apresentação; a operação sempre exige novamente a licença real no processo do app. Nenhuma chave privada ou token é gravado no cache do menu.

Os resultados de RPF, YTYP, OBJ e Neon compartilham `components/operation-result.tsx`: blocos compactos com arquivos e destino, sucesso em pixel, ações de abertura restritas aos resultados autorizados e retorno à ferramenta. Falhas e cancelamentos permanecem identificados por item, sem indicador de sucesso quando nenhum item concluiu. Avisos de auditoria ficam em detalhes expansíveis. No OBJ, a prévia 3D é opcional e só cria o visualizador ao expandir; detalhes de LOD do Neon ficam recolhidos. A separação de pele mantém os dois blocos aprovados de Roupa e Pele.

No Explorer empacotado, o cache binário atômico de acesso da instalação tem precedência sobre o registro, que pode apresentar uma visão virtualizada antiga. Um cache da instalação com máscara zero, expirado ou inválido não pode ser sobreposto por um registro Pro antigo. Após corrigir a extensão local, os comandos registrados foram verificados no mesmo servidor COM alternando Free (ocultos e invocação negada) e Pro (habilitados), restaurando a licença real ao final.

O login é exigido apenas pelas ferramentas Pro (OBJ, Neon e Separar pele). O app completo, Converter RPFs e Gerar YTYP abrem e executam sem conta; `scripts/check-login-gate.mjs` verifica esse limite. Nas ações Pro sem sessão, a navegação e os controles da ferramenta não são exibidos; a execução também é bloqueada no processo principal (`requireSession` e `requireToolAccess`), antes de criar workers. A entrada usa a própria janela, inclusive em modo rápido, e os eventos de autenticação retomam o pedido original. Login não concede Pro: a licença assinada precisa ter `plan` igual a `pro` e a capacidade correspondente (`clothing.obj`, `clothing.neon` ou `clothing.skin`). O plano Pro é concedido manualmente no servidor; o app não tem preços, checkout nem pagamento.

A geometria compartilhada dos controles e o layout de entrada ficam em `app/workspace.css` (a antiga `alignment.css` foi incorporada, conforme [DESKTOP_VISUAL_SYSTEM.md](DESKTOP_VISUAL_SYSTEM.md)). O formulário e os provedores usam colunas explícitas; campos e botões de login têm 44 px, e os controles gerais usam 40 px sem alterar os controles compactos do editor ou os botões pixel aprovados dos resultados. Os logos dos provedores reutilizam `components/provider-icon.tsx` do website e são SVGs locais. O teste desktop verifica início das colunas, alturas, larguras e centralização dos logos e setas.
