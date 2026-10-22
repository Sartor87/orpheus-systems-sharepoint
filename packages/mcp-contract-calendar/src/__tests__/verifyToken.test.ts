import { SignJWT, generateKeyPair, createLocalJWKSet, exportJWK } from 'jose';
import type { JWK } from 'jose';
import { verifyAccessToken } from '../auth/verifyToken';

const TENANT = '11111111-2222-3333-4444-555555555555';
const AUD = 'api://test-audience';
const V2 = `https://login.microsoftonline.com/${TENANT}/v2.0`;
const V1 = `https://sts.windows.net/${TENANT}/`;

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, o: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(o.iss ?? V2)
      .setAudience(o.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(o.exp ?? '5m')
      .sign(privateKey);
  return { jwks, sign };
}

describe('verifyAccessToken', () => {
  it('accepts a valid v2 token and maps claims', async () => {
    const { jwks, sign } = await setup();
    const t = await sign({ oid: 'oid-1', tid: TENANT, preferred_username: 'a@example.test', uti: 'u1' });
    const c = await verifyAccessToken(t, { tenantId: TENANT, audience: AUD, jwks });
    expect(c).toEqual({ oid: 'oid-1', upn: 'a@example.test', tid: TENANT, uti: 'u1', raw: t });
  });

  it('prefers upn over preferred_username; null when absent', async () => {
    const { jwks, sign } = await setup();
    const t1 = await sign({ oid: 'o', tid: TENANT, upn: 'u@example.test', preferred_username: 'p@example.test' });
    expect((await verifyAccessToken(t1, { tenantId: TENANT, audience: AUD, jwks })).upn).toBe('u@example.test');
    const t2 = await sign({ oid: 'o', tid: TENANT });
    const c2 = await verifyAccessToken(t2, { tenantId: TENANT, audience: AUD, jwks });
    expect(c2.upn).toBeNull();
    expect(c2.uti).toBeNull();
  });

  it('rejects a wrong audience', async () => {
    const { jwks, sign } = await setup();
    const t = await sign({ oid: 'o', tid: TENANT }, { aud: 'api://other' });
    await expect(verifyAccessToken(t, { tenantId: TENANT, audience: AUD, jwks })).rejects.toBeDefined();
  });

  it('rejects an expired token', async () => {
    const { jwks, sign } = await setup();
    const t = await sign({ oid: 'o', tid: TENANT }, { exp: '-1m' });
    await expect(verifyAccessToken(t, { tenantId: TENANT, audience: AUD, jwks })).rejects.toBeDefined();
  });

  it('rejects a foreign issuer', async () => {
    const { jwks, sign } = await setup();
    const t = await sign({ oid: 'o', tid: TENANT }, { iss: 'https://login.microsoftonline.com/other/v2.0' });
    await expect(verifyAccessToken(t, { tenantId: TENANT, audience: AUD, jwks })).rejects.toBeDefined();
  });

  it('accepts a v1 issuer', async () => {
    const { jwks, sign } = await setup();
    const t = await sign({ oid: 'o', tid: TENANT }, { iss: V1 });
    await expect(verifyAccessToken(t, { tenantId: TENANT, audience: AUD, jwks })).resolves.toMatchObject({ oid: 'o' });
  });

  it('rejects a token without oid', async () => {
    const { jwks, sign } = await setup();
    const t = await sign({ tid: TENANT });
    await expect(verifyAccessToken(t, { tenantId: TENANT, audience: AUD, jwks })).rejects.toBeDefined();
  });
});
