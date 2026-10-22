import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { LocalDataService, toDateKey } from '@orpheussystems/shared-core';
import type { Role, UserRef } from '@orpheussystems/shared-core';
import type { TokenClaims } from '../auth/verifyToken';
import type { ServerConfig } from '../config';
import type { RequestMeta } from '../audit/audit';
import type { ToolContext } from '../domain/types';
import { buildLocalDirectory } from './localDirectory';

/** Express request that may carry validated token claims (set by the Entra middleware). */
export type AuthedRequest = Request & { claims?: TokenClaims };

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

const headerOf = (req: AuthedRequest, name: string): string | null => {
  const v = req.headers[name];
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : null;
};

/**
 * SharePoint mode: every request runs as the signed-in user. Validated claims (set by the auth middleware)
 * are exchanged on-behalf-of for a SharePoint token; list ids are resolved once per process.
 * The SharePoint modules are loaded lazily so local mode never pulls in PnPjs.
 */
export function sharePointContextFactory(cfg: ServerConfig): ContextFactory {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { acquireSharePointToken } = require('../auth/obo') as typeof import('../auth/obo');
  const { createSpfi } = require('../sharepoint/createSpfi') as typeof import('../sharepoint/createSpfi');
  const { deriveAgentRoles } = require('../sharepoint/agentRoles') as typeof import('../sharepoint/agentRoles');
  const { SharePointContractDirectory } =
    require('../sharepoint/SharePointContractDirectory') as typeof import('../sharepoint/SharePointContractDirectory');
  const sharePoint = require('@orpheussystems/shared-core/sharepoint') as typeof import('@orpheussystems/shared-core/sharepoint');
  /* eslint-enable @typescript-eslint/no-var-requires */

  let listIds: Promise<{ contractsListId: string; entriesListId: string; holidaysListId: string }> | null = null;

  return async req => {
    const claims = req.claims as TokenClaims | undefined;
    if (!claims) throw new Error('SharePoint mode requires validated token claims.');

    const spToken = await acquireSharePointToken(cfg, claims.raw);
    const sp = createSpfi(cfg.siteUrl, spToken);

    if (!listIds) {
      listIds = Promise.all([
        sharePoint.resolveListIdByUrl(sp, cfg.lists.contracts),
        sharePoint.resolveListIdByUrl(sp, cfg.lists.entries),
        sharePoint.resolveListIdByUrl(sp, cfg.lists.holidays)
      ]).then(([contractsListId, entriesListId, holidaysListId]) => ({ contractsListId, entriesListId, holidaysListId }));
      listIds.catch(() => {
        listIds = null; // do not cache a failure
      });
    }
    const lists = await listIds;

    const me = (await sp.web.currentUser()) as { Id: number; Title: string; Email: string; LoginName: string };
    const agentRoles = await deriveAgentRoles(sp, lists, me.Id, cfg.hrGroup);
    const sharedRoles = agentRoles.filter((r): r is Role => r !== 'HR');
    const user: UserRef = { id: me.Id, loginName: me.LoginName, displayName: me.Title, email: me.Email };

    return {
      ctx: {
        viewer: { user, roles: agentRoles },
        data: new sharePoint.SharePointDataService(sp, lists, { ...user, roles: sharedRoles }),
        directory: new SharePointContractDirectory(sp, lists.contractsListId),
        today: toDateKey(new Date())
      },
      meta: {
        correlationId: headerOf(req, 'x-ms-correlation-id') ?? headerOf(req, 'request-id') ?? randomUUID(),
        oid: claims.oid,
        upn: claims.upn,
        tokenId: claims.uti
      }
    };
  };
}
