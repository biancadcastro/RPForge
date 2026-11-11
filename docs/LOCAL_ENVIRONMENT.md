# Ambiente local de testes do app desktop

Este modo liga o app desktop à **API local** do repositório `RPForge-API`, para testar
login, planos e ferramentas Pro sem tocar em produção. Ele é só para quem roda o app a
partir do código-fonte. O app instalado continua falando apenas com
`https://api.rpforge.dev`.

O lado da API (contas de teste, e-mails, banco e chave de licença locais) está descrito
em `docs/LOCAL-ENVIRONMENT.md` do repositório `RPForge-API`. Este documento cobre o app.

## Como o modo local é ligado

O padrão é sempre produção. O modo local só liga quando **todas** as condições valem:

1. o app roda a partir do repositório (não empacotado, `app.isPackaged === false`);
2. há um pedido explícito: variável `RPFORGE_ENV=local` ou argumento `--rpforge-local`;
3. os endereços são loopback: somente `localhost` ou `127.0.0.1`.

No app instalado a variável e o argumento são ignorados. Os testes automatizados
(`--test-mode`) também ignoram e usam a API simulada de sempre. Se o modo local for
pedido com um endereço fora de loopback (por exemplo `https://api.rpforge.dev` ou
qualquer `*.rpforge.dev`), o app mostra o erro e **não inicia**: ele não cai para
produção em silêncio, para que senhas de teste nunca sejam enviadas ao servidor real.

Toda a decisão fica em `desktop-web/electron/environment.mjs`.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `RPFORGE_ENV` | (vazia = produção) | `local` liga o modo local. |
| `RPFORGE_LOCAL_API` | `http://127.0.0.1:8787` | Origem da API local. |
| `RPFORGE_LOCAL_SITE` | `http://localhost:3100` | Origem do site local (links de Conta e Ajuda, cabeçalho `Origin`). |

Informe somente a origem (`http://host:porta`), sem caminho, usuário ou parâmetros.

## Passo a passo

### 1. Subir a API local

Em um terminal, na pasta `RPForge-API` (Node.js 24):

```powershell
npm ci                 # só na primeira vez
npm run local:init     # só na primeira vez: cria .dev.vars e a chave de licença local
npm run dev:stack      # API + motor em http://127.0.0.1:8787; deixe rodando
```

Confira em `http://127.0.0.1:8787/v1/desktop/licenses/keys`: o `kid` deve começar com
`local-dev-`.

### 2. Criar as contas de teste

Em outro terminal, ainda em `RPForge-API`, com o `dev:stack` rodando:

```powershell
npm run local:seed
```

O comando é idempotente e garante duas contas fictícias:

| Conta | Plano |
| --- | --- |
| `free@rpforge.test` | Free |
| `pro@rpforge.test` | Pro por 365 dias |

As senhas ficam em `RPForge-API/.local-accounts.json` (fora do Git). Não compartilhe
esse arquivo nem cole as senhas em conversas ou relatórios.

### 3. Iniciar o app no modo local

Na raiz deste repositório:

```powershell
npm run desktop:build   # só quando a interface mudou ou ainda não foi compilada
npm run desktop:local
```

`desktop:local` valida os endereços, confere que a API local respondeu e que ela
publica uma chave `local-dev-...`, e só então abre o app. Se a API estiver parada, o
comando para com a instrução do que fazer.

Alternativas equivalentes, na pasta `desktop-web`:

```powershell
$env:RPFORGE_ENV = 'local'; npx electron .
npx electron . --rpforge-local
```

### 4. Conferir que é o ambiente local

- A barra de título mostra o selo **Ambiente local de testes** em todas as janelas,
  inclusive nas ações rápidas e na tela de login.
- O título da janela (barra de tarefas, Alt+Tab) termina com
  "— ambiente local de testes".
- Em **Ajuda** aparece um aviso com os endereços da API e do site locais, e a linha
  de versão inclui "ambiente local de testes".

Se o selo não aparece, o app está em produção.

### 5. Entrar com a conta de teste

Abra **Conta**, informe o e-mail `pro@rpforge.test` e a senha de
`.local-accounts.json`, e clique em **Entrar**. A tela deve mostrar **Plano Pro
ativo**, e Roupas para OBJ, Roupas para Neon e Separar pele ficam liberadas. Com
`free@rpforge.test` a tela mostra **Plano Free** e as ferramentas de roupas avisam
"Exclusivo do plano Pro".

