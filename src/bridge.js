import { readFile } from 'node:fs/promises';
import { inspectFolder, convertSelected } from './preview.js';

export async function runBridge(requestPath) {
  const emit = event => process.stdout.write(JSON.stringify(event) + '\n');
  try {
    const bytes = await readFile(requestPath);
    if (bytes.length > 2 * 1024 * 1024) throw new Error('Pedido de operação muito grande.');
    const request = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    if (typeof request.folder !== 'string' || !['preview', 'convert'].includes(request.action)) throw new Error('Operação inválida.');
    const options = { archives: request.archives, onProgress: progress => emit({ type: 'progress', ...progress }) };
    const data = request.action === 'preview' ? await inspectFolder(request.folder, options) : await convertSelected(request.folder, options);
    emit({ type: 'result', data });
  } catch (error) { emit({ type: 'error', message: error.message }); process.exitCode = 1; }
}
