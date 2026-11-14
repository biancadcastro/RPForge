// Builds the RPForge Texture Studio Photoshop plugin:
//   1. draws the icons the manifest references (light/dark panel icons, plugin icon, @2x),
//   2. validates the manifest and every file the panel loads (scripts, styles, require()),
//   3. syntax-checks every JavaScript file,
//   4. copies only the plugin files to output/texture-studio-plugin/ (the folder to load in
//      UXP Developer Tool) and zips them as output/rpforge-texture-studio-<version>.ccx.
// Never installs anything and never talks to Photoshop.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { deflateSync, deflateRawSync, crc32 } from 'node:zlib';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'photoshop', 'texture-studio');
const dist = path.join(root, 'output', 'texture-studio-plugin');
const problems = [];
const fail = m => problems.push(m);

// ---------------------------------------------------------------- icons
// Every icon comes from the approved RPForge identity (design/identidade/Final); nothing is redrawn.
const brand = path.join(root, 'design', 'identidade', 'Final');
const { decodePng } = createRequire(import.meta.url)('../photoshop/texture-studio/engine/png.js');
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Area-averaging resize with premultiplied alpha, fitted and centred in a size x size canvas.
function fit(src, size, margin = 0) {
  const inner = size - margin * 2, k = Math.min(inner / src.width, inner / src.height);
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const ox = Math.floor((size - w) / 2), oy = Math.floor((size - h) / 2), out = new Uint8Array(size * size * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = x * src.width / w, x1 = (x + 1) * src.width / w, y0 = y * src.height / h, y1 = (y + 1) * src.height / h;
    let r = 0, g = 0, b = 0, a = 0, area = 0;
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const wy = Math.min(y1, sy + 1) - Math.max(y0, sy), wx = Math.min(x1, sx + 1) - Math.max(x0, sx), wgt = wx * wy;
      const o = (sy * src.width + sx) * 4, al = src.rgba[o + 3] / 255 * wgt;
      r += src.rgba[o] * al; g += src.rgba[o + 1] * al; b += src.rgba[o + 2] * al; a += al; area += wgt;
    }
    const o = ((oy + y) * size + ox + x) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
    out[o + 3] = Math.round(255 * a / area);
  }
  return out;
}
function icons() {
  const dir = path.join(source, 'icons');
  mkdirSync(dir, { recursive: true });
  const load = rel => { const f = path.join(brand, rel); if (!existsSync(f)) throw new Error(`identidade ausente: ${rel}`); return decodePng(new Uint8Array(readFileSync(f))); };
  const light = load('png/rpforge-simbolo-branco.png'), dark = load('png/rpforge-simbolo-preto.png'), app = load('icons/rpforge-escuro-1024.png');
  for (const scale of [1, 2]) {
    const suffix = scale === 2 ? '@2x' : '', s = 23 * scale, p = 48 * scale;
    writeFileSync(path.join(dir, `panel-dark${suffix}.png`), png(s, s, fit(light, s, scale)));
    writeFileSync(path.join(dir, `panel-light${suffix}.png`), png(s, s, fit(dark, s, scale)));
    writeFileSync(path.join(dir, `plugin${suffix}.png`), png(p, p, fit(app, p)));
  }
  const shipped = path.join(source, 'assets', 'rpforge-icon.png');
  if (!existsSync(shipped)) copyFileSync(path.join(brand, 'icons', 'rpforge-escuro-64.png'), shipped);
}

// ---------------------------------------------------------------- validation
function validate() {
  const manifestPath = path.join(source, 'manifest.json');
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch (e) { fail(`manifest.json inválido: ${e.message}`); return null; }
  if (manifest.manifestVersion !== 5) fail('manifestVersion precisa ser 5');
  for (const k of ['id', 'name', 'version', 'main', 'host', 'entrypoints']) if (!manifest[k]) fail(`manifest sem "${k}"`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) fail('version precisa ser x.y.z');
  if (Array.isArray(manifest.host)) fail('host deve ser um objeto para um único app');
  if (manifest.host && manifest.host.app !== 'PS') fail('host.app precisa ser "PS"');
  const iconSets = [...(manifest.icons || []), ...manifest.entrypoints.flatMap(e => e.icons || [])];
  for (const icon of iconSets) for (const scale of icon.scale || [1]) {
    const file = scale === 1 ? icon.path : icon.path.replace(/(\.\w+)$/, `@${scale}x$1`);
    const full = path.join(source, file);
    if (!existsSync(full)) fail(`ícone ausente: ${file}`);
    else {
      const b = readFileSync(full), w = b.readUInt32BE(16), h = b.readUInt32BE(20);
      if (w !== icon.width * scale || h !== icon.height * scale) fail(`ícone ${file} tem ${w}x${h}, esperado ${icon.width * scale}x${icon.height * scale}`);
    }
  }
  for (const e of manifest.entrypoints) {
    if (e.type !== 'panel') fail(`entrypoint ${e.id}: tipo ${e.type}`);
    if (!e.label || !e.label.default) fail(`entrypoint ${e.id} sem label.default`);
  }
  const html = readFileSync(path.join(source, manifest.main), 'utf8');
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (!/^https?:/.test(ref) && !existsSync(path.join(source, ref))) fail(`index.html referencia arquivo ausente: ${ref}`);
  return manifest;
}

