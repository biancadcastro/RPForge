import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PRODUCTION,EnvironmentError,resolveEnvironment,loopbackOrigin,licenseKeyAllowed,dataRoot,guardFetch,publicEnvironment} from '../desktop-web/electron/environment.mjs';
import {verifyLicense} from '../desktop-web/electron/license.mjs';
import {NativeAuth} from '../desktop-web/electron/native-auth.mjs';
import {createAuthClient} from '../desktop-web/electron/auth.mjs';
import {desktopProfile} from '../desktop-web/electron/desktop-profile.mjs';
import {desktopAccountStorage} from '../desktop-web/electron/account-storage.mjs';
import {createMenuAccessWriter} from '../desktop-web/electron/menu-access.mjs';

const local=(extra={})=>resolveEnvironment({isPackaged:false,env:{RPFORGE_ENV:'local',...extra},argv:[]});
const plainStorage={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value),decryptString:bytes=>bytes.toString()};

test('production is the default and the only environment without the full opt-in',()=>{
  assert.equal(resolveEnvironment(),PRODUCTION);
  assert.equal(resolveEnvironment({isPackaged:false,env:{},argv:[]}),PRODUCTION);
  // Addresses alone, or any other value of the switch, never enable the local mode.
  for(const env of [{RPFORGE_LOCAL_API:'http://127.0.0.1:8787'},{RPFORGE_ENV:'LOCAL'},{RPFORGE_ENV:'development'},{RPFORGE_ENV:'1'},{RPFORGE_ENV:''}])
    assert.equal(resolveEnvironment({isPackaged:false,env,argv:[]}),PRODUCTION);
  assert.equal(PRODUCTION.api,'https://api.rpforge.dev');assert.equal(PRODUCTION.site,'https://rpforge.dev');
  assert.deepEqual([...PRODUCTION.licenseIssuers],['https://api.rpforge.dev']);
  assert.ok(Object.isFrozen(PRODUCTION));
  assert.deepEqual(publicEnvironment(PRODUCTION),{name:'production',local:false,label:'',api:'',site:''});
});

test('local mode needs an unpackaged run plus the variable or the flag, and uses loopback defaults',()=>{
  const byVariable=local(),byFlag=resolveEnvironment({isPackaged:false,env:{},argv:['electron','.','--rpforge-local']});
  for(const environment of [byVariable,byFlag]){
    assert.equal(environment.name,'local');assert.equal(environment.local,true);
    assert.equal(environment.api,'http://127.0.0.1:8787');assert.equal(environment.site,'http://localhost:3100');
    assert.equal(environment.dataFolder,'RPForge-local');assert.ok(Object.isFrozen(environment));
  }
  const custom=local({RPFORGE_LOCAL_API:'http://localhost:9000/',RPFORGE_LOCAL_SITE:'http://127.0.0.1:3200'});
  assert.equal(custom.api,'http://localhost:9000');assert.equal(custom.site,'http://127.0.0.1:3200');
  assert.equal(publicEnvironment(custom).label,'Ambiente local de testes');
});

test('an installed (packaged) app and the automated test mode ignore the opt-in entirely',()=>{
  const env={RPFORGE_ENV:'local',RPFORGE_LOCAL_API:'http://127.0.0.1:8787'},argv=['RPForge.exe','--rpforge-local'];
  assert.equal(resolveEnvironment({isPackaged:true,env,argv}),PRODUCTION);
  // Missing or non-boolean packaging information is treated as packaged.
  assert.equal(resolveEnvironment({env,argv}),PRODUCTION);
  assert.equal(resolveEnvironment({isPackaged:undefined,env,argv}),PRODUCTION);
  assert.equal(resolveEnvironment({isPackaged:0,env,argv}),PRODUCTION);
  assert.equal(resolveEnvironment({isPackaged:false,env,argv,testMode:true}),PRODUCTION);
  // Even an invalid address is ignored, not an error, when the app is packaged.
  assert.equal(resolveEnvironment({isPackaged:true,env:{RPFORGE_ENV:'local',RPFORGE_LOCAL_API:'https://evil.example'},argv:[]}),PRODUCTION);
});

test('only loopback origins are accepted as local; rpforge.dev never is',()=>{
  for(const value of ['https://api.rpforge.dev','https://rpforge.dev','https://staging.rpforge.dev','http://localhost.rpforge.dev:8787','http://127.0.0.1.rpforge.dev',
    'http://127.0.0.1:8787@api.rpforge.dev','http://localhost@api.rpforge.dev','http://user:pw@127.0.0.1:8787','http://192.168.0.10:8787','http://0.0.0.0:8787','http://[::1]:8787',
    'http://example.com','http://127.0.0.1:8787/v1','http://127.0.0.1:8787/?next=https://api.rpforge.dev','http://127.0.0.1:8787/#x','ftp://127.0.0.1','file:///C:/x','javascript:alert(1)','127.0.0.1:8787','','not a url']){
    assert.throws(()=>loopbackOrigin(value),EnvironmentError,value);
    assert.throws(()=>local({RPFORGE_LOCAL_API:value||' '}),EnvironmentError,'api '+value);
    assert.throws(()=>local({RPFORGE_LOCAL_SITE:value||' '}),EnvironmentError,'site '+value);
  }
  for(const [value,origin] of [['http://localhost:8787','http://localhost:8787'],['http://127.0.0.1:8787/','http://127.0.0.1:8787'],['HTTP://LOCALHOST:3100','http://localhost:3100'],['https://localhost:8443','https://localhost:8443']])
    assert.equal(loopbackOrigin(value),origin);
});