Login por Discord, Google ou GitHub não funciona localmente: os retornos desses
provedores apontam para a API de produção. Use e-mail e senha.

### 6. Ver os e-mails

Nenhum e-mail sai da máquina. Para ler confirmações e recuperações de senha, na pasta
`RPForge-API`:

```powershell
npm run local:mailbox
```

A saída contém tokens válidos por 30 minutos; não a compartilhe. Os links dos e-mails
apontam para o site local (`http://localhost:3100`), que precisa estar rodando para
abri-los (veja "Site" no documento da API).

## Isolamento em relação à produção

O modo local usa uma pasta própria e não lê nem grava nada da instalação normal:

| Dado | Produção | Modo local |
| --- | --- | --- |
| Perfil do Electron (cookies, chave de criptografia) | `%LOCALAPPDATA%\RPForge\desktop-profile` | `%LOCALAPPDATA%\RPForge-local\desktop-profile` |
| Sessão e licença da conta | `%LOCALAPPDATA%\RPForge\account` | `%LOCALAPPDATA%\RPForge-local\account` |
| Cache do menu (`menu-access.bin`) | `%LOCALAPPDATA%\RPForge` | `%LOCALAPPDATA%\RPForge-local` |
| Registro `HKCU\Software\RPForge\ToolAccess` e menus do Explorer | atualizados | **nunca alterados** |
| Diagnósticos de autenticação | `%LOCALAPPDATA%\RPForge\logs` | `%LOCALAPPDATA%\RPForge-local\logs` |

O perfil local começa vazio: nada é importado do perfil de produção. Como cada perfil
tem a própria trava de instância única, o app de produção e o app local podem ficar
abertos ao mesmo tempo. Os menus do botão direito do Windows continuam abrindo o app
instalado, com a conta de produção.

No modo local, qualquer requisição do app para um endereço diferente da API local é
bloqueada antes de sair.

### Licenças

- **Produção:** nada mudou. A licença precisa ter `iss` `https://api.rpforge.dev` e
  ser assinada por uma chave publicada por `https://api.rpforge.dev`. Chaves com `kid`
  `local-dev-...` são recusadas mesmo que apareçam no cache.
- **Modo local:** as chaves vêm de `<API local>/v1/desktop/licenses/keys` e só são
  aceitas chaves `local-dev-...`. Uma licença de produção não vale aqui.

A API local ainda grava `iss` `https://api.rpforge.dev` nas licenças que assina (a
constante é a mesma nos dois ambientes). Por isso o modo local aceita esse emissor e
também a origem da API local, e a separação entre os ambientes é garantida pela chave:
ela é gerada por máquina, só é publicada pela API local e só é aceita no modo local.

## Limites e cuidados

- **Uma instalação, uma conta.** A identidade do computador fica ligada à primeira
  conta que entrou. Ao trocar de `pro@` para `free@` (ou o contrário), a API responde
  que o limite de computadores foi atingido. Feche o app e apague
  `%LOCALAPPDATA%\RPForge-local\account` para gerar uma identidade nova.
- **Dois computadores por conta.** Cada identidade nova ocupa uma vaga. Se as vagas
  acabarem, libere-as pelo site local ou recomece os dados da API com
  `npm run local:reset -- --yes` (na pasta `RPForge-API`, com o servidor parado),
  seguido de `dev:stack` e `local:seed`.
- **Depois de `local:reset`** a sessão guardada no app deixa de valer. Entre de novo;
  se o login for recusado, apague `%LOCALAPPDATA%\RPForge-local\account`.
- **Chave de licença trocada** (`npm run local:licensing` gera outra): reinicie o
  `dev:stack` e o app. O app busca as chaves novas sozinho.
- **Sem internet:** uma licença local já emitida vale por até 72 horas, como em
  produção.
- **Ações rápidas:** para testar uma ação rápida no modo local, passe os argumentos
  pelo comando, por exemplo `npm run desktop:local -- --obj C:\caminho\peca.ydd`.
- **Recomeçar do zero no app:** feche o app e apague `%LOCALAPPDATA%\RPForge-local`.
  A instalação de produção não é afetada.
- Use `127.0.0.1` na origem da API. O Wrangler escuta só em IPv4, e `localhost` pode
  resolver primeiro para IPv6.

## Testes

`tests/desktop-environment.test.js` cobre: produção como padrão, as condições do modo
local, app empacotado ignorando a variável, endereços inválidos recusados, isolamento
de perfil, sessão e cache de menu, e licença local recusada em produção.

```powershell
npm test
```
