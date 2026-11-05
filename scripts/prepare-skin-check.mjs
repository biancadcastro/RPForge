// Prepare one-way triangle fingerprints from an explicitly supplied local body
// reference. Never copies body geometry or modifies the reference/acervo.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [source,destination]=process.argv.slice(2);
const data=JSON.parse(await readFile(source,'utf8'));
const fingerprint=triangle=>createHash('sha256').update(triangle.map(point=>point.map(v=>Math.round(v*10000)).join(',')).sort().join(';')).digest('hex');
const result={schema:1};for(const gender of ['male','female'])result[gender]=[...new Set(data[gender].map(fingerprint))].sort();
await writeFile(destination,JSON.stringify(result));
console.log('Prepared local body-triangle fingerprints; no source geometry copied.');
