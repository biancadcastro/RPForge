import { inspectFolder, convertSelected } from "../../src/preview.js";
import { generateFolderYtyp } from "../../src/ytyp.js";
import { exportClothingObj } from "../../src/clothing.js";
import { convertClothingNeon } from '../../src/clothing-neon.js';
import {inspectClothingSkin,separateClothingSkin} from '../../src/clothing-skin.js';

// Resolve relative to the desktop project, not a caller-controlled working directory.
// Electron utility processes expose parentPort without enabling Node in the UI.
process.parentPort.once("message", async ({ data: request }) => {
  const controller = new AbortController();
  process.parentPort.on('message', ({ data }) => {
    if (data?.cancel === true) controller.abort();
    if (data?.ack === true) process.exit(0);
  });
  try {
    const options = {
      archives: request.archives,
      onProgress: (progress) =>
        process.parentPort.postMessage({ type: "progress", progress }),
    };
    const data =
      request.action === "preview"
        ? await inspectFolder(request.folder, options)
        : request.action === "convert"
          ? await convertSelected(request.folder, options)
          : request.action === 'skin-inspect'
            ? await inspectClothingSkin({...request.archives,signal:controller.signal,onProgress:options.onProgress})
          : request.action === 'skin-split'
            ? await separateClothingSkin({...request.archives,signal:controller.signal,onProgress:options.onProgress})
          : request.action === 'neon'
            ? await convertClothingNeon({ ...request.archives, signal: controller.signal, onProgress: options.onProgress })
          : request.action === 'clothing'
            ? await exportClothingObj({ ...request.archives, signal: controller.signal, onProgress: options.onProgress })
          : request.action === "ytyp"
            ? await generateFolderYtyp(request.folder, options)
            : (() => {
                throw new Error("Operação inválida.");
              })();
    process.parentPort.postMessage({ type: "result", data });
  } catch (error) {
    process.parentPort.postMessage({ type: "error", message: error.message });
  }
  // Wait until main has received the terminal message before exiting. Exiting
  // immediately after postMessage can drop the result under scheduling pressure.
  setTimeout(() => process.exit(1), 10000);
});