function pluginFiles() {
  const files = [];
  const walk = rel => {
    for (const name of readdirSync(path.join(source, rel))) {
      const r = path.join(rel, name), full = path.join(source, r);
      if (statSync(full).isDirectory()) walk(r);
      else if (name !== 'package.json' && !name.startsWith('.')) files.push(r.replace(/\\/g, '/'));
    }
  };
  walk('');
  return files;
}

function checkScripts(files) {
  for (const f of files.filter(f => f.endsWith('.js'))) {
    const code = readFileSync(path.join(source, f), 'utf8');
    try { new vm.Script(code, { filename: f }); } catch (e) { fail(`erro de sintaxe em ${f}: ${e.message}`); }
    for (const [, ref] of code.matchAll(/require\('(\.[^']+)'\)/g)) {
      const target = path.join(path.dirname(path.join(source, f)), ref);
      if (![target, target + '.js'].some(existsSync)) fail(`${f} faz require de arquivo ausente: ${ref}`);
    }
    const codeOnly = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
    if (/\bBuffer\b|require\('(fs|path|zlib|node:)/.test(codeOnly)) fail(`${f} usa API do Node que não existe no Photoshop`);
  }
}

// ---------------------------------------------------------------- zip (.ccx)
function zip(files, base) {
  const local = [], central = [];
  let offset = 0;
  for (const name of files) {
    const data = readFileSync(path.join(base, name)), packed = deflateRawSync(data, { level: 9 }), crc = crc32(data), fname = Buffer.from(name, 'utf8');
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(packed.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(fname.length, 26);
    local.push(h, fname, packed);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(fname.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, fname);
    offset += 30 + fname.length + packed.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

icons();
const manifest = validate();
const files = pluginFiles();
checkScripts(files);
if (problems.length) { console.error('Build recusado:\n- ' + problems.join('\n- ')); process.exit(1); }
rmSync(dist, { recursive: true, force: true });
for (const f of files) { mkdirSync(path.dirname(path.join(dist, f)), { recursive: true }); copyFileSync(path.join(source, f), path.join(dist, f)); }
const ccx = path.join(root, 'output', `rpforge-texture-studio-${manifest.version}.ccx`);
writeFileSync(ccx, zip(files, source));
console.log(`OK: ${files.length} arquivos validados.\nPasta para o UXP Developer Tool: ${dist}\nPacote: ${ccx}`);

// The Adobe Marketplace requires the plugin ID generated by its portal, and Adobe advises against
// shipping that ID outside the Marketplace. With RPFORGE_MARKETPLACE_ID set, a second package is
// built with that ID; the site package keeps dev.rpforge.texturestudio.
const marketplaceId = process.env.RPFORGE_MARKETPLACE_ID?.trim();
if (marketplaceId) {
  if (marketplaceId === manifest.id) { console.error('RPFORGE_MARKETPLACE_ID precisa ser o ID gerado pelo portal da Adobe.'); process.exit(1); }
  const stage = path.join(root, 'output', 'texture-studio-plugin-marketplace');
  rmSync(stage, { recursive: true, force: true });
  for (const f of files) { mkdirSync(path.dirname(path.join(stage, f)), { recursive: true }); copyFileSync(path.join(source, f), path.join(stage, f)); }
  writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify({ ...manifest, id: marketplaceId }, null, 2) + '\n');
  const market = path.join(root, 'output', `rpforge-texture-studio-${manifest.version}-marketplace.ccx`);
  writeFileSync(market, zip(files, stage));
  console.log(`Pacote da Marketplace (ID ${marketplaceId}): ${market}`);
}
