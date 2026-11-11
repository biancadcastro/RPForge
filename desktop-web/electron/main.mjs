import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  safeStorage,
  protocol,
  screen,
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
import {formatUserError,internalError,userError} from '../../src/user-error.js';
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
  try { return parseLaunch(args); }
  catch (error) {
    // An invalid Explorer/shortcut request still opens the app; the renderer shows the notice.
    console.error('[RPForge launch]', error);
    return { mode: 'full', action: 'preview', folder: '', notice: userError(error).message };
  }
}
// Quick tools never maximize; sizes follow the work area of the monitor in use.
function fitSize(width, height, minWidth, minHeight, display) {
  const area = display.workAreaSize;
  return {
    width: Math.max(minWidth, Math.min(width, Math.floor(area.width * 0.92))),
    height: Math.max(minHeight, Math.min(height, Math.floor(area.height * 0.92))),
  };
}
function windowSize(launch, display) {
  const quick = launch.mode === 'quick', clothing = quick && ['obj','neon','skin'].includes(launch.action);
  const min = clothing ? [740, 560] : quick ? [620, 400] : [1000, 680];
  const preferred = clothing ? launch.action === 'skin' ? [1280, 820] : [820, 720] : quick ? [720, 490] : [1280, 860];
  return { ...fitSize(...preferred, ...min, display), minWidth: min[0], minHeight: min[1] };
}
function resizeQuick(win, launch, preferred) {
  if (win.isDestroyed() || win.isMaximized()) return;
  const display = screen.getDisplayMatching(win.getBounds());
  const { minWidth, minHeight, ...size } = windowSize(launch, display);
  const target = preferred ? fitSize(preferred[0], preferred[1], Math.min(minWidth, preferred[0]), Math.min(minHeight, preferred[1]), display) : size;
  win.setSize(target.width, target.height);
}
function reportError(scope, error) {
  console.error('[RPForge ' + scope + ']', error);
  logAuth({ event: 'error', action: scope, code: typeof error?.code === 'string' ? error.code : undefined, error: error?.name });
}
// Every IPC failure is logged in full and reaches the renderer only as translated text.
function handle(channel, listener) {
  ipcMain.handle(channel, async (event, ...args) => {
    try { return await listener(event, ...args); }
    catch (error) { reportError(channel, error); throw new Error(formatUserError(error)); }
  });
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
    fetcher:(...args)=>{
      if(testMode){if(!globalThis.__forgeTestFetch)throw Error('Configure uma API isolada para o teste de autenticação.');return globalThis.__forgeTestFetch(...args);}
      return fetch(...args);
    },openExternal:url=>shell.openExternal(url),
    storage:testMode?encryptedSessionStorage(app.getPath('userData'),safeStorage):desktopAccountStorage(app.getPath('userData'),process.env.LOCALAPPDATA,safeStorage,logAuth),
    onDiagnostic:event=>{console.info('[RPForge auth]',JSON.stringify(event));logAuth(event);},
    onState:state=>{for(const context of contexts.values())if(!context.window.isDestroyed())context.window.webContents.send('forge:browser-auth',state);},
    onProfile:profile=>{profileCache=profile;profileFetchedAt=Date.now();for(const context of contexts.values())if(!context.window.isDestroyed())context.window.webContents.send('forge:profile',profile);if(!testMode)void refreshMenuAccess();},
  });
  return nativeAccount;
}
async function accountProfile(force = false) {
  // A forced read always renews against the API; quick actions and tools must never ask for one.
  if (force) profileRequests++;
  if (testMode) return typeof globalThis.__forgeTestProfile==='function'?globalThis.__forgeTestProfile():process.env.RPF_TEST_SIGNED_OUT==='1'?publicProfile(nativeAccount?.record?.profile):{ displayName: "Pessoa de teste", avatarUrl: null };
  const connected = await desktopAccount().profile();
  return connected;
}
async function refreshAccount() {
  const profile = await accountProfile(true);
  for (const context of contexts.values())
    if (!context.window.isDestroyed())
      context.window.webContents.send("forge:profile", profile);

}
async function startOAuth(context,provider){
  if(!['discord','google','github'].includes(provider))throw internalError('Provedor inválido.');
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
    throw internalError("Origem não autorizada.");
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
  if(['clothing','neon','skin-inspect','skin-split'].includes(action))await requireSession(context);
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

function launchFailed(win, error) {
  reportError('launch', error);
  if (!win.isDestroyed()) win.webContents.send('forge:progress', {phase:'error',label:userError(error).message});
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
        resizeQuick(existing, launch);
        void prepareAuthorizedLaunch(context,true).then(value => existing.webContents.send('forge:launch', value)).catch(error => launchFailed(existing, error));
      } else {context.clothingLaunchState?.reset(launch);context.clothingInitializing=false;void prepareAuthorizedLaunch(context,true).then(value=>existing.webContents.send('forge:launch',value)).catch(error => launchFailed(existing, error));}
    }
    if (launch.notice) existing.webContents.send('forge:progress', {phase:'error',label:launch.notice});
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return existing;
  }
  const quick = key === "quick";
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const size = windowSize(launch, display), area = display.workArea;
  const win = new BrowserWindow({
    ...size,
    x: area.x + Math.max(0, Math.round((area.width - size.width) / 2)),
    y: area.y + Math.max(0, Math.round((area.height - size.height) / 2)),
    maximizable: !quick,
    fullscreenable: !quick,
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
  const publishWindowState=()=>{if(!win.isDestroyed())win.webContents.send('forge:window-state',{maximized:win.isMaximized(),maximizable:win.isMaximizable()});};
  win.on('maximize',publishWindowState);win.on('unmaximize',publishWindowState);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on('will-prevent-unload',event=>{
    const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['Continuar editando','Descartar e fechar'],defaultId:0,cancelId:0,title:'Revisão não exportada',message:'Esta revisão contém alterações não exportadas.',detail:'Fechar descarta a revisão. Os arquivos originais permanecem preservados.'});
    if(choice===1)event.preventDefault();
  });
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
  context.loginRequired=['obj','neon','skin'].includes(context.launch.action)&&!await accountProfile();
  logAuth({event:'launch_ready',loggedIn:!context.loginRequired,action:context.launch.action,mode:context.launch.mode,packaged:!!process.windowsStore});
  if(context.loginRequired){
    if(!testMode)await writeMenuAccess(null).catch(()=>{});
    resizeQuick(context.window,context.launch,[1000,760]);
    return {...context.launch,loginRequired:true};
  }
  if(wasLoginRequired&&context.launch.mode==='quick')resizeQuick(context.window,context.launch);
  if(!['obj','neon','skin'].includes(context.launch.action))return context.launch;
  const prepared=await (!fresh&&context.clothingLaunchState?context.clothingLaunchState.ready():initializeClothingLaunch(context));
  const selection=context[prepared.action==='obj'?'clothing':prepared.action];
  return selection&&prepared.clothing?{...prepared,clothing:{...prepared.clothing,...selection}}:prepared;
}
handle('forge:window-control',(event,action)=>{
 const {window}=owner(event);
 if(!['state','minimize','maximize','close'].includes(action))throw internalError('Controle de janela inválido.');
 if(action==='minimize')window.minimize();
 // Quick tool windows are compact by design: maximize requests are ignored.
 if(action==='maximize'&&window.isMaximizable()){if(window.isMaximized())window.unmaximize();else window.maximize();}
 const state={maximized:window.isMaximized(),maximizable:window.isMaximizable()};if(action==='close')window.close();return state;
});
handle("forge:bootstrap", async (event) => {
 const context=owner(event);
 const value=await prepareAuthorizedLaunch(context);
 // A launch notice is shown once; later launches of this window must not repeat it.
 if(context.launch.notice){const {notice,...launch}=context.launch;context.launch=launch;}
 return value;
});
const clothingContext = (event,tool) => {
  const context = owner(event);
  if(context.loginRequired)throw Error('Entre na sua conta RPForge para usar as ferramentas.');
  if(context.clothingInitializing)throw Error('Aguarde carregar a pasta selecionada no Explorer.');
  if(tool&&context.launch.mode==='quick'&&context.launch.action!==tool)throw Error('A ferramenta mudou. Aguarde a atualização da janela.');
  if ((context.launch.mode !== 'full' && !['obj','neon','skin'].includes(context.launch.action)) || context.workflow.busy) throw Error('Aguarde a operação terminar.');
  return context;
};
handle('forge:clothing-texture', (event, texture, tool='obj') => {
  const context = clothingContext(event);
  if(!['obj','neon','skin'].includes(tool))throw internalError('Ferramenta inválida.');
  const key=tool==='obj'?'clothing':tool;
  if (typeof texture !== 'string' || !context[key+'Candidates']?.has(texture)) throw Error('Selecione uma textura sugerida ou use o seletor de arquivos.');
  context[key].texture = texture;
  return texture;
});
handle('forge:clothing-select', async (event, kind, tool='obj') => {
  const context = clothingContext(event,tool);
  if(!['obj','neon','skin'].includes(tool))throw internalError('Ferramenta inválida.');
  const key=tool==='obj'?'clothing':tool;
  if (!['model', 'texture', 'destination'].includes(kind)) throw internalError('Seleção inválida.');
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
handle('forge:clothing-neon',async(event,shown)=>{
 const context=clothingContext(event,'neon');
 verifyClothingSelection(context.neon,shown);
 context.workflow.busy=true;context.clothingBusy=true;
 try {const result=await run(context,'neon','',{...context.neon});context.outputs.add(path.resolve(result.output));return result;}
 finally{context.workflow.busy=false;context.clothingBusy=false;}
});
handle('forge:skin-inspect',async(event,shown)=>{
 const context=clothingContext(event,'skin');verifyClothingSelection(context.skin,shown);
 context.workflow.busy=true;context.clothingBusy=true;context.skinReview=null;
 try{
  const {fingerprint,...data}=await run(context,'skin-inspect','',{...context.skin});
  const id=randomUUID();context.skinReview={id,fingerprint,model:context.skin.model,texture:context.skin.texture||''};
  return {...data,reviewId:id};
 }finally{context.workflow.busy=false;context.clothingBusy=false;}
});
handle('forge:skin-split',async(event,shown,reviewId,overrides)=>{
 const context=clothingContext(event,'skin');verifyClothingSelection(context.skin,shown);
 const review=context.skinReview;
 if(!review||review.id!==reviewId||review.model!==context.skin.model||review.texture!==(context.skin.texture||''))throw Error('Refaça a análise antes de separar.');
 context.workflow.busy=true;context.clothingBusy=true;
 try{
  const result=await run(context,'skin-split','',{...context.skin,expectedSource:review.fingerprint,overrides});
  context.outputs.add(path.resolve(result.output));context.skinReview=null;return result;
 }finally{context.workflow.busy=false;context.clothingBusy=false;}
});
handle('forge:clothing-export', async (event, lod, shown) => {
  const context = clothingContext(event,'obj');
  if (!['high', 'medium', 'low', 'verylow'].includes(lod)) throw internalError('LOD inválido.');
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
handle('forge:clothing-cancel', event => {
  const context = owner(event);
  const child = context.clothingWorker;
  if (context.clothingBusy && child) {
    child.forgeCancelRequested = true;
    if (child.forgeRequestSent) child.postMessage({ cancel: true });
  }
});
handle('forge:clothing-preview', async event => {
  const context = owner(event), result = context.clothingResult;
  if (!result || !context.outputs.has(path.resolve(result.output))) throw Error('Exporte uma peça antes de abrir a prévia.');
  const objFile = result.objFile;
  if ((await stat(objFile)).size > 16 * 1024 * 1024) throw Error('OBJ exportado. Esta peça excede o limite da prévia 3D.');
  return { obj: await readFile(objFile, 'utf8'), textures:{}, groups: result.groups };
});
handle("forge:select-folder", async (event) => {
  const context = owner(event);
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
handle("forge:operation", async (event, request) => {
  const context = owner(event);
  if (
    !request ||
    !["preview", "convert", "ytyp"].includes(request.action) ||
    typeof request.folder !== "string"
  )
    throw internalError("Operação inválida.");
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
    throw internalError("Configuração inválida.");
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
handle("forge:open-folder", async (event, folder) => {
  const context = owner(event);
  const resolved = path.resolve(String(folder));
  if (!context.outputs.has(resolved))
    throw new Error("Nenhum resultado disponível nesta pasta.");
  const error = await shell.openPath(resolved);
  if (error) { const failure = new Error('Não foi possível abrir a pasta.'); failure.detail = error; throw failure; }
});
handle("forge:open-full", (event) => {
  const context = owner(event);
  if (context.workflow.busy) throw new Error("Aguarde a operação terminar.");
  if(context.launch.mode==='full'){
    context.launch={mode:'full',action:'preview',folder:''};
    context.window.webContents.send('forge:launch',context.launch);
    return;
  }
  createWindow({ ...context.launch, mode: "full" });
  context.window.close();
});
handle("forge:profile", (event) => {owner(event);return accountProfile();});
const fullAccount = (event) => {
  const context = owner(event);
  if ((context.launch.mode === "quick"&&!context.loginRequired) || context.workflow.busy)
    throw new Error("A conta fica disponível no aplicativo completo.");
  return context;
};
handle("forge:auth-options", async (event) => {
  fullAccount(event);
  return auth.options();
});
handle("forge:sign-in", async (event, input) => {
  fullAccount(event);
  const result = await desktopAccount().signIn(input?.email,input?.password);
  if (!result.mfaRequired) await refreshAccount();
  return result;
});
handle("forge:mfa", async (event, input) => {
  fullAccount(event);
  await desktopAccount().verifyMfa(input?.challengeToken,input?.code);
  await refreshAccount();
});
handle("forge:oauth", async (event, provider) => {
  const context = fullAccount(event);
  await startOAuth(context, provider);
});
handle('forge:browser-auth-state',event=>{fullAccount(event);return desktopAccount().resume();});
handle('forge:sign-out',async event=>{
  fullAccount(event);await desktopAccount().disconnect();await refreshAccount();
});
handle('forge:open-account',event=>{fullAccount(event);return shell.openExternal('https://rpforge.dev/dashboard/');});
handle('forge:app-info',event=>{fullAccount(event);return {version:app.getVersion(),development:!app.isPackaged,electron:process.versions.electron,platform:process.platform+'-'+process.arch};});
handle('forge:open-downloads',event=>{fullAccount(event);return shell.openExternal('https://rpforge.dev/docs/instalar/');});
handle('forge:license-info',async event=>{
  fullAccount(event);const account=desktopAccount(),license=await account.license();
  return {plan:license?.plan||null,validUntil:license?.exp?license.exp*1000:null,issue:license?null:account.lastLicenseIssue,installationId:account.record?.installationId||null};
});
handle('forge:cancel-browser-auth',event=>{fullAccount(event);return nativeAccount?.cancel();});
handle("forge:close", (event) => {
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
    nativeAccount?.suspend();
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
