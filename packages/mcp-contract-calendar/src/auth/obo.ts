import { ConfidentialClientApplication } from '@azure/msal-node';
import type { ServerConfig } from '../config';
import { AuthRequiredError } from './errors';
export { AuthRequiredError };

let cached: { key: string; app: ConfidentialClientApplication } | null = null;

function clientFor(cfg: ServerConfig): ConfidentialClientApplication {
  const key = `${cfg.tenantId}|${cfg.clientId}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      app: new ConfidentialClientApplication({
        auth: {
          clientId: cfg.clientId,
          clientSecret: cfg.clientSecret,
          authority: `https://login.microsoftonline.com/${cfg.tenantId}`
        }
      })
    };
  }
  return cached.app;
}

/** Exchanges the caller's API token for a SharePoint token (on-behalf-of). */
export async function acquireSharePointToken(cfg: ServerConfig, userToken: string): Promise<string> {
  try {
    const r = await clientFor(cfg).acquireTokenOnBehalfOf({ oboAssertion: userToken, scopes: [cfg.spScope] });
    if (!r?.accessToken) throw new AuthRequiredError('No SharePoint token returned.');
    return r.accessToken;
  } catch (err) {
    if (err instanceof AuthRequiredError) throw err;
    const e = err as { errorCode?: string; name?: string };
    if (e.errorCode === 'interaction_required' || e.errorCode === 'invalid_grant' || e.name === 'InteractionRequiredAuthError') {
      throw new AuthRequiredError();
    }
    throw err;
  }
}
