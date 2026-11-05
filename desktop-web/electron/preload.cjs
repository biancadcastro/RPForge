const { contextBridge, ipcRenderer } = require("electron");
const invoke = async (...args) => {
  try {
    return await ipcRenderer.invoke(...args);
  } catch (error) {
    throw new Error(
      error.message.replace(
        /^Error invoking remote method '[^']+': (?:Error: )?/,
        "",
      ),
    );
  }
};
contextBridge.exposeInMainWorld("rpforge", {
  windowControl:action=>invoke('forge:window-control',action),
  onWindowState:callback=>{const handler=(_event,state)=>callback(state);ipcRenderer.on('forge:window-state',handler);return()=>ipcRenderer.removeListener('forge:window-state',handler);},
  bootstrap: () => invoke("forge:bootstrap"),
  selectFolder: () => invoke("forge:select-folder"),
  selectClothingFile: (kind,tool='obj') => invoke('forge:clothing-select', kind,tool),
  selectClothingTexture: (texture,tool='obj') => invoke('forge:clothing-texture', texture,tool),
  convertClothingNeon: selection => invoke('forge:clothing-neon',selection),
  inspectClothingSkin: selection => invoke('forge:skin-inspect',selection),
  separateClothingSkin: (selection,reviewId,overrides) => invoke('forge:skin-split',selection,reviewId,overrides),
  exportClothingObj: (lod,selection) => invoke('forge:clothing-export', lod,selection),
  cancelClothingExport: () => invoke('forge:clothing-cancel'),
  clothingPreview: () => invoke('forge:clothing-preview'),
  preview: (folder, archives) =>
    invoke("forge:operation", {
      action: "preview",
      folder,
      archives,
    }),
  convert: (folder, reviewId) =>
    invoke("forge:operation", {
      action: "convert",
      folder,
      reviewId,
    }),
  ytyp: (folder) => invoke("forge:operation", { action: "ytyp", folder }),
  openFolder: (folder) => invoke("forge:open-folder", folder),
  openFull: () => invoke("forge:open-full"),
  profile: () => invoke("forge:profile"),
  signOut: () => invoke('forge:sign-out'),
  openAccount: () => invoke('forge:open-account'),
  appInfo: () => invoke('forge:app-info'),
  openDownloads: () => invoke('forge:open-downloads'),
  licenseInfo: () => invoke('forge:license-info'),
  authOptions: () => invoke("forge:auth-options"),
  signIn: (email, password) => invoke("forge:sign-in", { email, password }),
  verifyMfa: (challengeToken, code) =>
    invoke("forge:mfa", { challengeToken, code }),
  startOAuth: (provider) => invoke("forge:oauth", provider),
  onAuthChallenge: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on("forge:auth-challenge", handler);
    return () => ipcRenderer.removeListener("forge:auth-challenge", handler);
  },
  onAuthError: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on("forge:auth-error", handler);
    return () => ipcRenderer.removeListener("forge:auth-error", handler);
  },
  onProfile: (callback) => {
    const handler = (_event, profile) => callback(profile);
    ipcRenderer.on("forge:profile", handler);
    return () => ipcRenderer.removeListener("forge:profile", handler);
  },
  browserAuthState:()=>invoke('forge:browser-auth-state'),
  cancelBrowserAuth:()=>invoke('forge:cancel-browser-auth'),
  onBrowserAuth:callback=>{const handler=(_event,value)=>callback(value);ipcRenderer.on('forge:browser-auth',handler);return()=>ipcRenderer.removeListener('forge:browser-auth',handler);},
  close: () => invoke("forge:close"),
  onProgress: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on("forge:progress", handler);
    return () => ipcRenderer.removeListener("forge:progress", handler);
  },
  onLaunch: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on("forge:launch", handler);
    return () => ipcRenderer.removeListener("forge:launch", handler);
  },
});
