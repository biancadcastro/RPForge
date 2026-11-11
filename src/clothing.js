import { readFile, writeFile, lstat, stat, mkdir, mkdtemp, readdir, rm, link, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {publication,recoverPublications} from './publication.js';
import { isRsc7 } from './rsc7.js';
import { engineError, internalError } from './user-error.js';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const lods = ['high', 'medium', 'low', 'verylow'];
const number = value => Object.is(value, -0) ? '0' : String(value);

export function validateGeometry(data) {
  if (!data || !Array.isArray(data.meshes) || !data.meshes.length || data.meshes.length > 4096 || !Array.isArray(data.textures)) throw Error('Geometria de roupa inválida.');
  const textures = new Map();
  for (const texture of data.textures) {
    if (!/^texture_\d{3,4}$/.test(texture.id) || textures.has(texture.id) || !Number.isInteger(texture.width) || !Number.isInteger(texture.height) || texture.width < 1 || texture.height < 1 || texture.width > 16384 || texture.height > 16384) throw Error('Mapa de textura inválido.');
    textures.set(texture.id, texture);
  }
  let vertices = 0, triangles = 0;
  for (const mesh of data.meshes) {
    const { positions: p, normals: n, uv, indices } = mesh;
    if (!Array.isArray(p) || !p.length || p.length % 3 || !Array.isArray(n) || n.length !== p.length || !Array.isArray(uv) || uv.length !== p.length / 3 * 2 || !Array.isArray(indices) || !indices.length || indices.length % 3 || !textures.has(mesh.texture)) throw Error('Malha sem posições, normais, UVs ou material válidos.');
    if ([p, n, uv].some(values => values.some(v => !Number.isFinite(v) || Math.abs(v) > 1e8)) || indices.some(i => !Number.isInteger(i) || i < 0 || i >= p.length / 3)) throw Error('Índice ou coordenada inválida na malha.');
    for (let i = 0; i < n.length; i += 3) if (Math.hypot(n[i], n[i + 1], n[i + 2]) < 1e-6) throw Error('Normal ausente ou nula.');
    vertices += p.length / 3; triangles += indices.length / 3;
    if (vertices > 1e6 || triangles > 2e6) throw Error('Peça excede o limite de geometria.');
  }
  return { vertices, triangles, meshes: data.meshes.length, materials: data.meshes.length };
}

export function buildObjPackage(data) {
  const counts = validateGeometry(data);
  const obj = ['# RPForge: LOD selecionado, bind pose, eixos GTA Z-up, escala original', '# UV V = 1 - GTA V; OBJ para texturizacao, sem rig', 'mtllib modelo.mtl'];
  const mtl = ['# RPForge: materiais difusos; shaders GTA permanecem no YDD original'];
  let offset = 1;
  for (const [index, mesh] of data.meshes.entries()) {
    obj.push(`o mesh_${index}`, `usemtl material_${index}`);
    for (let i = 0; i < mesh.positions.length; i += 3) obj.push('v ' + mesh.positions.slice(i, i + 3).map(number).join(' '));
    for (let i = 0; i < mesh.uv.length; i += 2) obj.push('vt ' + mesh.uv.slice(i, i + 2).map(number).join(' '));
    for (let i = 0; i < mesh.normals.length; i += 3) obj.push('vn ' + mesh.normals.slice(i, i + 3).map(number).join(' '));
    for (let i = 0; i < mesh.indices.length; i += 3) obj.push('f ' + mesh.indices.slice(i, i + 3).map(v => `${v + offset}/${v + offset}/${v + offset}`).join(' '));
    offset += mesh.positions.length / 3;
  }
  for (const [index] of data.meshes.entries()) mtl.push(`newmtl material_${index}`, 'Kd 1 1 1', 'd 1', 'illum 2', '');
  return { obj: obj.join('\n') + '\n', mtl: mtl.join('\n') + '\n', counts };
}

export async function inputFile(file, extension, version) {
  if (typeof file !== 'string' || path.extname(file).toLowerCase() !== extension) throw Error(`Selecione um arquivo ${extension}.`);
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024 * 1024) throw Error('Arquivo inválido, link ou acima de 128 MiB.');
  const bytes = await readFile(file);
  if (!isRsc7(bytes, version)) throw Error('Somente recursos GTA V Legacy RSC7 são suportados nesta etapa.');
  return { file, name: path.basename(file), sha256: digest(bytes) };
}