test('local mode refuses any request that leaves the configured loopback API',async()=>{
  const seen=[],fetcher=async url=>{seen.push(String(url));return new Response('{}');};
  const guarded=guardFetch(local(),fetcher);
  await guarded('http://127.0.0.1:8787/v1/auth/providers');
  for(const url of ['https://api.rpforge.dev/v1/desktop/login','http://localhost:8787/v1/x','http://127.0.0.1:8788/v1/x','nonsense'])
    assert.throws(()=>guarded(url),EnvironmentError,url);
  assert.deepEqual(seen,['http://127.0.0.1:8787/v1/auth/providers']);
  assert.equal(guardFetch(PRODUCTION,fetcher),fetcher);
});

test('clients send requests to the resolved environment and production stays the default',async()=>{
  const requests=[],fetcher=async(url,options)=>{requests.push({url,origin:options.headers.Origin});return new Response(JSON.stringify({providers:[]}));};
  await createAuthClient(fetcher).options();await createAuthClient(fetcher,local()).options();
  assert.deepEqual(requests,[{url:'https://api.rpforge.dev/v1/auth/providers',origin:'https://rpforge.dev'},{url:'http://127.0.0.1:8787/v1/auth/providers',origin:'http://localhost:3100'}]);
  const urls=[],grant={id:'12345678-1234-4234-8234-123456789abc',deviceCode:'a'.repeat(64),expiresIn:600,interval:5};
  const options=environment=>({...(environment?{environment}:{}),fetcher:async url=>{urls.push(url);return new Response(JSON.stringify(grant),{status:201});},openExternal:async url=>{urls.push(url);},storage:{read:async()=>null,write:async()=>{}},delay:()=>0,clearDelay:()=>{}});
  await new NativeAuth(options()).begin('github');await new NativeAuth(options(local())).begin('github');
  assert.deepEqual(urls,['https://api.rpforge.dev/v1/desktop/authorizations',`https://api.rpforge.dev/v1/auth/oauth/github/start?desktop=${grant.id}`,
    'http://127.0.0.1:8787/v1/desktop/authorizations',`http://127.0.0.1:8787/v1/auth/oauth/github/start?desktop=${grant.id}`]);
});

