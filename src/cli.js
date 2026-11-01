import { convertFolder } from './convert.js';
import { createPrompts } from './prompts.js';
import { runBridge } from './bridge.js';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--bridge') {
  await runBridge(args[1]);
} else {
const interactive = args[0] === '--interactive';
if (interactive) args.shift();
const gui = fileURLToPath(new URL('../RPFForge.exe', import.meta.url));
if (interactive && process.platform === 'win32' && existsSync(gui) && process.env.RPF_FORGE_CONSOLE !== '1') {
  const child = spawn(gui, args, { detached: true, stdio: 'ignore', windowsHide: false, cwd: path.dirname(gui) });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.unref();
} else {
const prompts = interactive ? createPrompts() : null;
if (args.length !== 1 || args[0] === '--help') {
  console.log('RPF Forge\nUso: node src/cli.js "pasta contendo .rpf"\nAceita GTA V Legacy RPF7 OPEN/NONE. Preserva os originais.');
  process.exitCode = args[0] === '--help' ? 0 : 1;
} else {
  try {
    const results = await convertFolder(args[0], { chooseSpawns: prompts?.chooseSpawns, chooseOutput: prompts?.chooseOutput });
    for (const result of results) {
      if (result.ok) {
        console.log(`OK: ${result.archive}\nDestino: ${result.output}\nserver.cfg: ensure ${result.resource}\nModelos: ${result.models.join(', ')}`);
        if (result.skipped.length) console.log(`Arquivos auxiliares ignorados: ${result.skipped.join(', ')}`);
        if (result.removedTuning.length) console.log(`Referências de tuning ausentes removidas: ${result.removedTuning.join(', ')}`);
        console.log(`Validação final: aprovada (${result.audit.warnings} avisos).`);
        for (const issue of result.audit.issues) console.log(`AVISO: ${issue.message}`);
        if (result.backup) console.log(`Backup preservado: ${result.backup}`);
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
}
}
