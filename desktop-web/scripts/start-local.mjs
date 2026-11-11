// npm run desktop:local — starts the desktop app against the LOCAL test API (RPForge-API `npm run dev:stack`).
// Never talks to production: addresses are validated as loopback before the app starts.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_KEY_PREFIX, resolveEnvironment } from '../electron/environment.mjs';

const project = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const fail = message => { console.error('ERRO: ' + message); process.exit(1); };

const env = { ...process.env, RPFORGE_ENV: 'local' };
delete env.ELECTRON_RUN_AS_NODE;
let environment;
try { environment = resolveEnvironment({ isPackaged: false, env, argv: [] }); }
catch (error) { fail(error.message); }

if (!existsSync(path.join(project, 'out', 'index.html')))
  fail('Interface não compilada. Execute "npm run desktop:build" na raiz do repositório antes de iniciar.');

// The local API must be up and must be the local one: its license key carries the local-dev kid.
try {
  const response = await fetch(environment.api + '/v1/desktop/licenses/keys', { signal: AbortSignal.timeout(5000), cache: 'no-store' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const kids = ((await response.json()).keys ?? []).map(key => String(key.kid));
  if (!kids.length || !kids.every(kid => kid.startsWith(LOCAL_KEY_PREFIX)))
    fail(`${environment.api} não publicou uma chave de licença local (kid ${LOCAL_KEY_PREFIX}...). No RPForge-API, execute "npm run local:init" e reinicie "npm run dev:stack".`);
} catch (error) {
  fail(`A API local não respondeu em ${environment.api} (${error.message}). No RPForge-API, execute "npm run dev:stack" e tente de novo.`);
}

console.info(`RPForge — ambiente local de testes\n  API:  ${environment.api}\n  Site: ${environment.site}\n  Dados deste modo: %LOCALAPPDATA%\\${environment.dataFolder}`);
const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, [project, ...process.argv.slice(2)], { env, stdio: 'inherit' });
child.on('exit', code => process.exit(code ?? 0));
