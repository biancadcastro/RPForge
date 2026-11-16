'use strict';
// RPForge Texture Studio — interface language.
// The source strings are English. The panel follows Photoshop's own UI language
// (uxp.host.uiLocale) when it is one of the languages below, and falls back to English.
// Placeholders are {0}, {1}… and keep their meaning in every language.

const LANGS = {
  pt: 'pt_BR', de: 'de', fr: 'fr', es: 'es', it: 'it', ja: 'ja', ko: 'ko', zh: 'zh_CN',
  ru: 'ru', uk: 'uk', pl: 'pl', cs: 'cs', tr: 'tr', nl: 'nl', sv: 'sv', da: 'da', fi: 'fi', nb: 'nb', no: 'nb', nn: 'nb',
};
const CODES = [...new Set(Object.values(LANGS))];

let current = 'en', table = null, patterns = null;

// 'de_DE' → 'de', 'pt_BR' → 'pt_BR', 'zh_CN' → 'zh_CN', 'zh_TW' → English (not translated).
function resolve(locale) {
  const l = String(locale || '').replace('-', '_');
  const base = l.split('_')[0].toLowerCase();
  if (base === 'zh' && !/^zh_(CN|SG|Hans)/i.test(l)) return 'en';
  return LANGS[base] || 'en';
}

function load(code) {
  try { return require(`./i18n/${code}.js`); } catch (e) { return null; }
}

function setLocale(locale) {
  const code = resolve(locale);
  table = code === 'en' ? null : load(code);
  current = table ? code : 'en';
  patterns = null;
  return current;
}

function detectLocale() {
  try { const host = require('uxp').host; if (host && host.uiLocale) return host.uiLocale; } catch (e) {}
  try { if (typeof navigator !== 'undefined' && navigator.language) return navigator.language; } catch (e) {}
  return 'en_US';
}

const format = (s, args) => String(s).replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined && args[i] !== null ? String(args[i]) : m));

// t('Saved to {0}.', name)
function t(text, ...args) {
  const hit = table && table[text];
  return format(hit || text, args);
}

// Translates a finished English sentence (engine errors and progress labels) by matching the
// keys that have placeholders. Unknown text is returned as it is.
function tr(text) {
  if (!table || !text) return text;
  const s = String(text);
  if (table[s]) return table[s];
  if (!patterns) {
    patterns = [];
    for (const key of Object.keys(table)) {
      if (!/\{\d+\}/.test(key)) continue;
      const order = [];
      const source = key.split(/(\{\d+\})/).map(part => {
        const m = /^\{(\d+)\}$/.exec(part);
        if (m) { order.push(Number(m[1])); return '([\\s\\S]*?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      patterns.push({ re: new RegExp('^' + source + '$'), order, key });
    }
  }
  for (const p of patterns) {
    const m = p.re.exec(s);
    if (!m) continue;
    const args = [];
    p.order.forEach((index, k) => { args[index] = m[k + 1]; });
    return format(table[p.key], args);
  }
  return s;
}

// Every translation of an English string, English included (to recognise layer names made in
// any language, e.g. the UV guides of a PSD saved by someone else).
function variants(text) {
  const out = new Set([text]);
  for (const code of CODES) { const tb = load(code); if (tb && tb[text]) out.add(tb[text]); }
  return [...out];
}

// Static panel text: elements with class "t" (inner HTML) and "tt" (title attribute).
const normal = s => String(s || '').replace(/<br\s*\/?>/gi, '<br>').replace(/\s+/g, ' ').trim();
function translateDom(doc) {
  if (!table || !doc || !doc.querySelectorAll) return;
  for (const el of Array.from(doc.querySelectorAll('.t'))) {
    const key = normal(el.innerHTML);
    if (key && table[key]) el.innerHTML = table[key];
  }
  for (const el of Array.from(doc.querySelectorAll('.tt'))) {
    const title = el.getAttribute ? el.getAttribute('title') : el.title;
    if (title && table[title]) { if (el.setAttribute) el.setAttribute('title', table[title]); else el.title = table[title]; }
  }
}

const locale = () => current;
const numberLocale = () => (current === 'en' ? 'en-US' : current.replace('_', '-'));

setLocale(detectLocale());

module.exports = { t, tr, setLocale, locale, numberLocale, translateDom, variants, resolve, CODES, format };
