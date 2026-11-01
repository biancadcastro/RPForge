import { createInterface } from 'node:readline';
import { validateSpawn } from './spawns.js';

export function createPrompts(input = process.stdin, output = process.stdout) {
  const readline = createInterface({ input, crlfDelay: Infinity });
  const lines = readline[Symbol.asyncIterator]();
  async function ask(question) {
    output.write(question);
    const line = await lines.next();
    return line.done ? undefined : line.value.trim();
  }
  return {
    async chooseSpawns({ archive, models }) {
      output.write(`\nArquivo: ${archive}\n`);
      const result = {};
      const reserved = new Set(models.map(model => model.toLowerCase()));
      for (const model of models) {
        let answer;
        do {
          answer = (await ask(`Quer alterar o spawn do carro "${model}"? [s/N]: `) ?? '').toLowerCase();
          if (!['', 's', 'sim', 'n', 'nao', 'não'].includes(answer)) output.write('Responda s ou n.\n');
        } while (!['', 's', 'sim', 'n', 'nao', 'não'].includes(answer));
        if (!['s', 'sim'].includes(answer)) continue;
        while (true) {
          const next = await ask(`Novo spawn para "${model}" (Enter para manter): `);
          if (!next) break;
          try {
            validateSpawn(next);
            if (next.toLowerCase() !== model.toLowerCase() && reserved.has(next.toLowerCase())) throw new Error('Esse spawn já está sendo usado por outro carro.');
            result[model] = next;
            reserved.delete(model.toLowerCase()); reserved.add(next.toLowerCase());
            break;
          } catch (error) { output.write(`${error.message}\n`); }
        }
      }
      return result;
    },
    async finish() { await ask('\nPressione Enter para fechar.'); },
    close() { readline.close(); },
  };
}
