// Development-only regeneration: NODE_PATH may point to a local @resvg/resvg-js installation.
const fs = require('fs'), path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'desktop/assets/rpforge-icon.svg'), 'utf8');
const out = path.join(root, 'shell/VisualAssets');
fs.mkdirSync(out, { recursive: true });
function render(name, size, light = false) {
  const svg = light ? source.replaceAll('#F4F1EA', '#14141B') : source;
  fs.writeFileSync(path.join(out, name + '.png'), new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
}
render('MenuLogo', 44); render('LargeLogo', 150); render('StoreLogo', 50);
for (const size of [16, 20, 24, 32, 40, 44, 48, 64, 96, 256]) {
  render(`MenuLogo.targetsize-${size}`, size);
  render(`MenuLogo.targetsize-${size}_altform-unplated`, size);
  render(`MenuLogo.targetsize-${size}_altform-lightunplated`, size, true);
}
for (const scale of [100, 125, 150, 200, 400]) {
  render(`MenuLogo.scale-${scale}`, Math.round(44 * scale / 100));
  render(`LargeLogo.scale-${scale}`, Math.round(150 * scale / 100));
  render(`StoreLogo.scale-${scale}`, Math.round(50 * scale / 100));
}
console.log('Generated transparent package visual assets from the existing brand SVG.');