export async function engineFiles(additional = []) {
  const installed = path.join(root, 'engines/clothing');
  const directory = await stat(installed).then(() => installed, () => path.join(root, '.tools/clothing-engine'));
  let manifest;
  try { manifest = JSON.parse((await readFile(path.join(directory, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, '')); }
  catch { throw Error('Componentes das ferramentas de roupas ausentes ou alterados. Reinstale o RPForge.'); }
  for (const name of ['ClothingDecoder.exe', 'CodeWalker.Core.dll', 'SharpDX.Mathematics.dll', ...additional]) {
    const record = manifest.files?.find(item => item.name === name);
    if (!record || digest(await readFile(path.join(directory, name))) !== record.sha256) throw Error('Componentes das ferramentas de roupas ausentes ou alterados. Reinstale o RPForge.');
  }
  return directory;
}

export async function exportClothingObj({ model, texture = '', destination, lod = 'high', signal, onProgress = () => {} }) {
  if (!lods.includes(lod)) throw internalError('LOD inválido.');
  const started = performance.now();
  const inputs = [await inputFile(model, '.ydd', 165)];
  if (texture) inputs.push(await inputFile(texture, '.ytd', 13));
  const dest = path.resolve(destination), info = await lstat(dest);
  if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Escolha uma pasta de destino real.');
  await recoverPublications(dest);
  const engine = await engineFiles();
  const stage = await mkdtemp(path.join(dest, '.rpforge-obj-'));
  const published = [];
  let output,journal;
  try {
    onProgress({ phase: 'read', label: 'Lendo malha, UVs e materiais…' });
    await execute(path.join(engine, 'ClothingDecoder.exe'), [model, texture, stage, lod], { windowsHide: true, timeout: 60000, signal, maxBuffer: 1024 * 1024, encoding: 'utf8' }).catch(error => { throw engineError(error, 'Não foi possível ler esta peça.', 'Exportação cancelada.'); });
    if ((await stat(path.join(stage, 'decoded.json'))).size > 128 * 1024 * 1024) throw Error('Geometria decodificada excede o limite.');
    const data = JSON.parse(await readFile(path.join(stage, 'decoded.json'), 'utf8'));
    const files = buildObjPackage(data);
    onProgress({ phase: 'write', label: 'Salvando OBJ e MTL…' });
    await writeFile(path.join(stage, 'modelo.mtl'), files.mtl);
    for (const input of inputs) if (digest(await readFile(input.file)) !== input.sha256) throw Error('A origem mudou durante a leitura. Nenhum resultado foi publicado.');
    signal?.throwIfAborted();
    const report = { schema: 1, tool: 'RPForge clothing OBJ', lod, ...files.counts, axes: data.axes, uvConvention: data.uvConvention, textures: data.textures, groups: data.meshes.map((m, i) => ({ name: `mesh_${i}`, material: `material_${i}`, texture: m.texture, shader: m.shader })), sources: inputs.map(({ name, sha256 }) => ({ name, sha256 })), elapsedMs: Math.round(performance.now() - started), notes: ['OBJ em bind pose, sem pesos ou esqueleto.', 'Exportação difusa: shaders GTA, normal e specular permanecem no original.', 'UVs fora de 0–1 são preservados; o guia mostra o tile principal.'] };
    const stem = path.basename(model, path.extname(model)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    for (let suffix = 0; ; suffix++) {
      const name = stem + (suffix ? '_' + (suffix + 1) : '');
      const objFile=path.join(dest,name+'.obj'),mtlFile=path.join(dest,name+'.mtl');
      await writeFile(path.join(stage,'modelo.obj'),files.obj.replace('mtllib modelo.mtl',`mtllib ${name}.mtl`));
      signal?.throwIfAborted();
      journal=await publication(dest,stage,[{source:path.join(stage,'modelo.obj'),target:objFile},{source:path.join(stage,'modelo.mtl'),target:mtlFile}]);
      try {
        for(const [source,target] of [['modelo.obj',objFile],['modelo.mtl',mtlFile]]){
          await link(path.join(stage,source),target);published.push({target,identity:await lstat(target)});
        }
        await journal.commit();journal=null;
        return {output:dest,objFile,mtlFile,...report,files:[path.basename(objFile),path.basename(mtlFile)]};
      } catch(error) {
        if(error.code!=='EEXIST')throw error;
        for(const {target,identity} of published.splice(0)){const current=await lstat(target).catch(()=>null);if(current?.ino===identity.ino&&current?.dev===identity.dev)await unlink(target);}
        await journal.abort();journal=null;
      }
    }
  } catch (error) {
    for (const { target, identity } of published.reverse()) {
      const current = await lstat(target).catch(() => null);
      if (current?.ino === identity.ino && current?.dev === identity.dev) await unlink(target);
    }
    if(journal){await journal.abort();journal=null;}
    throw error;
  } finally { if(!journal)await rm(stage, { recursive: true, force: true }); }
}
