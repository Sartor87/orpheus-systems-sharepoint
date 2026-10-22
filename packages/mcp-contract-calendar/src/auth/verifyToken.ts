import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

export interface TokenClaims {
  oid: string;
  upn: string | null;
  tid: string;
  uti: string | null;
  /** The validated bearer token, needed for the on-behalf-of exchange. Never log it. */
  raw: string;
}

export interface VerifyOptions {
  tenantId: string;
  audience: string;
  /** Test seam; defaults to the tenant's remote JWKS. */
  jwks?: JWTVerifyGetKey;
}

const remoteKeys = new Map<string, JWTVerifyGetKey>();

function defaultJwks(tenantId: string): JWTVerifyGetKey {
  let k = remoteKeys.get(tenantId);
  if (!k) {
    k = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));
    remoteKeys.set(tenantId, k);
  }
  return k;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export async function verifyAccessToken(token: string, opts: VerifyOptions): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, opts.jwks ?? defaultJwks(opts.tenantId), {
    issuer: [`https://login.microsoftonline.com/${opts.tenantId}/v2.0`, `https://sts.windows.net/${opts.tenantId}/`],
    audience: opts.audience,
    algorithms: ['RS256']
  });
  const oid = str(payload.oid);
  if (!oid) throw new Error('Token has no oid claim.');
  return {
    oid,
    upn: str(payload.upn) ?? str(payload.preferred_username),
    tid: str(payload.tid) ?? opts.tenantId,
    uti: str(payload.uti),
    raw: token
  };
}
