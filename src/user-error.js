// Single translation point from internal failures to text shown to the user.
// The renderer splits on DETAIL_MARKER and shows the technical detail collapsed.
export const DETAIL_MARKER = '\n\nDetalhe técnico: ';

export const MESSAGES = Object.freeze({
  internal: 'Algo deu errado. Feche e abra a ferramenta novamente.',
  corrupt: 'Este RPF parece corrompido ou foi gerado por uma ferramenta incompatível.',
  modelCorrupt: 'Este modelo parece corrompido ou foi gerado por uma ferramenta incompatível.',
  notFound: 'Arquivo ou pasta não encontrado.',
  permission: 'Sem permissão para acessar a pasta. Feche programas que estejam usando a pasta e tente de novo.',
  busy: 'O arquivo está em uso por outro programa. Feche-o e tente de novo.',
  space: 'Espaço em disco insuficiente. Libere espaço e tente de novo.',
  network: 'Sem conexão com o RPForge. Verifique a internet e tente de novo.',
  cancelled: 'Operação cancelada.',
  unexpected: 'Não foi possível concluir a operação. Tente de novo.',
});

const DETAIL_LIMIT = 500;
const ERRNO = {
  ENOENT: 'notFound', ENOTDIR: 'notFound',
  EPERM: 'permission', EACCES: 'permission',
  EBUSY: 'busy',
  ENOSPC: 'space', EDQUOT: 'space',
};
const NETWORK_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNABORTED', 'NETWORK']);
const DEVELOPER_ERRORS = new Set(['TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError']);

/** Contract/IPC validation failure: never a user mistake; only logged in full. */
export function internalError(message) {
  const error = new Error(message);
  error.internal = true;
  error.code = 'INTERNAL';
  return error;
}

/** Structural damage in an RPF (or, with code MODEL_CORRUPT, in a model). Keeps the technical text as message. */
export function corruptError(message, code = 'RPF_CORRUPT') {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Network failure (fetch rejected, DNS, timeout). Only the failure kind is kept as detail, never server text. */
export function networkError(cause) {
  const error = new Error(MESSAGES.network);
  error.code = 'NETWORK';
  error.detail = networkKind(cause);
  error.cause = cause;
  return error;
}

function truncate(text) {
  const value = String(text ?? '').trim();
  return value.length > DETAIL_LIMIT ? value.slice(0, DETAIL_LIMIT) + '…' : value;
}
function technical(error) {
  if (!error) return '';
  if (typeof error !== 'object') return truncate(error);
  const code = error.code || error.cause?.code;
  const parts = [error.name && error.name !== 'Error' ? error.name : '', code && !String(error.message).includes(code) ? code : '', error.message, error.cause?.message && error.cause.message !== error.message ? error.cause.message : ''];
  return truncate(parts.filter(Boolean).join(': '));
}
function networkKind(error) {
  const kind = [error?.cause?.code, error?.code, error?.name].find(value => typeof value === 'string' && value && value !== 'Error');
  return kind ? truncate(kind) : '';
}
function isNetwork(error) {
  const code = error.code, cause = error.cause?.code;
  return error.message === 'fetch failed' || error.name === 'TimeoutError' || NETWORK_CODES.has(code) || NETWORK_CODES.has(cause) ||
    String(code).startsWith('UND_ERR_') || String(cause).startsWith('UND_ERR_') ||
    (error.name === 'TypeError' && /fetch|network/i.test(error.message));
}
function clean(message) {
  // Electron prefixes errors relayed over IPC; a bare "Error: " must never reach the user.
  return String(message ?? '').replace(/^Error invoking remote method '[^']*': /, '').replace(/^(?:[A-Za-z]*Error: )+/, '').trim();
}

/** Picks a curated Portuguese line written by the clothing engines; null for .NET/CodeWalker internals. */
export function engineLine(stderr) {
  const lines = String(stderr ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (/^(?:at|em) /.test(line) || /Exception|System\.|Microsoft\.|CodeWalker|SharpDX|\.cs:|0x[0-9a-f]{6,}|---/i.test(line)) continue;
    // .NET framework messages (English or localized pt-BR) are internals, not curated engine text.
    if (/Object reference|referência de objeto|Index was outside|índice (?:estava )?fora|fora dos limites|Valor não pode ser nulo|Nome do parâmetro|Parameter name|Could not (?:load|find)|Não foi possível (?:carregar|localizar)|Access to the path|Acesso ao caminho|O processo não pode acessar|Unable to|Attempted to/i.test(line)) continue;
    if (line.length > 300) continue;
    // Curated engine messages are Portuguese; framework messages in English are never shown.
    if (/[áàâãéêíóôõúç]/i.test(line) || /\b(?:sem|não|ou|de|da|do|com|para|use|selecione|informe|peça|malha|esta|nenhum[a]?)\b/i.test(line)) return line;
  }
  return null;
}

/** Error for a failed clothing engine run: curated line, or the operation's generic text with stderr as detail. */
export function engineError(error, fallback, cancelled) {
  if (error?.code === 'ABORT_ERR' || error?.name === 'AbortError') {
    const result = new Error(cancelled);
    result.code = 'CANCELLED';
    return result;
  }
  const curated = engineLine(error?.stderr);
  const result = new Error(curated || fallback);
  result.code = 'ENGINE_FAILED';
  if (!curated) result.detail = truncate(error?.stderr || technical(error));
  return result;
}

export function userError(error) {
  if (error === undefined || error === null) return { message: MESSAGES.unexpected, detail: '' };
  if (typeof error !== 'object') error = { message: String(error) };
  const raw = clean(error.message);
  // Already translated (e.g. a worker result relayed by the main process): keep it.
  if (raw.includes(DETAIL_MARKER)) {
    const at = raw.indexOf(DETAIL_MARKER);
    return { message: raw.slice(0, at).trim() || MESSAGES.unexpected, detail: raw.slice(at + DETAIL_MARKER.length).trim() };
  }
  if (error.internal || error.code === 'INTERNAL') return { message: MESSAGES.internal, detail: '' };
  if (error.code === 'RPF_CORRUPT') return { message: MESSAGES.corrupt, detail: truncate(raw) };
  if (error.code === 'MODEL_CORRUPT') return { message: MESSAGES.modelCorrupt, detail: truncate(raw) };
  if (/^Z_/.test(String(error.code ?? '')) || error.code === 'ERR_BUFFER_TOO_LARGE') return { message: MESSAGES.corrupt, detail: technical(error) };
  if (ERRNO[error.code]) {
    const paths = [error.path, error.dest].filter(Boolean);
    return { message: MESSAGES[ERRNO[error.code]], detail: truncate(paths.join(' → ')) };
  }
  if (error.code === 'NETWORK') return { message: raw || MESSAGES.network, detail: truncate(error.detail ?? '') };
  if (isNetwork(error)) return { message: MESSAGES.network, detail: networkKind(error) };
  if (error.code === 'ABORT_ERR' || error.name === 'AbortError') return { message: MESSAGES.cancelled, detail: '' };
  if (DEVELOPER_ERRORS.has(error.name) || /^ERR_/.test(String(error.code ?? '')) || /^E[A-Z]{2,}$/.test(String(error.code ?? '')) || !raw)
    return { message: MESSAGES.unexpected, detail: technical(error) };
  return { message: raw, detail: truncate(error.detail ?? '') };
}

export function formatUserError(error) {
  const { message, detail } = userError(error);
  return detail ? message + DETAIL_MARKER + detail : message;
}
