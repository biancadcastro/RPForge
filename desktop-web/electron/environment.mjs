// The single place that decides which RPForge backend this process talks to.
// Production is always the default. The local test environment needs every condition at once:
// an unpackaged run from the repository, an explicit opt-in, and loopback-only addresses.
import path from 'node:path';

export const PRODUCTION = Object.freeze({
  name: 'production',
  local: false,
  api: 'https://api.rpforge.dev',
  site: 'https://rpforge.dev',
  // `iss` values a desktop license may carry in this environment.
  licenseIssuers: Object.freeze(['https://api.rpforge.dev']),
  // Folder under %LOCALAPPDATA% holding the profile, session, license cache, logs and menu cache.
  dataFolder: 'RPForge',
});

export const LOCAL_DEFAULTS = Object.freeze({ api: 'http://127.0.0.1:8787', site: 'http://localhost:3100' });
export const LOCAL_DATA_FOLDER = 'RPForge-local';
// The local API generates a signing key per machine with this kid prefix (npm run local:licensing).
export const LOCAL_KEY_PREFIX = 'local-dev-';
export const LOCAL_FLAG = '--rpforge-local';
const LOOPBACK = new Set(['localhost', '127.0.0.1']);

export class EnvironmentError extends Error {}

/** Accepts only an http(s) origin on localhost/127.0.0.1 and returns it normalized. */
export function loopbackOrigin(value, name = 'endereço local') {
  let url;
  try { url = new URL(String(value).trim()); }
  catch { throw new EnvironmentError(`${name}: endereço inválido. Use algo como http://127.0.0.1:8787.`); }
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK.has(url.hostname))
    throw new EnvironmentError(`${name}: o ambiente local só aceita localhost ou 127.0.0.1 (recebido: ${url.hostname || url.protocol}).`);
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== ''))
    throw new EnvironmentError(`${name}: informe somente a origem, sem usuário, caminho ou parâmetros.`);
  return url.origin;
}

export function localRequested({ env = {}, argv = [] } = {}) {
  return env.RPFORGE_ENV === 'local' || argv.includes(LOCAL_FLAG);
}

/**
 * Resolves the environment of this process.
 * - packaged (installed) apps and automated test mode always get production: the opt-in is ignored;
 * - an opt-in with an address outside loopback throws instead of silently falling back, so test
 *   credentials are never sent to production by mistake.
 */
export function resolveEnvironment({ isPackaged = true, env = {}, argv = [], testMode = false } = {}) {
  if (isPackaged !== false || testMode || !localRequested({ env, argv })) return PRODUCTION;
  const api = loopbackOrigin(env.RPFORGE_LOCAL_API || LOCAL_DEFAULTS.api, 'RPFORGE_LOCAL_API');
  const site = loopbackOrigin(env.RPFORGE_LOCAL_SITE || LOCAL_DEFAULTS.site, 'RPFORGE_LOCAL_SITE');
  return Object.freeze({
    name: 'local',
    local: true,
    api,
    site,
    // The local API still stamps the production issuer constant; the key policy below is what
    // separates the two worlds. The local origin is accepted for when the API starts using it.
    licenseIssuers: Object.freeze([api, PRODUCTION.api]),
    dataFolder: LOCAL_DATA_FOLDER,
  });
}

/** Signing keys usable in an environment: local-dev keys only in local mode, and nothing else there. */
export function licenseKeyAllowed(kid, environment = PRODUCTION) {
  if (typeof kid !== 'string' || !kid) return false;
  return kid.startsWith(LOCAL_KEY_PREFIX) === !!environment.local;
}

/** Root of everything this environment stores for the user. Local never shares it with production. */
export function dataRoot(environment, localAppData) {
  if (!localAppData) throw new EnvironmentError('Pasta de dados local indisponível.');
  return path.join(localAppData, environment.local ? LOCAL_DATA_FOLDER : PRODUCTION.dataFolder);
}

/** In local mode every request must stay on the configured loopback API. */
export function guardFetch(environment, fetcher) {
  if (!environment.local) return fetcher;
  return (input, ...rest) => {
    let origin;
    try { origin = new URL(typeof input === 'string' ? input : input.url).origin; } catch { origin = ''; }
    if (origin !== environment.api) throw new EnvironmentError('Ambiente local: requisição fora da API local bloqueada.');
    return fetcher(input, ...rest);
  };
}

/** What the renderer may know. */
export function publicEnvironment(environment) {
  return environment.local
    ? { name: 'local', local: true, label: 'Ambiente local de testes', api: environment.api, site: environment.site }
    : { name: 'production', local: false, label: '', api: '', site: '' };
}
