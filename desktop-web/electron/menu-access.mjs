import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {mkdir,writeFile,rename,unlink} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
const execute=promisify(execFile),bits={'clothing.obj':1,'clothing.neon':2,'clothing.skin':4};
export function menuAccess(license,now=Date.now()){
 if(license?.plan!=='pro'||!Number.isFinite(license.exp)||license.exp*1000<=now||license.exp*1000>now+72*3600000||!Array.isArray(license.capabilities))return{mask:0,expires:0};
 return{mask:license.capabilities.reduce((n,c)=>n|(bits[c]||0),0),expires:Math.floor(license.exp)};
}
export function createMenuAccessWriter({installRoot,platform=process.platform,run=execute,writeCache}={}){
 let previous='',queue=Promise.resolve();const root=path.resolve(installRoot),quoted=root.replace(/'/g,"''");
 return license=>{const state=menuAccess(license),identity=JSON.stringify(state);queue=queue.catch(()=>{}).then(async()=>{
  if(platform!=='win32'||previous===identity)return state;
  if(writeCache)await writeCache(state);else{
   const directory=path.join(process.env.LOCALAPPDATA,'RPForge'),file=path.join(directory,'menu-access.bin'),temporary=file+'.'+randomUUID()+'.tmp',header=Buffer.alloc(16);header.writeUInt32LE(1,0);header.writeUInt32LE(state.mask,4);header.writeBigUInt64LE(BigInt(state.expires),8);await mkdir(directory,{recursive:true});
   try{await writeFile(temporary,Buffer.concat([header,Buffer.from(root+'\0','utf16le')]));await rename(temporary,file);}finally{await unlink(temporary).catch(()=>{});}
  }
  const script=`$ErrorActionPreference='Stop';$root='${quoted}';$key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\\RPForge\\ToolAccess');$key.SetValue('Mask',0,[Microsoft.Win32.RegistryValueKind]::DWord);$key.SetValue('InstallRoot',$root);$key.SetValue('ExpiresAt',[long]${state.expires},[Microsoft.Win32.RegistryValueKind]::QWord);$key.SetValue('Mask',${state.mask},[Microsoft.Win32.RegistryValueKind]::DWord);$key.Dispose();foreach($entry in @(@('RPForgeObj',1),@('RPForgeNeon',2),@('RPForgeSkin',4))){foreach($suffix in @('SystemFileAssociations\\.ydd','Directory','Directory\\Background')){$menu=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(('Software\\Classes\\'+$suffix+'\\shell\\'+$entry[0]),$true);if(!$menu){continue};$command=$menu.OpenSubKey('command');$owned=$command -and ([string]$command.GetValue('')).StartsWith(('"'+$root+'\\'),[StringComparison]::OrdinalIgnoreCase);if($command){$command.Dispose()};if($owned){if((${state.mask} -band $entry[1]) -ne 0){$menu.DeleteValue('LegacyDisable',$false)}else{$menu.SetValue('LegacyDisable','')}};$menu.Dispose()}}`;
  await run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000});previous=identity;return state;
 });return queue;};
}
