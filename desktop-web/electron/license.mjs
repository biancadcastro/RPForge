import { createPublicKey, verify } from 'node:crypto';

export const PRO_ACTIONS = Object.freeze({clothing:'clothing.obj', neon:'clothing.neon', 'skin-inspect':'clothing.skin', 'skin-split':'clothing.skin'});

export function verifyLicense(token, keys, installationId, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 32768 || !installationId) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    if (header.alg !== 'RS256' || header.typ !== 'rpforge-license+jwt') return null;
    const jwk = keys?.find(key => key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256');
    if (!jwk || !verify('RSA-SHA256', Buffer.from(parts.slice(0,2).join('.')), createPublicKey({key:jwk,format:'jwk'}), Buffer.from(parts[2], 'base64url'))) return null;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    const seconds = now / 1000;
    if (claims.v !== 1 || claims.iss !== 'https://api.rpforge.dev' || claims.aud !== 'rpforge-desktop' ||
        claims.installationId !== installationId || typeof claims.sub !== 'string' || !claims.sub ||
        !Number.isFinite(claims.exp) || !Number.isFinite(claims.nbf) || !Number.isFinite(claims.iat) ||
        claims.exp <= seconds || claims.nbf > seconds || claims.iat > seconds || claims.exp - claims.iat > 72*3600 ||
        !Array.isArray(claims.capabilities) || !claims.capabilities.every(c=>typeof c==='string')) return null;
    return claims;
  } catch { return null; }
}

export async function requireToolAccess(action, account, onLicense) {
  const capability = PRO_ACTIONS[action];
  if (!capability) return;
  const license = await account.license();
  // The Explorer presentation must reflect the very snapshot enforcing access.
  await onLicense?.(license);
  if(!license&&account.lastLicenseIssue){
    if(account.lastLicenseIssue==='clock')throw new Error(account.lastLicenseMessage||'Sincronize o relógio do Windows e tente novamente.');
    const reasons={missing:'Não foi possível carregar a sessão da sua conta. Abra Conta no aplicativo e conecte novamente.',revoked:'A autorização deste computador não está mais válida. Conecte novamente sua conta no aplicativo.',unavailable:'Não foi possível validar sua licença agora. Verifique a conexão e tente novamente.',invalid:'A licença deste computador não pôde ser validada. Abra Conta no aplicativo para renovar a autorização.'};
    throw new Error(reasons[account.lastLicenseIssue]||'Não foi possível validar a licença deste computador.');
  }
  if (license?.plan !== 'pro' || !license.capabilities.includes(capability))
    throw new Error('Esta ferramenta é exclusiva do plano Pro. Conecte uma conta com assinatura Pro ativa.');
}
