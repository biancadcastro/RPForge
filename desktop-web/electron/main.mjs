import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  safeStorage,
  protocol,
  shell,
  utilityProcess,
} from "electron";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import { fileURLToPath } from "node:url";
import { parseLaunch } from "./launch.mjs";
import { clothingLaunch } from './clothing-launch.mjs';
import {ClothingLaunchState,verifyClothingSelection} from './clothing-launch-state.mjs';
import { Workflow } from "./workflow.mjs";
import { publicProfile } from "./profile.mjs";
import { createAuthClient } from "./auth.mjs";
import { NativeAuth } from "./native-auth.mjs";
import { requireToolAccess } from './license.mjs';
import {createMenuAccessWriter} from './menu-access.mjs';
import { encryptedSessionStorage } from "./session-storage.mjs";
import {createAuthDiagnostics} from './auth-diagnostics.mjs';
import {desktopAccountStorage} from './account-storage.mjs';
import {desktopProfile} from './desktop-profile.mjs';
const auth = createAuthClient((...args) => net.fetch(...args));

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, ".."),
  output = path.join(project, "out");
const testMode = process.argv.includes("--test-mode");
const logAuth=testMode?()=>{}:createAuthDiagnostics(path.join(process.env.LOCALAPPDATA||os.tmpdir(),'RPForge','logs'));
const writeMenuAccess=createMenuAccessWriter({installRoot:path.dirname(project),platform:testMode?'test':process.platform});
async function refreshMenuAccess(){try{await writeMenuAccess(await desktopAccount().license());}catch{await writeMenuAccess(null).catch(()=>{});}}
let menuTimer;
function scheduleMenuAccess(){if(testMode)return;void refreshMenuAccess();if(!menuTimer){menuTimer=setInterval(()=>void refreshMenuAccess(),5*60*1000);menuTimer.unref();}}
function testClothingPath(file){
 if(!testMode||!file)return;
 const resolved=path.resolve(file);
 const roots=[os.tmpdir(),process.env.RPF_TEST_OUTPUT_ROOT].filter(Boolean).map(p=>path.resolve(p));
 if(!roots.some(root=>resolved===root||resolved.startsWith(root+path.sep)))throw Error('Teste de roupas bloqueado: use somente cópias temporárias e o destino isolado.');
}
function launchFromArgv(argv) {
  const args = argv.slice(1);
  // Development Electron keeps Chromium/inspector flags before the app entry path.
  if (!app.isPackaged) {
    const entry = args.findIndex((arg) => !arg.startsWith("--"));
    if (entry >= 0) args.splice(entry, 1);
  }
  return parseLaunch(args);
}
if (testMode && process.env.RPF_TEST_USER_DATA)
  app.setPath("userData", process.env.RPF_TEST_USER_DATA);
else if(process.platform==='win32'){
  const sharedProfile=desktopProfile(app.getPath('userData'),process.env.LOCALAPPDATA);
  app.setPath('userData',sharedProfile);app.setPath('sessionData',sharedProfile);
}
const contexts = new Map(),
  windows = new Map(),
  workers = new Set();
let nativeAccount,
  profileCache = null,
  profileFetchedAt = 0,
  profileRequests = 0;
