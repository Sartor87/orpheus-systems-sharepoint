import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { LocalDataService, toDateKey } from '@orpheussystems/shared-core';
import type { ServerConfig } from '../config';
import type { RequestMeta } from '../audit/audit';
import type { ToolContext } from '../domain/types';
import { buildLocalDirectory } from './localDirectory';

/** Express request that may carry validated token claims (set by the Entra middleware, Task 10). */
export type AuthedRequest = Request & { claims?: unknown };

export type ContextFactory = (req: AuthedRequest) => Promise<{ ctx: ToolContext; meta: RequestMeta }>;

/**
 * Local mode: one in-memory data service per process, so state survives across requests
 * (book, then read back). The acting user is cfg.localUserId.
 */
export function localContextFactory(cfg: ServerConfig): ContextFactory {
  const data = new LocalDataService({ demoUserId: cfg.localUserId });
  const directory = buildLocalDirectory();
  return async () => {
    const me = await data.getCurrentUser();
    return {
      ctx: {
        viewer: {
          user: { id: me.id, loginName: me.loginName, displayName: me.displayName, email: me.email },
          roles: me.roles
        },
        data,
        directory,
        today: toDateKey(new Date())
      },
      meta: { correlationId: randomUUID(), oid: null, upn: null, tokenId: null }
    };
  };
}