const localKeys=generateKeyPairSync('rsa',{modulusLength:3072}),productionKeys=generateKeyPairSync('rsa',{modulusLength:3072});
const now=Date.now(),seconds=Math.floor(now/1000);
const claims={v:1,iss:'https://api.rpforge.dev',aud:'rpforge-desktop',sub:'user',installationId:'device',plan:'pro',capabilities:['clothing.obj','clothing.neon','clothing.skin'],iat:seconds,nbf:seconds,exp:seconds+3600};
function license(pair,kid,value=claims){
  const content=[{alg:'RS256',kid,typ:'rpforge-license+jwt'},value].map(part=>Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  return content+'.'+sign('RSA-SHA256',Buffer.from(content),pair.privateKey).toString('base64url');
}
const jwk=(pair,kid)=>({...pair.publicKey.export({format:'jwk'}),kid,alg:'RS256'});

test('a license signed by the local key is never accepted in production, whatever the key set',()=>{
  const localKey=jwk(localKeys,'local-dev-abc123'),productionKey=jwk(productionKeys,'prod-2026');
  const localLicense=license(localKeys,'local-dev-abc123');
  // Accepted only in local mode.
  assert.equal(verifyLicense(localLicense,[localKey],'device',now,local()).plan,'pro');
  // Production: refused with the real keys, and still refused if the local key somehow got into the cache.
  assert.equal(verifyLicense(localLicense,[productionKey],'device',now),null);
  assert.equal(verifyLicense(localLicense,[localKey],'device',now),null);
  assert.equal(verifyLicense(localLicense,[localKey,productionKey],'device',now,PRODUCTION),null);
  // A local license claiming the local origin as issuer is valid locally and still refused in production.
  const localIssuer=license(localKeys,'local-dev-abc123',{...claims,iss:'http://127.0.0.1:8787'});
  assert.equal(verifyLicense(localIssuer,[localKey],'device',now,local()).plan,'pro');
  assert.equal(verifyLicense(localIssuer,[localKey],'device',now),null);
  // The local key under a production-looking kid fails on the issuer or on the signature.
  assert.equal(verifyLicense(license(localKeys,'prod-2026',{...claims,iss:'http://127.0.0.1:8787'}),[jwk(localKeys,'prod-2026')],'device',now),null);
  assert.equal(verifyLicense(license(localKeys,'prod-2026'),[productionKey],'device',now),null);
  // Production licenses keep working in production and are not accepted by the local mode.
  const productionLicense=license(productionKeys,'prod-2026');
  assert.equal(verifyLicense(productionLicense,[productionKey],'device',now).plan,'pro');
  assert.equal(verifyLicense(productionLicense,[productionKey],'device',now,local()),null);
  assert.equal(verifyLicense(license(localKeys,'local-dev-abc123',{...claims,iss:'https://evil.example'}),[localKey],'device',now,local()),null);
  assert.equal(licenseKeyAllowed('local-dev-x',PRODUCTION),false);assert.equal(licenseKeyAllowed('local-dev-x',local()),true);
  assert.equal(licenseKeyAllowed('prod',local()),false);assert.equal(licenseKeyAllowed('prod'),true);assert.equal(licenseKeyAllowed(undefined,local()),false);
});

test('a production client offered a local license and local keys reports it as invalid',async()=>{
  const device=generateKeyPairSync('rsa',{modulusLength:3072});
  const record={refreshToken:'token',installationId:'device',privateKey:device.privateKey.export({type:'pkcs8',format:'pem'}),profile:{displayName:'Pessoa',avatarUrl:null},license:license(localKeys,'local-dev-abc123'),checkedAt:now};
  const requested=[],fetcher=async url=>{requested.push(url);return new Response(JSON.stringify({keys:[jwk(localKeys,'local-dev-abc123')]}));};
  const production=new NativeAuth({now:()=>now,storage:{read:async()=>record,write:async()=>{}},fetcher});
  assert.equal(await production.license(),null);assert.equal(production.lastLicenseIssue,'invalid');
  assert.deepEqual(requested,['https://api.rpforge.dev/v1/desktop/licenses/keys']);
  const localClient=new NativeAuth({environment:local(),now:()=>now,storage:{read:async()=>({...record}),write:async()=>{}},fetcher});
  assert.equal((await localClient.license()).plan,'pro');
  assert.equal(requested.at(-1),'http://127.0.0.1:8787/v1/desktop/licenses/keys');
});

test('the local profile, session and menu cache live apart from production and never touch it',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'rpforge-environment-'));
  try{
    const localData=path.join(root,'local-app-data'),legacy=path.join(root,'legacy');
    mkdirSync(legacy);writeFileSync(path.join(legacy,'Local State'),'production-key');
    assert.equal(dataRoot(PRODUCTION,localData),path.join(localData,'RPForge'));
    assert.equal(dataRoot(local(),localData),path.join(localData,'RPForge-local'));
    assert.throws(()=>dataRoot(local(),''),EnvironmentError);

    // Production profile and session exist first.
    const productionProfile=desktopProfile(legacy,localData);
    const productionAccount=desktopAccountStorage(productionProfile,localData,plainStorage);
    await productionAccount.write({refreshToken:'production-token'});
    writeFileSync(path.join(localData,'RPForge','menu-access.bin'),'production-menu');
    const snapshot=()=>readdirSync(path.join(localData,'RPForge'),{recursive:true}).sort().map(name=>{const file=path.join(localData,'RPForge',name);try{return name+':'+readFileSync(file).toString('hex');}catch{return name;}});
    const before=snapshot();

    // The local profile starts empty: nothing is imported from the production or legacy profile.
    const localProfile=desktopProfile(null,localData,local().dataFolder);
    assert.equal(localProfile,path.join(localData,'RPForge-local','desktop-profile'));
    assert.deepEqual(readdirSync(localProfile),['.profile-ready']);
    // A stale legacy session inside the profile is not revived either.
    writeFileSync(path.join(localProfile,'desktop-session.bin'),JSON.stringify({refreshToken:'stale'}));
    const localAccount=desktopAccountStorage(localProfile,localData,plainStorage,undefined,{folder:local().dataFolder,migrate:false});
    assert.equal(await localAccount.read(),null);
    await localAccount.write({refreshToken:'local-token'});
    assert.deepEqual(await localAccount.read(),{refreshToken:'local-token'});
    assert.ok(existsSync(path.join(localData,'RPForge-local','account','desktop-session.bin')));

    // The menu cache goes to the local folder and the registry script never runs.
    let registry=0;
    const write=createMenuAccessWriter({installRoot:'C:/RPForge',platform:'win32',run:async()=>{registry++;},directory:dataRoot(local(),localData),registry:false});
    const state=await write({plan:'pro',exp:Math.floor(Date.now()/1000)+3600,capabilities:['clothing.obj']});
    assert.equal(state.mask,1);assert.equal(registry,0);
    assert.equal(readFileSync(path.join(localData,'RPForge-local','menu-access.bin')).readUInt32LE(4),1);

    // Signing out locally clears only the local session.
    await localAccount.clear();assert.equal(await localAccount.read(),null);
    assert.deepEqual(snapshot(),before);
    assert.deepEqual(await productionAccount.read(),{refreshToken:'production-token'});
    assert.equal(readFileSync(path.join(localData,'RPForge','menu-access.bin'),'utf8'),'production-menu');
  }finally{rmSync(root,{recursive:true,force:true});}
});
