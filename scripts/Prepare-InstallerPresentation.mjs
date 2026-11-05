import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const destination = path.join(root, '.tools/installer-presentation');
await mkdir(destination, { recursive: true });
const text = file => readFile(path.join(root, file), 'utf8');
await writeFile(path.join(destination, 'terms-license.txt'), '\ufeff' + await text('installer/legal/TERMS.txt') + '\n\n' + await text('LICENSE'));
await writeFile(path.join(destination, 'privacy.txt'), '\ufeff' + await text('installer/legal/PRIVACY.txt'));
const licenses = [
  ['Electron', 'desktop-web/node_modules/electron/LICENSE'],
  ['Next.js', 'desktop-web/node_modules/next/license.md'],
  ['React', 'desktop-web/node_modules/react/LICENSE'],
  ['React DOM', 'desktop-web/node_modules/react-dom/LICENSE'],
  ['Pixelify Sans', 'desktop-web/public/fonts/OFL.txt'],
  ['Atkinson Hyperlegible', 'desktop-web/public/fonts/Atkinson-OFL.txt'],
  ['xmldom', 'node_modules/@xmldom/xmldom/LICENSE'],
];
let notices = await text('THIRD_PARTY_NOTICES.md');
for (const name of ['Node.js-LICENSE.txt', 'llvm-mingw-LICENSE.txt']) {
  try { notices += `\n\n${'='.repeat(64)}\n${name}\n${'='.repeat(64)}\n\n${await text('packaging-stage/licenses/' + name)}`; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (const [name, filename] of licenses) notices += `\n\n${'='.repeat(64)}\n${name}\n${'='.repeat(64)}\n\n${await text(filename)}`;
await writeFile(path.join(destination, 'third-party.txt'), '\ufeff' + notices);
const html = await text('desktop-web/node_modules/electron/dist/LICENSES.chromium.html');
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const chromium = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<\/(?:p|div|pre|h[1-6]|li)>/gi, '\n\n').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, value) => {
    if (value[0] !== '#') return entities[value.toLowerCase()] ?? whole;
    const code = value[1].toLowerCase() === 'x' ? parseInt(value.slice(2), 16) : Number(value.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  }).replace(/\n[ \t]+/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
await writeFile(path.join(destination, 'chromium-notices.txt'), '\ufeff' + chromium);
for (const [source, name] of [
  ['desktop-web/public/brand/logo.png', 'forge-logo.png'],
  ['desktop-web/public/brand/symbol.png', 'forge-symbol.png'],
  ['desktop-web/public/fonts/PixelifySans-Regular.ttf', 'forge-display.ttf'],
  ['desktop-web/public/fonts/AtkinsonHyperlegible-Regular.ttf', 'forge-body.ttf'],
]) await copyFile(path.join(root, source), path.join(destination, name));
console.log('Prepared offline installer branding, terms, privacy and complete component notices. No installer or application payload generated.');
