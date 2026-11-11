import test from 'node:test';
import assert from 'node:assert/strict';
import { readRpf } from '../src/rpf.js';
import { vehicleArchive } from './fixture.js';
import { DETAIL_MARKER, MESSAGES, corruptError, engineError, formatUserError, internalError, networkError, userError } from '../src/user-error.js';

test('corrupt RPF structure becomes a friendly message with the technical text as detail', () => {
  let failure;
  try { [...readRpf(vehicleArchive().subarray(0, 50))]; } catch (error) { failure = error; }
  assert.equal(failure.code, 'RPF_CORRUPT');
  assert.deepEqual(userError(failure), { message: MESSAGES.corrupt, detail: 'Tabela do RPF truncada.' });
  assert.equal(formatUserError(failure), 'Este RPF parece corrompido ou foi gerado por uma ferramenta incompatível.' + '\n\nDetalhe técnico: ' + 'Tabela do RPF truncada.');
  assert.equal(formatUserError(corruptError('Drawable truncado: a.ydr', 'MODEL_CORRUPT')).split(DETAIL_MARKER)[1], 'Drawable truncado: a.ydr');
});

test('node errno failures name the problem and keep only the path as detail', () => {
  const missing = Object.assign(new Error("ENOENT: no such file or directory, open 'C:\\mods\\a.rpf'"), { code: 'ENOENT', errno: -4058, syscall: 'open', path: 'C:\\mods\\a.rpf' });
  assert.equal(formatUserError(missing), 'Arquivo ou pasta não encontrado.' + DETAIL_MARKER + 'C:\\mods\\a.rpf');
  assert.match(formatUserError(Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })), /^Sem permissão para acessar a pasta\./);
  assert.match(formatUserError(Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY', path: 'x' })), /^O arquivo está em uso por outro programa\./);
  assert.match(formatUserError(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' })), /^Espaço em disco insuficiente\./);
});

test('internal contract failures never show their text to the user', () => {
  for (const text of ['Origem não autorizada.', 'Operação inválida.', 'LOD inválido.']) {
    const error = internalError(text);
    assert.equal(error.message, text);
    assert.equal(formatUserError(error), 'Algo deu errado. Feche e abra a ferramenta novamente.');
  }
});

test('network failures become the connection message without server text', () => {
  const failed = new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.rpforge.dev'), { code: 'ENOTFOUND' }) });
  assert.equal(formatUserError(failed), MESSAGES.network + DETAIL_MARKER + 'ENOTFOUND');
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  assert.equal(userError(timeout).message, MESSAGES.network);
  assert.equal(formatUserError(networkError(new Error('private-network-details'))), MESSAGES.network);
});

test('friendly messages pass unchanged and nothing starts with Error:', () => {
  assert.equal(formatUserError(new Error('Aguarde a operação terminar.')), 'Aguarde a operação terminar.');
  assert.equal(formatUserError("Error invoking remote method 'forge:operation': Error: Aguarde a operação terminar."), 'Aguarde a operação terminar.');
  // A message already translated by the worker survives the main process unchanged.
  const relayed = formatUserError(corruptError('Nome sem terminador na tabela.'));
  assert.equal(formatUserError(new Error(relayed)), relayed);
  assert.equal(formatUserError(new Error(MESSAGES.internal)), MESSAGES.internal);
  for (const error of [new TypeError("Cannot read properties of undefined (reading 'x')"), new RangeError('out of range'), Object.assign(new Error('boom'), { code: 'ERR_INVALID_ARG_TYPE' }), null, undefined, '']) {
    const text = formatUserError(error);
    assert.doesNotMatch(text, /^(?:[A-Za-z]*Error|Error):/);
    assert.ok(text.startsWith(MESSAGES.unexpected), text);
  }
});

test('clothing engine stderr shows only curated Portuguese lines', () => {
  const stack = 'System.NullReferenceException: Object reference not set to an instance of an object.\r\n   at CodeWalker.GameFiles.YddFile.Load(Byte[] data)\r\n';
  const raw = engineError({ code: 1, stderr: stack }, 'Não foi possível ler esta peça.', 'Exportação cancelada.');
  assert.equal(raw.message, 'Não foi possível ler esta peça.');
  assert.match(formatUserError(raw), /Detalhe técnico: System\.NullReferenceException/);
  const curated = engineError({ code: 1, stderr: 'Textura difusa ausente: x. Selecione o YTD correspondente.\r\n' }, 'Não foi possível ler esta peça.', 'Exportação cancelada.');
  assert.equal(formatUserError(curated), 'Textura difusa ausente: x. Selecione o YTD correspondente.');
  assert.equal(engineError({ code: 1, stderr: 'Object reference not set to an instance of an object.' }, 'Falhou.', 'Cancelada.').message, 'Falhou.');
  const cancelled = engineError({ code: 'ABORT_ERR', name: 'AbortError' }, 'Falhou.', 'Exportação cancelada.');
  assert.equal(formatUserError(cancelled), 'Exportação cancelada.');
});
