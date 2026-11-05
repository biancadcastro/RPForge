// Synthetic authentication server for offscreen Electron checks. No real API traffic.
export async function installTestAuth(application,{mfa=false}={}){
  await application.evaluate(({net,shell,BrowserWindow},{mfa})=>{
    const crypto=process.getBuiltinModule('node:crypto');
    const keys=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
    const profile={displayName:'Pessoa de teste',avatarUrl:null};
    let connected=false,installationId,publicKey;
    const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
    globalThis.__forgeTestProfile=()=>connected?profile:null;
    globalThis.__openedAuth=[];shell.openExternal=async url=>{globalThis.__openedAuth.push(url);};
    net.fetch=async url=>{
      if(String(url).endsWith('/v1/auth/providers'))return json({passwordAuthEnabled:true,providers:['discord','google','github'].map(provider=>({provider,enabled:true}))});
      throw Error('Unexpected browser API request in isolated auth fixture');
    };
    globalThis.__forgeTestFetch=async(url,options={})=>{
      if(String(url).endsWith('/licenses/keys'))return json({keys:[{...keys.publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256'}]});
      const body=JSON.parse(options.body||'{}');
      if(String(url).endsWith('/authorizations')){
        installationId=body.installationId;publicKey=body.publicKey;
        return json({id:'12345678-1234-4234-8234-123456789abc',deviceCode:'a'.repeat(64),expiresIn:600,interval:5},201);
      }
      if(String(url).endsWith('/token'))return json({status:'authorization_pending'},202);
      if(String(url).endsWith('/login')){
        if(!['fixture-correct','fixture-password'].includes(body.password))return json({code:'INVALID_CREDENTIALS'},401);
        if(mfa)return json({mfaRequired:true,challengeToken:'b'.repeat(64)},202);
        connected=true;return json({refreshToken:'fixture-refresh',installationId,profile});
      }
      if(String(url).endsWith('/login/mfa')){
        if(body.code!=='123456')return json({code:'MFA_CODE_INVALID'},400);
        connected=true;return json({refreshToken:'fixture-refresh',installationId,profile});
      }
      if(String(url).endsWith('/disconnect')){connected=false;return new Response(null,{status:204});}
      if(String(url).endsWith('/renew')){
        const seconds=Math.floor(Date.now()/1000);
        const claims={v:1,iss:'https://api.rpforge.dev',aud:'rpforge-desktop',sub:'fixture-user',installationId,plan:'free',capabilities:[],iat:seconds,nbf:seconds,exp:seconds+3600};
        const content=[{alg:'RS256',typ:'rpforge-license+jwt',kid:'fixture'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
        const license=content+'.'+crypto.sign('sha256',Buffer.from(content),keys.privateKey).toString('base64url');
        return json({license,refreshToken:'fixture-next',profile});
      }
      throw Error('Unexpected native API request in isolated auth fixture');
    };
    for(const window of BrowserWindow.getAllWindows())window.webContents.send('forge:profile',null);
  },{mfa});
}
