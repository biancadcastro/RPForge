import { convertFolder } from './convert.js';

const args = process.argv.slice(2);
const interactive = args[0] === '--interactive';
if (interactive) args.shift();
if (args.length !== 1 || args[0] === '--help') {
  console.log('RPF Forge\nUso: node src/cli.js "pasta contendo .rpf"\nAceita GTA V Legacy RPF7 OPEN/NONE. Preserva os originais.');
  process.exitCode = args[0] === '--help' ? 0 : 1;
} else {
  try {
    const results = await convertFolder(args[0]);
    for (const result of results) {
      if (result.ok) console.log(`OK: ${result.archive}\nDestino: ${result.output}\nserver.cfg: ensure ${result.resource}\nModelos: ${result.models.join(', ')}`);
      else console.error(`ERRO: ${result.archive}: ${result.error}`);
    }
    process.exitCode = results.some(r => !r.ok) ? 1 : 0;
  } catch (error) { console.error(`ERRO: ${error.message}`); process.exitCode = 1; }
}
if (interactive) {
  console.log('\nPressione Enter para fechar.');
  process.stdin.resume();
  await new Promise(resolve => process.stdin.once('data', resolve));
  process.stdin.pause();
}