function desktopAccount() {
  if(!nativeAccount)nativeAccount=new NativeAuth({
    fetcher:(...args)=>fetch(...args),openExternal:url=>shell.openExternal(url),
    storage:testMode?encryptedSessionStorage(app.getPath('userData'),safeStorage):desktopAccountStorage(app.getPath('userData'),process.env.LOCALAPPDATA,safeStorage,logAuth),
    onDiagnostic:event=>{console.info('[RPForge auth]',JSON.stringify(event));logAuth(event);},
    onState:state=>{for(const context of contexts.values())if(!context.window.isDestroyed())context.window.webContents.send('forge:browser-auth',state);},
    onProfile:profile=>{profileCache=profile;profileFetchedAt=Date.now();for(const context of contexts.values())if(!context.window.isDestroyed())context.window.webContents.send('forge:profile',profile);if(!testMode)void refreshMenuAccess();},
  });
  return nativeAccount;
}
async function accountProfile(force = false) {
  if (testMode) return typeof globalThis.__forgeTestProfile==='function'?globalThis.__forgeTestProfile():process.env.RPF_TEST_SIGNED_OUT==='1'?null:{ displayName: "Pessoa de teste", avatarUrl: null };
  const connected = await desktopAccount().profile();
  if(connected)return connected;
  if (!force && Date.now() - profileFetchedAt < 30000) return profileCache;
  profileFetchedAt = Date.now();
  profileRequests++;
  try {
    const response = await net.fetch("https://api.rpforge.dev/v1/me", {
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    profileCache = response.ok ? publicProfile(await response.json()) : null;
  } catch {
    profileCache = null;
  }
  return profileCache;
}
async function refreshAccount() {
  const profile = await accountProfile(true);
  for (const context of contexts.values())
    if (!context.window.isDestroyed())
      context.window.webContents.send("forge:profile", profile);

}
async function startOAuth(context,provider){
  if(!['discord','google','github'].includes(provider))throw new Error('Provedor inválido.');
  const options=await auth.options();
  if(!options.providers?.some(item=>item.provider===provider&&item.enabled))throw new Error('Este provedor não está disponível no momento.');
  await desktopAccount().begin(provider);
}
protocol.registerSchemesAsPrivileged([
  {
    scheme: "rpforge",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
const owner = (event) => {
  const context = contexts.get(event.sender.id);
  if (
    !context ||
    event.senderFrame !== event.sender.mainFrame ||
    !event.senderFrame.url.startsWith("rpforge://app/")
  )
    throw new Error("Origem não autorizada.");
  return context;
};

async function requireSession(context){
  if(!await accountProfile()){
    context.loginRequired=true;context.window.webContents.send('forge:profile',null);
    if(!testMode)await writeMenuAccess(null).catch(()=>{});
    throw new Error('Entre na sua conta RPForge para usar as ferramentas.');
  }
}
async function run(context, action, folder, archives) {
  await requireSession(context);
  await requireToolAccess(action, desktopAccount(),license=>writeMenuAccess(license).catch(()=>{}));
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(here, "worker.mjs"), [], {
      serviceName: "RPForge — processamento",
      stdio: "pipe",
    });
    workers.add(child);
    if (['clothing','neon','skin-inspect','skin-split'].includes(action)) context.clothingWorker = child;
    let result, failure;
    child.on("message", (message) => {
      if (message.type === "progress" && !context.window.isDestroyed())
        context.window.webContents.send("forge:progress", message.progress);
      if (message.type === "result") { result = message.data; child.postMessage({ ack: true }); }
      if (message.type === "error") { failure = message.message; child.postMessage({ ack: true }); }
    });
    child.on("exit", (code) => {
      workers.delete(child);
      if (context.clothingWorker === child) context.clothingWorker = null;
      if (failure || code !== 0 || result === undefined)
        reject(
          new Error(
            failure ||
              "O processamento foi interrompido. Analise os arquivos novamente.",
          ),
        );
      else resolve(result);
      setImmediate(()=>{
        if(context.queuedLaunch&&!context.window.isDestroyed()&&!context.workflow.busy){const next=context.queuedLaunch;context.queuedLaunch=null;createWindow(next);}
      });
    });
    child.once("spawn", () => {
      child.postMessage({ action, folder, archives });
      child.forgeRequestSent = true;
      if (child.forgeCancelRequested) child.postMessage({ cancel: true });
    });
  });
}

function createWindow(launch) {
  if(launch.mode==='full'||['obj','neon','skin'].includes(launch.action))scheduleMenuAccess();
  const key = launch.mode === "quick" ? "quick" : "full";
  const existing = windows.get(key);
  if (existing && !existing.isDestroyed()) {
    const context = contexts.get(existing.webContents.id);
    if(context.workflow.busy&&launch.folder){context.queuedLaunch=structuredClone(launch);existing.webContents.send('forge:progress',{phase:'busy',label:'A nova pasta será carregada quando a operação atual terminar.'});}
    if (!context.workflow.busy && launch.folder) {
      context.launch = launch;
      context.allowed.add(path.resolve(launch.folder));
      if (['obj','neon','skin'].includes(launch.action)) {
        if(!existing.isMaximized())existing.setSize(launch.action==='skin'?1440:820,launch.action==='skin'?900:720);
        void prepareAuthorizedLaunch(context,true).then(value => existing.webContents.send('forge:launch', value)).catch(error => existing.webContents.send('forge:progress', {phase:'error',label:error.message}));
      } else {context.clothingLaunchState?.reset(launch);context.clothingInitializing=false;void prepareAuthorizedLaunch(context,true).then(value=>existing.webContents.send('forge:launch',value));}
    }
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return existing;
  }
  const quick = key === "quick";
  const quickObj = quick && ['obj','neon','skin'].includes(launch.action);
  const win = new BrowserWindow({
    width: quickObj ? launch.action==='skin'?1440:820 : quick ? 720 : 1280,
    height: quickObj ? launch.action==='skin'?900:720 : quick ? 490 : 860,
    minWidth: quickObj ? 740 : quick ? 620 : 1000,
    minHeight: quickObj ? 560 : quick ? 400 : 680,
    show: false,
    backgroundColor: "#121218",
    title: quick ? "RPForge — ação rápida" : "RPForge",
    icon: path.join(project, "public/rpforge.ico"),
    autoHideMenuBar: true,
    frame:false,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: testMode,
      backgroundThrottling: false,
      offscreen: testMode,
    },
  });
  const context = {
    window: win,
    launch,
    allowed: new Set(launch.folder ? [path.resolve(launch.folder)] : []),
    outputs: new Set(),
  };
  context.workflow = new Workflow((...args) => run(context, ...args));
  const contentsId = win.webContents.id;
  contexts.set(contentsId, context);
  windows.set(key, win);
  win.removeMenu();
  const publishWindowState=()=>{if(!win.isDestroyed())win.webContents.send('forge:window-state',{maximized:win.isMaximized()});};
  win.on('maximize',publishWindowState);win.on('unmaximize',publishWindowState);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  win.on("close", (event) => {
    if (context.workflow.busy || context.clothingWorker) {
      event.preventDefault();
      win.webContents.send("forge:progress", {
        phase: "busy",
        label: "Aguarde a operação terminar antes de fechar.",
      });
    }
  });
  win.on("closed", () => {
    contexts.delete(contentsId);
    windows.delete(key);
  });
  win.once("ready-to-show", () => {
    if (!testMode) win.show();
  });
  win.loadURL("rpforge://app/");
  return win;
}

async function initializeClothingLaunch(context) {
  if (!['obj','neon','skin'].includes(context.launch.action)) return context.launch;
  context.clothingLaunchState ??= new ClothingLaunchState(async folder=>{testClothingPath(folder);return clothingLaunch(folder);});
  const requestedKey=context.launch.action==='obj'?'clothing':context.launch.action;
  context[requestedKey]=null;
  if(requestedKey==='skin')context.skinReview=null;
  context.clothingInitializing=true;
  try{
  let prepared=await context.clothingLaunchState.request(context.launch);
  while(prepared.requestId!==context.clothingLaunchState.revision)prepared=await context.clothingLaunchState.ready();
  if(!['obj','neon','skin'].includes(prepared.action)){context.launch=prepared;return prepared;}
  const selected=prepared.clothing;
  const key=prepared.action==='obj'?'clothing':prepared.action;
  context[key] = { model: selected.model, texture: selected.texture, destination: selected.destination };
  context[key+'Candidates'] = new Set(selected.candidates);
  context[key+'Directory'] = selected.directory || path.dirname(selected.model);
  context.launch = prepared;
  return context.launch;
  }finally{if(!context.clothingLaunchState.loading)context.clothingInitializing=false;}
}
async function prepareAuthorizedLaunch(context,fresh=false){
  const wasLoginRequired=context.loginRequired;
  context.loginRequired=!await accountProfile();
  logAuth({event:'launch_ready',loggedIn:!context.loginRequired,action:context.launch.action,mode:context.launch.mode,packaged:!!process.windowsStore});
  if(context.loginRequired){
    if(!testMode)await writeMenuAccess(null).catch(()=>{});
    if(!context.window.isMaximized())context.window.setSize(1000,760);
    return {...context.launch,loginRequired:true};
  }
  if(wasLoginRequired&&context.launch.mode==='quick'&&!context.window.isMaximized()){
    const clothing=['obj','neon','skin'].includes(context.launch.action);context.window.setSize(clothing?context.launch.action==='skin'?1440:820:720,clothing?context.launch.action==='skin'?900:720:490);
  }
  if(!['obj','neon','skin'].includes(context.launch.action))return context.launch;
  const prepared=await (!fresh&&context.clothingLaunchState?context.clothingLaunchState.ready():initializeClothingLaunch(context));
  const selection=context[prepared.action==='obj'?'clothing':prepared.action];
  return selection&&prepared.clothing?{...prepared,clothing:{...prepared.clothing,...selection}}:prepared;
}
ipcMain.handle('forge:window-control',(event,action)=>{
 const {window}=owner(event);
 if(!['state','minimize','maximize','close'].includes(action))throw Error('Controle de janela inválido.');
 if(action==='minimize')window.minimize();
 if(action==='maximize'){if(window.isMaximized())window.unmaximize();else window.maximize();}
 const state={maximized:window.isMaximized()};if(action==='close')window.close();return state;
});
ipcMain.handle("forge:bootstrap", async (event) => {
 const context=owner(event);
 return prepareAuthorizedLaunch(context);
});
const clothingContext = (event,tool) => {
  const context = owner(event);
  if(context.loginRequired)throw Error('Entre na sua conta RPForge para usar as ferramentas.');
  if(context.clothingInitializing)throw Error('Aguarde carregar a pasta selecionada no Explorer.');
  if(tool&&context.launch.mode==='quick'&&context.launch.action!==tool)throw Error('A ferramenta mudou. Aguarde a atualização da janela.');
  if ((context.launch.mode !== 'full' && !['obj','neon','skin'].includes(context.launch.action)) || context.workflow.busy) throw Error('Aguarde a operação terminar.');
  return context;
};
ipcMain.handle('forge:clothing-texture', (event, texture, tool='obj') => {
  const context = clothingContext(event);
  if(!['obj','neon','skin'].includes(tool))throw Error('Ferramenta inválida.');
  const key=tool==='obj'?'clothing':tool;
  if (typeof texture !== 'string' || !context[key+'Candidates']?.has(texture)) throw Error('Selecione uma textura sugerida ou use o seletor de arquivos.');
  context[key].texture = texture;
  return texture;
});
ipcMain.handle('forge:clothing-select', async (event, kind, tool='obj') => {
  const context = clothingContext(event,tool);
  if(!['obj','neon','skin'].includes(tool))throw Error('Ferramenta inválida.');
  const key=tool==='obj'?'clothing':tool;
  if (!['model', 'texture', 'destination'].includes(kind)) throw Error('Seleção inválida.');
  const directory = kind === 'destination';
  const launchAtSelection=context.launch;
  const selection = await dialog.showOpenDialog(context.window, {
    ...(context[key+'Directory'] ? {defaultPath:context[key+'Directory']} : {}),
    title: directory ? 'Pasta para o pacote OBJ' : kind === 'model' ? 'Selecione a peça YDD' : 'Selecione o YTD correspondente',
    properties: [directory ? 'openDirectory' : 'openFile'],
    ...(directory ? {} : { filters: [{ name: kind === 'model' ? 'Roupa GTA V' : 'Texturas GTA V', extensions: [kind === 'model' ? 'ydd' : 'ytd'] }] }),
  });
  if (selection.canceled || !selection.filePaths.length) return null;
  if(context.launch!==launchAtSelection)throw Error('A pasta mudou enquanto o seletor estava aberto. Confira a nova origem e selecione novamente.');
  testClothingPath(selection.filePaths[0]);
  context[key] ??= {};
  if (kind === 'model') { delete context[key].texture; context[key+'Candidates'] = new Set(); }
  if(tool==='skin'&&kind!=='destination')context.skinReview=null;
  context[key][kind] = path.resolve(selection.filePaths[0]);
  return context[key][kind];
});
ipcMain.handle('forge:clothing-neon',async(event,shown)=>{
 const context=clothingContext(event,'neon');
 verifyClothingSelection(context.neon,shown);
 context.workflow.busy=true;context.clothingBusy=true;
 try {const result=await run(context,'neon','',{...context.neon});context.outputs.add(path.resolve(result.output));return result;}
 finally{context.workflow.busy=false;context.clothingBusy=false;}
});
ipcMain.handle('forge:skin-inspect',async(event,shown)=>{
 const context=clothingContext(event,'skin');verifyClothingSelection(context.skin,shown);
 context.workflow.busy=true;context.clothingBusy=true;context.skinReview=null;
 try{
  const {fingerprint,...data}=await run(context,'skin-inspect','',{...context.skin});
  const id=randomUUID();context.skinReview={id,fingerprint,model:context.skin.model,texture:context.skin.texture||''};
  return {...data,reviewId:id};
 }finally{context.workflow.busy=false;context.clothingBusy=false;}
});
ipcMain.handle('forge:skin-split',async(event,shown,reviewId,overrides)=>{
 const context=clothingContext(event,'skin');verifyClothingSelection(context.skin,shown);
 const review=context.skinReview;
 if(!review||review.id!==reviewId||review.model!==context.skin.model||review.texture!==(context.skin.texture||''))throw Error('Refaça a análise antes de separar.');
 context.workflow.busy=true;context.clothingBusy=true;
 try{
  const result=await run(context,'skin-split','',{...context.skin,expectedSource:review.fingerprint,overrides});
  context.outputs.add(path.resolve(result.output));context.skinReview=null;return result;
 }finally{context.workflow.busy=false;context.clothingBusy=false;}
});
ipcMain.handle('forge:clothing-export', async (event, lod, shown) => {
  const context = clothingContext(event,'obj');
  if (!['high', 'medium', 'low', 'verylow'].includes(lod)) throw Error('LOD inválido.');
  verifyClothingSelection(context.clothing,shown);
  context.workflow.busy = true;
  context.clothingBusy = true;
  try {
    const result = await run(context, 'clothing', '', { ...context.clothing, lod });
    context.outputs.add(path.resolve(result.output));
    context.clothingResult = result;
    return result;
  } finally { context.workflow.busy = false; context.clothingBusy = false; }
});
ipcMain.handle('forge:clothing-cancel', event => {
  const context = owner(event);
  const child = context.clothingWorker;
  if (context.clothingBusy && child) {
    child.forgeCancelRequested = true;
    if (child.forgeRequestSent) child.postMessage({ cancel: true });
  }
});
ipcMain.handle('forge:clothing-preview', async event => {
  const context = owner(event), result = context.clothingResult;
  if (!result || !context.outputs.has(path.resolve(result.output))) throw Error('Exporte uma peça antes de abrir a prévia.');
  const objFile = result.objFile;
  if ((await stat(objFile)).size > 16 * 1024 * 1024) throw Error('OBJ exportado. Esta peça excede o limite da prévia 3D.');
  return { obj: await readFile(objFile, 'utf8'), textures:{}, groups: result.groups };
});
ipcMain.handle("forge:select-folder", async (event) => {
  const context = owner(event);
  await requireSession(context);
  if (context.workflow.busy) throw new Error("Aguarde a operação terminar.");
  const selected = await dialog.showOpenDialog(context.window, {
    title: "Selecione a pasta de origem",
    properties: ["openDirectory"],
  });
  if (selected.canceled || !selected.filePaths.length) return null;
  const folder = path.resolve(selected.filePaths[0]);
  context.allowed.add(folder);
  context.launch = { ...context.launch, folder };
  return folder;
});
ipcMain.handle("forge:operation", async (event, request) => {
  const context = owner(event);
  await requireSession(context);
  if (
    !request ||
    !["preview", "convert", "ytyp"].includes(request.action) ||
    typeof request.folder !== "string"
  )
    throw new Error("Operação inválida.");
  const folder = path.resolve(request.folder);
  if (!context.allowed.has(folder))
    throw new Error("Selecione a pasta no aplicativo antes de continuar.");
  context.launch = {
    ...context.launch,
    folder,
    action: request.action === "ytyp" ? "ytyp" : "preview",
  };
  if (
    request.archives !== undefined &&
    (!request.archives ||
      Array.isArray(request.archives) ||
      typeof request.archives !== "object")
  )
    throw new Error("Configuração inválida.");
  const response = await context.workflow.execute(
    request.action,
    folder,
    request.archives ?? {},
    request.reviewId,
  );
  if (request.action !== "preview")
    for (const result of response.data)
      if (result.ok && result.output)
        context.outputs.add(path.resolve(result.output));
  return response;
});
ipcMain.handle("forge:open-folder", async (event, folder) => {
  const context = owner(event);
  const resolved = path.resolve(String(folder));
  if (!context.outputs.has(resolved))
    throw new Error("Nenhum resultado disponível nesta pasta.");
  const error = await shell.openPath(resolved);
  if (error) throw new Error(error);
});
ipcMain.handle("forge:open-full", (event) => {
  const context = owner(event);
  if (context.workflow.busy) throw new Error("Aguarde a operação terminar.");
  createWindow({ ...context.launch, mode: "full" });
  context.window.close();
});
ipcMain.handle("forge:profile", (event) => {owner(event);return accountProfile();});
const fullAccount = (event) => {
  const context = owner(event);
  if ((context.launch.mode === "quick"&&!context.loginRequired) || context.workflow.busy)
    throw new Error("A conta fica disponível no aplicativo completo.");
  return context;
};
ipcMain.handle("forge:auth-options", async (event) => {
  fullAccount(event);
  return auth.options();
});
ipcMain.handle("forge:sign-in", async (event, input) => {
  fullAccount(event);
  const result = await auth.login(input);
  if (!result.mfaRequired) await refreshAccount();
  return result;
});
ipcMain.handle("forge:mfa", async (event, input) => {
  fullAccount(event);
  await auth.verify(input);
  await refreshAccount();
});
ipcMain.handle("forge:oauth", async (event, provider) => {
  const context = fullAccount(event);
  await startOAuth(context, provider);
});
ipcMain.handle('forge:browser-auth-state',event=>{fullAccount(event);return nativeAccount?.state||{status:'idle'};});
ipcMain.handle('forge:cancel-browser-auth',event=>{fullAccount(event);nativeAccount?.cancel();});
ipcMain.handle("forge:close", (event) => {
  const context = owner(event);
  if (!context.workflow.busy) context.window.close();
});

const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on("second-instance", (_event, argv) =>
    createWindow(launchFromArgv(argv)),
  );
  app.whenReady().then(() => {
    protocol.handle("rpforge", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.host !== "app" || !["GET", "HEAD"].includes(request.method))
          return new Response("", { status: 403 });
        const requested = decodeURIComponent(url.pathname);
        let file = path.resolve(output, "." + requested);
        if (file !== output && !file.startsWith(output + path.sep))
          return new Response("", { status: 403 });
        if ((await stat(file)).isDirectory())
          file = path.join(file, "index.html");
        const mime =
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".png": "image/png",
            ".ico": "image/x-icon",
            ".ttf": "font/ttf",
            ".txt": "text/plain",
            ".json": "application/json",
          }[path.extname(file)] || "application/octet-stream";
        return new Response(
          request.method === "HEAD" ? null : await readFile(file),
          {
            headers: {
              "Content-Type": mime,
              "Content-Security-Policy":
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.discordapp.com https://avatars.githubusercontent.com https://lh3.googleusercontent.com; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'",
            },
          },
        );
      } catch {
        return new Response("Arquivo não encontrado.", { status: 404 });
      }
    });
    createWindow(launchFromArgv(process.argv));
  });
  app.on("window-all-closed", () => {
    nativeAccount?.cancel();
    if (!workers.size) app.quit();
  });
  app.on("before-quit", (event) => {
    if (workers.size) event.preventDefault();
  });
}
// Read-only diagnostics for automated development checks; never exposed to the renderer.
if (testMode)
  globalThis.__forgeDiagnostics = () => ({
    workers: workers.size,
    profileRequests,
    windows: BrowserWindow.getAllWindows().length,
  });
