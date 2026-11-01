import { convertFolder } from './convert.js';
import { createPrompts } from './prompts.js';

const args = process.argv.slice(2);
const interactive = args[0] === '--interactive';
if (interactive) args.shift();
const prompts = interactive ? createPrompts() : null;
if (args.length !== 1 || args[0] === '--help') {
  console.log('RPF Forge\nUso: node src/cli.js "pasta contendo .rpf"\nAceita GTA V Legacy RPF7 OPEN/NONE. Preserva os originais.');
  process.exitCode = args[0] === '--help' ? 0 : 1;
} else {
  try {
    const results = await convertFolder(args[0], { chooseSpawns: prompts?.chooseSpawns });
    for (const result of results) {
      if (result.ok) {
        console.log(`OK: ${result.archive}\nDestino: ${result.output}\nserver.cfg: ensure ${result.resource}\nModelos: ${result.models.join(', ')}`);
        if (result.skipped.length) console.log(`Arquivos auxiliares ignorados: ${result.skipped.join(', ')}`);
        if (result.removedTuning.length) console.log(`Referências de tuning ausentes removidas: ${result.removedTuning.join(', ')}`);
      }
      else console.error(`ERRO: ${result.archive}: ${result.error}`);
    }
    process.exitCode = results.some(r => !r.ok) ? 1 : 0;
  } catch (error) { console.error(`ERRO: ${error.message}`); process.exitCode = 1; }
}
if (interactive) {
  await prompts.finish();
  prompts.close();
}
