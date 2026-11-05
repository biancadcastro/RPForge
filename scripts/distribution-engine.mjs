import {readFile,writeFile,mkdir,copyFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const engineNames=['ClothingDecoder.exe','ClothingNeon.exe','ClothingSkin.exe','CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll','texconv.exe','neon-shader.xml','skin-triangles.json'];
const notices=['CodeWalker-NOTICE.txt','DirectXTex-LICENSE.txt'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function distributionEngine(source,destination){
 const manifest=JSON.parse((await readFile(path.join(source,'manifest.json'),'utf8')).replace(/^\uFEFF/,''));
 const files=[];
 // Validate the complete allowlist before creating any output; never copy caches,
 // game assets or arbitrary paths supplied by the development manifest.
 for(const name of [...engineNames,...notices]){
  const file=path.join(source,name),info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink())throw Error('Componente deve ser arquivo regular: '+name);
  const bytes=await readFile(file),sha256=hash(bytes);
  if(engineNames.includes(name)&&manifest.files?.find(record=>record.name===name)?.sha256!==sha256)throw Error('Componente alterado: '+name);
  files.push({name,sha256});
 }
 await mkdir(destination,{recursive:false});
 for(const {name} of files)await copyFile(path.join(source,name),path.join(destination,name));
 for(const {name,sha256} of files)if(hash(await readFile(path.join(destination,name)))!==sha256)throw Error('Copia invalida: '+name);
 await writeFile(path.join(destination,'manifest.json'),JSON.stringify({schema:1,developmentOnly:false,files},null,2));
 return files;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [source,destination]=process.argv.slice(2);if(!source||!destination)throw Error('Informe motor e destino novo.');
 console.log(`PASS: ${(await distributionEngine(source,destination)).length} componentes verificados para distribuicao.`);
}
