import type { RequestHandler } from 'express';
import type { ServerConfig } from '../config';
import { verifyAccessToken } from './verifyToken';
import type { TokenClaims, VerifyOptions } from './verifyToken';

export type VerifyFn = (token: string, opts: Pick<VerifyOptions, 'tenantId' | 'audience' | 'clientId'>) => Promise<TokenClaims>;

export function authMiddleware(cfg: ServerConfig, verify: VerifyFn = verifyAccessToken): RequestHandler {
  return async (req, res, next) => {
    const deny = (): void => {
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'unauthorized' });
    };
    const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
    if (!m) return deny();
    try {
      (req as { claims?: unknown }).claims = await verify(m[1], { tenantId: cfg.tenantId, audience: cfg.apiAudience, clientId: cfg.clientId });
    } catch {
      return deny();
    }
    next();
  };
}
