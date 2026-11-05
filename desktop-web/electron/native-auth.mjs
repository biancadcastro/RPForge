import { createHash, generateKeyPair, randomBytes, randomUUID, sign } from 'node:crypto';
import { promisify } from 'node:util';
import { publicProfile } from './profile.mjs';
import { verifyLicense } from './license.mjs';
const keyPair = promisify(generateKeyPair);
const API = 'https://api.rpforge.dev';
const providers = new Set(['discord','google','github']);
const messages = {
  DEVICE_LIMIT_OR_ALREADY_REGISTERED:'A conta já atingiu o limite de computadores. Revise as autorizações no navegador.',
  AUTHORIZATION_EXPIRED:'A autorização expirou. Tente conectar novamente.',
  LICENSING_NOT_CONFIGURED:'A conexão do aplicativo ainda não está disponível no servidor.',
  TOO_MANY_ATTEMPTS:'Muitas tentativas. Aguarde antes de conectar novamente.',
};
export class NativeAuth {
  constructor({fetcher,openExternal,storage,onState,onProfile,onDiagnostic,deviceName='RPForge no Windows',now=Date.now,delay=setTimeout,clearDelay=clearTimeout}) {
    Object.assign(this,{fetcher,openExternal,storage,onState,onProfile,deviceName,now,delay,clearDelay});
    this.pending=null;this.record=null;this.loaded=false;this.state={status:'idle'};
    this.onDiagnostic=onDiagnostic;
  }
  update(value){this.state=value;this.onState?.(value);}
  async request(endpoint,body,signal){
    const timeout=AbortSignal.timeout(10000);
    const response=await this.fetcher(API+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,timeout]):timeout});
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
    if(record.license&&record.checkedAt>this.now()-60000)return publicProfile(record.profile);
    const nonce=randomBytes(32).toString('hex'),timestamp=this.now();
    try{
      const signature=sign('sha256',Buffer.from(`rpforge-renew-v1\n${record.refreshToken}\n${nonce}\n${timestamp}`),record.privateKey).toString('base64url');
      const {data}=await this.request('/v1/desktop/licenses/renew',{refreshToken:record.refreshToken,nonce,timestamp,signature});
      const next={...record,refreshToken:data.refreshToken,license:data.license,profile:publicProfile(data.profile),checkedAt:this.now()};
      this.record=next;this.pendingSave=true;await this.storage.write(next);this.pendingSave=false;this.onDiagnostic?.({event:'session_renewed'});return next.profile;
    }catch(error){
      if(this.pendingSave){this.onDiagnostic?.({event:'session_save_failed'});throw new Error('Não foi possível salvar a renovação da conta neste computador. Tente novamente.');}
      if(error.status===401){this.lastLicenseIssue='revoked';this.record=null;await this.storage.clear();this.onDiagnostic?.({event:'session_cleared'});return null;}
      this.onDiagnostic?.({event:'renew_unavailable',status:error.status||0});
      this.lastLicenseIssue='unavailable';
      return record.checkedAt>this.now()-72*60*60*1000?publicProfile(record.profile):null;
    }
  }
  async license(){
    this.lastLicenseIssue=null;
    const record=await this.load();
    if(!record?.refreshToken){this.lastLicenseIssue='missing';return null;}
    if(!record.license)record.checkedAt=0;
    await this.profile();const current=this.record;
    if(!current?.license){this.lastLicenseIssue ||= 'missing';return null;}
    this.licenseKeys ||= current.licenseKeys;
    let license=verifyLicense(current.license,this.licenseKeys,current.installationId,this.now());
    if(!license){
      try{
        if(!this.fetchingKeys)this.fetchingKeys=this.fetcher(API+'/v1/desktop/licenses/keys',{signal:AbortSignal.timeout(10000),cache:'no-store'}).then(async response=>{
          if(!response.ok)throw new Error('keys_unavailable');const data=await response.json();if(!Array.isArray(data.keys)||data.keys.length>10)throw new Error('invalid_keys');return data.keys;
        });
        this.licenseKeys=await this.fetchingKeys;
        license=verifyLicense(current.license,this.licenseKeys,current.installationId,this.now());
      }catch(error){this.lastLicenseIssue='unavailable';this.onDiagnostic?.({event:'license_unavailable',error:error.name});return null;}finally{this.fetchingKeys=null;}
    }
    if(!license){this.lastLicenseIssue='invalid';this.onDiagnostic?.({event:'license_verified',valid:false});return null;}
    if(current.licenseKeys!==this.licenseKeys){
      const saveKeys=async()=>{const saved=await this.storage.read();if(saved?.installationId!==current.installationId||saved.privateKey!==current.privateKey)return;await this.storage.write({...saved,licenseKeys:this.licenseKeys});};
      try{if(this.storage.withLock)await this.storage.withLock(saveKeys);else await saveKeys();current.licenseKeys=this.licenseKeys;}catch{this.onDiagnostic?.({event:'public_key_cache_unavailable'});}
    }
    this.onDiagnostic?.({event:'license_verified',valid:true,plan:license.plan});return license;
  }
  async begin(provider){
    if(!providers.has(provider))throw new Error('Provedor inválido.');
    if(this.pending)return this.state;
    const pending={provider,controller:new AbortController(),timer:null};this.pending=pending;
    this.update({status:'starting',provider});
    try{
      const keys=await keyPair('rsa',{modulusLength:3072});
      if(this.pending!==pending)return this.state;
      pending.privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'});
      pending.verifier=randomBytes(32).toString('base64url');
      pending.installationId=randomUUID();
      const {data}=await this.request('/v1/desktop/authorizations',{
        installationId:pending.installationId,publicKey:keys.publicKey.export({format:'jwk'}),deviceName:this.deviceName,
        challenge:createHash('sha256').update(pending.verifier).digest('base64url'),
      },pending.controller.signal);
      if(!/^[a-f0-9-]{36}$/i.test(data.id)||typeof data.deviceCode!=='string')throw new Error('Resposta de autorização inválida.');
      pending.deviceCode=data.deviceCode;pending.expiresAt=this.now()+Math.min(600,data.expiresIn||600)*1000;
      pending.interval=Math.max(5,data.interval||5)*1000;
      if(this.pending!==pending)return this.state;
      await this.openExternal(`${API}/v1/auth/oauth/${provider}/start?desktop=${encodeURIComponent(data.id)}`);
      if(this.pending!==pending)return this.state;
      this.update({status:'waiting',provider,message:'Conclua a autorização no navegador. O app se conecta automaticamente depois.'});
      pending.timer=this.delay(()=>void this.poll(pending),pending.interval);
      return this.state;
    }catch(error){if(this.pending===pending){this.pending=null;this.update({status:'error',provider,message:error.message||'Não foi possível abrir a autorização.'});}throw error;}
  }
  async poll(pending){
    if(this.pending!==pending)return;
    if(this.now()>=pending.expiresAt){this.cancel();this.update({status:'error',provider:pending.provider,message:'A autorização expirou. Tente novamente.'});return;}
    try{
      const result=await this.request('/v1/desktop/token',{deviceCode:pending.deviceCode,verifier:pending.verifier},pending.controller.signal);
      if(this.pending!==pending)return;
      if(result.pending){pending.timer=this.delay(()=>void this.poll(pending),pending.interval);return;}
      const profile=publicProfile(result.data.profile);
      const record={installationId:pending.installationId,privateKey:pending.privateKey,refreshToken:result.data.refreshToken,profile,checkedAt:this.now()};
      if(typeof record.refreshToken!=='string'||!record.refreshToken)throw new Error('Resposta de sessão inválida.');
      const save=()=>this.storage.write(record);await (this.storage.withLock?this.storage.withLock(save):save());this.record=record;this.pendingSave=false;this.loaded=true;this.pending=null;
      if(!profile)throw new Error('A conta foi autorizada, mas o servidor ainda precisa disponibilizar o perfil do aplicativo.');
      this.update({status:'connected',provider:pending.provider});this.onProfile?.(profile);
    }catch(error){if(this.pending===pending||this.record?.installationId===pending.installationId){this.pending=null;this.update({status:'error',provider:pending.provider,message:error.message||'Não foi possível concluir a autorização.'});}}
  }
  cancel(){const pending=this.pending;this.pending=null;if(pending){pending.controller.abort();if(pending.timer)this.clearDelay(pending.timer);}this.update({status:'idle'});}
}
