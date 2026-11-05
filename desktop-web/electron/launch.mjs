import path from "node:path";
export function parseLaunch(args) {
  for(const flag of ['--skin','--skin-folder']){const at=args.indexOf(flag);if(at>=0){if(!args[at+1]||(flag==='--skin'&&path.extname(args[at+1]).toLowerCase()!=='.ydd'))throw Error('Selecione uma peça YDD para separar a pele.');return {mode:'quick',action:'skin',folder:path.resolve(args[at+1])};}}
  for(const flag of ['--neon','--neon-folder']){const at=args.indexOf(flag);if(at>=0){if(!args[at+1]||(flag==='--neon'&&path.extname(args[at+1]).toLowerCase()!=='.ydd'))throw Error('Selecione uma roupa YDD.');return {mode:'quick',action:'neon',folder:path.resolve(args[at+1])};}}
  const objFolder=args.indexOf('--obj-folder');
  if(objFolder>=0){if(!args[objFolder+1])throw Error('Selecione uma pasta.');return {mode:'quick',action:'obj',folder:path.resolve(args[objFolder+1])};}
  const obj = args.indexOf('--obj');
  if (obj >= 0) {
    if (!args[obj + 1] || path.extname(args[obj + 1]).toLowerCase() !== '.ydd') throw Error('Selecione uma peça YDD para exportar.');
    return { mode: 'quick', action: 'obj', folder: path.resolve(args[obj + 1]) };
  }
  const ytyp = args.indexOf("--ytyp"),
    configure = args.indexOf("--configure");
  if (ytyp >= 0 && args[ytyp + 1])
    return {
      mode: "quick",
      action: "ytyp",
      folder: path.resolve(args[ytyp + 1]),
    };
  if (configure >= 0 && args[configure + 1])
    return {
      mode: "full",
      action: "preview",
      folder: path.resolve(args[configure + 1]),
    };
  const folder = args.find((arg) => !arg.startsWith("--"));
  return folder
    ? { mode: "quick", action: "preview", folder: path.resolve(folder) }
    : { mode: "full", action: "preview", folder: "" };
}
