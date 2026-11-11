import { DOMParser } from '@xmldom/xmldom';

/**
 * Tolerant reading of game XML (.meta). Only unambiguous defects are accepted, and each one
 * becomes a warning: a UTF-8/UTF-16 byte order mark, blank lines before the declaration, NUL
 * bytes or junk after the closing root tag, and a file cut right after a complete closing tag
 * whose only defect is the missing closing tags at the end. Values are never guessed or changed.
 * Returns the parsed document, the text to write to the output and the warnings.
 */
export function readXml(data, label, { root } = {}) {
  const notes = [];
  let text = decode(data, label, notes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error(`Declaração XML externa não suportada: ${label}`);
  const leading = text.match(/^[\s\0]+/)?.[0] ?? '';
  if (leading) {
    text = text.slice(leading.length);
    if (text.startsWith('<?xml')) notes.push(`${label} tinha espaços ou linhas em branco antes da declaração XML; foram removidos.`);
  }
  const nul = text.match(/\0+[\s\0]*$/);
  if (nul) { text = text.slice(0, nul.index); notes.push(`${label} tinha bytes nulos depois do fim do XML; foram descartados.`); }
  const parsed = parse(text);
  if (!parsed.errors.length && parsed.doc?.documentElement) return done(parsed.doc, text, label, root, notes);

  const rootName = text.replace(/^<\?[\s\S]*?\?>\s*/, '').replace(/^(?:<!--[\s\S]*?-->\s*)*/, '').match(/^<([A-Za-z_][\w.:-]*)/)?.[1];
  // Junk after the closing root tag (NUL padding, stray bytes): cut it and say so.
  if (rootName) {
    const close = text.lastIndexOf(`</${rootName}>`);
    if (close >= 0) {
      const end = close + rootName.length + 3;
      if (text.slice(end).replace(/\0/g, '').trim() || text.slice(end).includes('\0')) {
        const trimmed = text.slice(0, end), attempt = parse(trimmed);
        if (!attempt.errors.length && attempt.doc?.documentElement) {
          notes.push(`${label} tinha bytes sobrando depois da tag final; foram descartados.`);
          return done(attempt.doc, trimmed + '\n', label, root, notes);
        }
      }
    }
  }
  // Truncated file: complete only the missing closing tags, in order.
  const scan = openElements(text);
  if (scan.ok && scan.open.length && scan.lastClosed && rootName && scan.open[0] === rootName) {
    const repaired = text.replace(/\s*$/, '') + '\n' + scan.open.slice().reverse().map(name => `</${name}>`).join('\n') + '\n';
    const attempt = parse(repaired);
    if (!attempt.errors.length && attempt.doc?.documentElement) {
      notes.push(`${label} estava incompleto no final; as tags de fechamento foram completadas. Confira o veículo no jogo.`);
      return done(attempt.doc, repaired, label, root, notes);
    }
  }
  if (scan.cut) throw new Error(`O arquivo ${label} está incompleto: termina no meio de ${scan.cut} (perto da linha ${lineAt(text)}). Corrija o arquivo no RPF de origem e tente de novo.`);
  if (scan.ok && scan.open.length) throw new Error(`O arquivo ${label} está incompleto: termina logo depois de abrir <${scan.open.at(-1)}> (perto da linha ${lineAt(text)}). Corrija o arquivo no RPF de origem e tente de novo.`);
  const first = parsed.errors.find(message => /line:\d/.test(message)) || parsed.errors[0] || '';
  const line = Number(first.match(/line:(\d+)/)?.[1]) || null;
  throw new Error(`O arquivo ${label} tem XML inválido${line ? ` perto da linha ${line}` : ''} (${reason(first)}). Corrija o arquivo no RPF de origem e tente de novo.`);
}

const utf8Declaration = text => text.replace(/^(\s*<\?xml[^>]*encoding=)(["'])utf-16\2/i, '$1$2UTF-8$2');
function decode(data, label, notes) {
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    notes.push(`${label} estava em UTF-16; foi convertido para UTF-8.`);
    return utf8Declaration(data.subarray(2).toString('utf16le'));
  }
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    notes.push(`${label} estava em UTF-16; foi convertido para UTF-8.`);
    const swapped = Buffer.from(data.subarray(2, 2 + ((data.length - 2) & ~1)));
    swapped.swap16();
    return utf8Declaration(swapped.toString('utf16le'));
  }
  const text = data.toString('utf8');
  return text.startsWith('﻿') ? text.slice(1) : text;
}
function parse(text) {
  const errors = [];
  let doc;
  try { doc = new DOMParser({ onError: (level, message) => { if (level !== 'warning') errors.push(String(message)); } }).parseFromString(text, 'text/xml'); }
  catch (error) { errors.push(String(error?.message ?? error) + (error?.locator?.lineNumber ? ` line:${error.locator.lineNumber}` : '')); }
  return { doc, errors };
}
function done(doc, text, label, root, notes) {
  if (root && doc.documentElement.tagName !== root) throw new Error(`O arquivo ${label} não tem a estrutura esperada (raiz ${doc.documentElement.tagName}, esperado ${root}).`);
  return { doc, text, notes, changed: notes.length > 0 };
}
/** Elements still open at the end; `cut` names what was interrupted when the text ends inside markup or a value. */
function openElements(text) {
  const open = [];
  let at = 0, lastClosed = false;
  while (at < text.length) {
    const lt = text.indexOf('<', at);
    if (lt < 0) return text.slice(at).trim() ? { ok: false, cut: 'um valor', open } : { ok: true, open, lastClosed };
    if (text.startsWith('<!--', lt)) { const end = text.indexOf('-->', lt + 4); if (end < 0) return { ok: false, cut: 'um comentário', open }; at = end + 3; continue; }
    if (text.startsWith('<![CDATA[', lt)) { const end = text.indexOf(']]>', lt); if (end < 0) return { ok: false, cut: 'um bloco CDATA', open }; at = end + 3; continue; }
    if (text.startsWith('<?', lt)) { const end = text.indexOf('?>', lt); if (end < 0) return { ok: false, cut: 'a declaração XML', open }; at = end + 2; continue; }
    let quote = '', end = -1;
    for (let i = lt + 1; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') { end = i; break; }
    }
    if (end < 0) return { ok: false, cut: quote ? 'um atributo' : 'uma tag', open };
    const tag = text.slice(lt + 1, end);
    if (tag.startsWith('/')) { if (open.pop() !== tag.slice(1).trim()) return { ok: false, open }; lastClosed = true; }
    else if (tag.endsWith('/')) lastClosed = true;
    else {
      const name = tag.match(/^([A-Za-z_][\w.:-]*)/)?.[1];
      if (!name) return { ok: false, open };
      open.push(name); lastClosed = false;
    }
    at = end + 1;
  }
  return { ok: true, open, lastClosed };
}
const lineAt = text => text.split('\n').length;
function reason(message) {
  if (/unclosed|not closed/i.test(message)) return 'há uma tag sem fechamento';
  if (/end tag name|not match|mismatch/i.test(message)) return 'uma tag de fechamento não corresponde à de abertura';
  if (/attribute/i.test(message)) return 'há um atributo malformado';
  if (/invalid character|illegal/i.test(message)) return 'há caracteres inválidos';
  return 'a estrutura do XML está incorreta';
}
