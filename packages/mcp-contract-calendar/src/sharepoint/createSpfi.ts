import { spfi, DefaultHeaders, DefaultInit } from '@pnp/sp';
import type { SPFI } from '@pnp/sp';
import { BearerToken, DefaultParse } from '@pnp/queryable';
import { NodeFetchWithRetry } from '@pnp/nodejs';

/** One SPFI per request, authenticated with the user's on-behalf-of SharePoint token. */
export function createSpfi(siteUrl: string, accessToken: string): SPFI {
  return spfi(siteUrl).using(DefaultHeaders(), DefaultInit(), NodeFetchWithRetry(), DefaultParse(), BearerToken(accessToken));
}
