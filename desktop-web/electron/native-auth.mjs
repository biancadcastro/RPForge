import { createHash, createPublicKey, generateKeyPair, randomBytes, randomUUID, sign } from 'node:crypto';
import {hostname} from 'node:os';
import { promisify } from 'node:util';
import { publicProfile } from './profile.mjs';
import { verifyLicense } from './license.mjs';
import { internalError, networkError } from '../../src/user-error.js';
const keyPair = promisify(generateKeyPair);
import { PRODUCTION } from './environment.mjs';
const providers = new Set(['discord','google','github']);
const messages = {
  DEVICE_CLOCK_SKEW:'Sincronize o relógio do Windows e tente novamente. A identidade deste computador foi preservada.',
  INVALID_DEVICE_PROOF:'Não foi possível confirmar este computador. Tente novamente ou reconecte a conta; sua identidade foi preservada.',
  INVALID_CREDENTIALS:'Confira o e-mail e a senha. O e-mail precisa estar confirmado.',
  MFA_CODE_INVALID:'Confira o código do autenticador ou use um código de recuperação.',
  MFA_CHALLENGE_INVALID:'Este acesso expirou. Entre novamente.',
  DEVICE_LIMIT_OR_ALREADY_REGISTERED:'A conta já atingiu o limite de computadores. Revise as autorizações no navegador.',
  AUTHORIZATION_EXPIRED:'A autorização expirou. Tente conectar novamente.',
  LICENSING_NOT_CONFIGURED:'A conexão do aplicativo ainda não está disponível no servidor.',
  TOO_MANY_ATTEMPTS:'Muitas tentativas. Aguarde antes de conectar novamente.',
};
export class NativeAuth {
  constructor({fetcher,openExternal,storage,onState,onProfile,onDiagnostic,environment=PRODUCTION,deviceName=hostname().replace(/[\p{C}<>]/gu,'').slice(0,60)||'Computador Windows',now=Date.now,delay=setTimeout,clearDelay=clearTimeout}) {
    Object.assign(this,{environment,fetcher,openExternal,storage,onState,onProfile,deviceName,now,delay,clearDelay});
    this.pending=null;this.record=null;this.loaded=false;this.state={status:'idle'};
    this.onDiagnostic=onDiagnostic;
  }
  update(value){this.state=value;this.onState?.(value);}
  async request(endpoint,body,signal){
    const timeout=AbortSignal.timeout(10000);
    let response;
    try{response=await this.fetcher(this.environment.api+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,timeout]):timeout});}
    catch(error){
      // A caller-cancelled request keeps its abort; everything else is a connection failure.
      if(signal?.aborted)throw error;
      this.onDiagnostic?.({event:'request_unreachable',error:error?.name});throw networkError(error);
    }
    const data=response.status===204?{}:await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(messages[data.code]||'Não foi possível conectar a conta. Tente novamente.');error.status=response.status;error.code=data.code;this.onDiagnostic?.({event:'request_failed',status:response.status,code:data.code});throw error;}
    return {data,pending:response.status===202};
  }
  async load(){
    if(this.loaded)return this.record;
    if(!this.loading)this.loading=this.storage.read().then(record=>{
      this.record=record;
      this.onDiagnostic?.({event:'session_loaded',present:!!record});
      // An empty/transient read must not leave this process signed out forever.
      this.loaded=!!record;
      return record;
    });
    try{return await this.loading;}finally{this.loading=null;}
  }
  async profile(){
    if(this.renewing)return this.renewing;
    this.renewing=this.refreshProfile();
    try{return await this.renewing;}finally{this.renewing=null;}
  }
  async refreshProfile(){
    const operation=()=>this.renewStoredProfile();
    return this.storage.withLock?this.storage.withLock(operation):operation();
  }
  async renewStoredProfile(){
    let record=await this.load();
    if(this.storage.withLock){
      const saved=await this.storage.read();
      if(saved){
        // The refresh token may already have been rotated by another process.
        if(!this.pendingSave){record=saved;this.record=saved;this.loaded=true;}
      }
    }
    if(this.pendingSave){await this.storage.write(this.record);this.pendingSave=false;record=this.record;}
    if(record?.migrateStorage){const {migrateStorage,...migrated}=record;await this.storage.write(migrated);record=migrated;this.record=migrated;}
    if(!record?.refreshToken)return null;
    if(record.license&&!record.pendingRenewal&&record.checkedAt>this.now()-60000)return publicProfile(record.profile);
    try{
      // Save the exact signed request before sending so a lost response can be retried.
      const proof=record.pendingRenewal||this.proof(record,'renew');
      record={...record,pendingRenewal:proof};this.record=record;await this.storage.write(record);
      const {data}=await this.request('/v1/desktop/licenses/renew',proof);
      const {pendingRenewal,...previous}=record;
      const next={...previous,refreshToken:data.refreshToken,license:data.license,profile:publicProfile(data.profile),checkedAt:this.now()};
      this.record=next;this.pendingSave=true;await this.storage.write(next);this.pendingSave=false;this.onDiagnostic?.({event:'session_renewed'});return next.profile;
    }catch(error){
      if(this.pendingSave){this.onDiagnostic?.({event:'session_save_failed'});throw new Error('Não foi possível salvar a renovação da conta neste computador. Tente novamente.');}
      if(error.status===401&&['DESKTOP_AUTHENTICATION_REQUIRED','DESKTOP_TOKEN_REUSED'].includes(error.code)){
        this.lastLicenseIssue='revoked';this.revoked=true;await this.forgetSession(record);return null;
      }
      if(['DEVICE_CLOCK_SKEW','INVALID_DEVICE_PROOF'].includes(error.code)){
        const {pendingRenewal,...preserved}=record;this.record=preserved;await this.storage.write(preserved);
        this.lastLicenseIssue='clock';this.lastLicenseMessage=error.message;
        return record.checkedAt>this.now()-72*3600000?publicProfile(record.profile):null;
      }
      this.onDiagnostic?.({event:'renew_unavailable',status:error.status||0});
      this.lastLicenseIssue='unavailable';
      return record.checkedAt>this.now()-72*60*60*1000?publicProfile(record.profile):null;
    }
  }
  async license(){
    this.lastLicenseIssue=null;
    const record=await this.load();
    // A session revoked by the server stays reported as revoked until the account connects again.
    if(!record?.refreshToken){this.lastLicenseIssue=this.revoked?'revoked':'missing';return null;}
    if(!record.license)record.checkedAt=0;
    await this.profile();const current=this.record;
    if(!current?.license){this.lastLicenseIssue ||= 'missing';return null;}
    this.licenseKeys ||= current.licenseKeys;
    let license=verifyLicense(current.license,this.licenseKeys,current.installationId,this.now(),this.environment);
    if(!license){
      try{
        if(!this.fetchingKeys)this.fetchingKeys=this.fetcher(this.environment.api+'/v1/desktop/licenses/keys',{signal:AbortSignal.timeout(10000),cache:'no-store'}).then(async response=>{
          if(!response.ok)throw new Error('keys_unavailable');const data=await response.json();if(!Array.isArray(data.keys)||data.keys.length>10)throw new Error('invalid_keys');return data.keys;
        });
        this.licenseKeys=await this.fetchingKeys;
        license=verifyLicense(current.license,this.licenseKeys,current.installationId,this.now(),this.environment);
      }catch(error){this.lastLicenseIssue='unavailable';this.onDiagnostic?.({event:'license_unavailable',error:error.name});return null;}finally{this.fetchingKeys=null;}
    }
    if(!license){this.lastLicenseIssue='invalid';this.onDiagnostic?.({event:'license_verified',valid:false});return null;}
    if(current.licenseKeys!==this.licenseKeys){
      const saveKeys=async()=>{const saved=await this.storage.read();if(saved?.installationId!==current.installationId||saved.privateKey!==current.privateKey)return;await this.storage.write({...saved,licenseKeys:this.licenseKeys});};
      try{if(this.storage.withLock)await this.storage.withLock(saveKeys);else await saveKeys();current.licenseKeys=this.licenseKeys;}catch{this.onDiagnostic?.({event:'public_key_cache_unavailable'});}
    }
    this.onDiagnostic?.({event:'license_verified',valid:true,plan:license.plan});return license;
  }
  proof(record,purpose){
    const nonce=randomBytes(32).toString('hex'),timestamp=this.now();
    const signature=sign('sha256',Buffer.from(`rpforge-${purpose}-v1\n${record.refreshToken}\n${nonce}\n${timestamp}`),record.privateKey).toString('base64url');
    return {refreshToken:record.refreshToken,nonce,timestamp,signature};
  }
  async forgetSession(record=this.record){
    // A revoked session must not erase the durable identity and consume a new seat on login.
    if(record?.installationId&&record.privateKey){
      this.record={installationId:record.installationId,privateKey:record.privateKey,publicKey:record.publicKey,profile:null};
      this.loaded=true;await this.storage.write(this.record);
    }else{this.record=null;this.loaded=false;await this.storage.clear();}
    this.licenseKeys=null;this.onProfile?.(null);
  }
  async identity(){
    const operation=async()=>{
      const record=await this.storage.read()||await this.load()||{};
      if(record.privateKey&&record.installationId){
        this.record={...record,publicKey:createPublicKey(record.privateKey).export({format:'jwk'})};
      }else{
        const keys=await keyPair('rsa',{modulusLength:3072});
        this.record={installationId:randomUUID(),privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'}),publicKey:keys.publicKey.export({format:'jwk'}),profile:null};
      }
      await this.storage.write(this.record);this.loaded=true;return this.record;
    };
    return this.storage.withLock?this.storage.withLock(operation):operation();
  }
  async grant(provider){
    const identity=await this.identity(),saved=identity.pendingAuthorization;
    if(saved?.provider===provider&&saved.expiresAt>this.now())return {...saved,controller:new AbortController(),timer:null,attempts:0};
    const verifier=randomBytes(32).toString('base64url');
    const {data}=await this.request('/v1/desktop/authorizations',{installationId:identity.installationId,publicKey:identity.publicKey,deviceName:this.deviceName,challenge:createHash('sha256').update(verifier).digest('base64url')});
    if(!/^[a-f0-9-]{36}$/i.test(data.id)||typeof data.deviceCode!=='string')throw Error('Resposta de autorização inválida.');
    const savedGrant={provider,id:data.id,deviceCode:data.deviceCode,verifier,expiresAt:this.now()+Math.min(600,data.expiresIn||600)*1000,interval:Math.max(5,data.interval||5)*1000};
    this.record={...identity,pendingAuthorization:savedGrant};await this.storage.write(this.record);
    return {...savedGrant,controller:new AbortController(),timer:null,attempts:0};
  }
  activation(pending){
    const signature=sign('sha256',Buffer.from(`rpforge-activate-v1\n${pending.deviceCode}\n${pending.verifier}`),this.record.privateKey).toString('base64url');
    return {deviceCode:pending.deviceCode,verifier:pending.verifier,signature};
  }
  async accept(data,pending){
    const profile=publicProfile(data.profile);
    if(!profile||typeof data.refreshToken!=='string'||!data.refreshToken)throw Error('Resposta de sessão inválida.');
    const {pendingAuthorization,pendingRenewal,...identity}=this.record;
    const record={...identity,refreshToken:data.refreshToken,profile,checkedAt:0};
    const save=()=>this.storage.write(record);await (this.storage.withLock?this.storage.withLock(save):save());
    this.record=record;this.loaded=true;this.pendingSave=false;this.pending=null;this.revoked=false;
    this.update({status:'connected',provider:pending.provider});this.onProfile?.(profile);
  }
  async begin(provider){
    if(!providers.has(provider))throw internalError('Provedor inválido.');
    if(this.starting)return this.starting;
    if(this.pending)return this.state;
    const generation=this.generation=(this.generation||0)+1;
    this.starting=this.beginBrowser(provider,generation);
    try{return await this.starting;}finally{this.starting=null;}
  }
  async beginBrowser(provider,generation){
    this.update({status:'starting',provider});
    try{
      const pending=await this.grant(provider);
      if(generation!==this.generation){await this.cancel();return this.state;}
      this.pending=pending;
      await this.openExternal(`${this.environment.api}/v1/auth/oauth/${provider}/start?desktop=${encodeURIComponent(pending.id)}`);
      if(this.pending!==pending)return this.state;
      this.update({status:'waiting',provider,message:'Conclua a autorização no navegador. O app se conecta automaticamente depois.'});
      pending.timer=this.delay(()=>void this.poll(pending),pending.interval);
      return this.state;
    }catch(error){this.pending=null;this.update({status:'error',provider,message:error.message||'Não foi possível abrir a autorização.'});throw error;}
  }
  async poll(pending){
    if(this.pending!==pending)return;
    if(this.now()>=pending.expiresAt){this.cancel();this.update({status:'error',provider:pending.provider,message:'A autorização expirou. Tente novamente.'});return;}
    try{
      const result=await this.request('/v1/desktop/token',this.activation(pending),pending.controller.signal);
      if(this.pending!==pending)return;
      if(result.pending){pending.timer=this.delay(()=>void this.poll(pending),pending.interval);return;}
      await this.accept(result.data,pending);
    }catch(error){if(this.pending===pending){
      if(!error.status||error.status>=500||error.status===429){
        pending.attempts=(pending.attempts||0)+1;
        this.update({status:'waiting',provider:pending.provider,message:'A conexão está instável. Tentando novamente; você pode cancelar.'});
        pending.timer=this.delay(()=>void this.poll(pending),Math.min(30000,pending.interval*2**Math.min(pending.attempts,3)));
      }else{await this.cancel();this.update({status:'error',provider:pending.provider,message:error.message||'Não foi possível concluir a autorização.'});}
    }}
  }
  async resume(){
    if(this.pending||this.starting)return this.state;
    const record=await this.load(),saved=record?.pendingAuthorization;
    if(saved&&saved.expiresAt>this.now()){
      this.pending={...saved,controller:new AbortController(),timer:null,attempts:0};
      if(saved.challengeToken)return {status:'idle',challengeToken:saved.challengeToken};
      await this.poll(this.pending);
    }
    return this.state;
  }
  async signIn(email,password){
    if(typeof email!=='string'||email.length>254||typeof password!=='string'||!password||password.length>512)throw Error('Confira o e-mail e a senha.');
    await this.cancel();
    const pending=await this.grant('password');this.pending=pending;
    try{
      const {data}=await this.request('/v1/desktop/login',{...this.activation(pending),email:email.trim(),password});
      if(data.mfaRequired){
        this.record={...this.record,pendingAuthorization:{...this.record.pendingAuthorization,challengeToken:data.challengeToken}};
        await this.storage.write(this.record);return data;
      }
      await this.accept(data,pending);return {mfaRequired:false};
    }catch(error){
      if(!error.status||error.status>=500){pending.timer=this.delay(()=>void this.poll(pending),pending.interval);}
      else await this.cancel();
      throw error;
    }
  }
  async verifyMfa(challengeToken,code){
    const pending=this.pending;
    if(!pending||pending.provider!=='password')throw Error('Entre novamente para confirmar o acesso.');
    try{
      const {data}=await this.request('/v1/desktop/login/mfa',{...this.activation(pending),challengeToken,code});
      await this.accept(data,pending);
    }catch(error){
      if(!error.status||error.status>=500)pending.timer=this.delay(()=>void this.poll(pending),pending.interval);
      throw error;
    }
  }
  async disconnect(){
    await this.cancel();const record=await this.load();
    if(record?.refreshToken){
      try{await this.request('/v1/desktop/disconnect',this.proof(record,'disconnect'));}
      catch(error){if(!['DESKTOP_AUTHENTICATION_REQUIRED','DESKTOP_TOKEN_REUSED'].includes(error.code))throw error;}
    }
    const forget=()=>this.forgetSession(record);await (this.storage.withLock?this.storage.withLock(forget):forget());
  }
  suspend(){
    this.generation=(this.generation||0)+1;
    const pending=this.pending;this.pending=null;
    if(pending){pending.controller.abort();if(pending.timer)this.clearDelay(pending.timer);}
    this.update({status:'idle'});
  }
  async cancel(){
    this.suspend();
    const record=await this.load();
    if(record?.pendingAuthorization){const {pendingAuthorization,...identity}=record;this.record=identity;await this.storage.write(identity);}
  }
}
