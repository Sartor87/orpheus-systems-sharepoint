export interface ServerConfig {
  port: number;
  authMode: 'entra' | 'none';
  dataMode: 'sharepoint' | 'local';
  localUserId: number;
  siteUrl: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  apiAudience: string;
  spScope: string;
  lists: { contracts: string; entries: string; holidays: string };
  hrGroup: string;
  auditLogPath: string | null;
  logRequestHeaders: boolean;
}

function oneOf<T extends string>(name: string, v: string | undefined, allowed: readonly T[], dflt: T): T {
  if (v === undefined || v === '') return dflt;
  if (!(allowed as readonly string[]).includes(v)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')} (got "${v}").`);
  }
  return v as T;
}

function int(name: string, v: string | undefined, dflt: number): number {
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer (got "${v}").`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const s = (k: string, dflt = ''): string => (env[k] !== undefined && env[k] !== '' ? (env[k] as string) : dflt);
  const cfg: ServerConfig = {
    port: int('PORT', env.PORT, 8787),
    // Fail closed: a missing AUTH_MODE means real token validation.
    authMode: oneOf('AUTH_MODE', env.AUTH_MODE, ['entra', 'none'] as const, 'entra'),
    dataMode: oneOf('DATA_MODE', env.DATA_MODE, ['sharepoint', 'local'] as const, 'sharepoint'),
    localUserId: int('LOCAL_USER_ID', env.LOCAL_USER_ID, 1),
    siteUrl: s('SITE_URL'),
    tenantId: s('TENANT_ID'),
    clientId: s('CLIENT_ID'),
    clientSecret: s('CLIENT_SECRET'),
    apiAudience: s('API_AUDIENCE'),
    spScope: s('SP_SCOPE'),
    lists: {
      contracts: s('CONTRACTS_LIST_URL', 'Lists/Contracts'),
      entries: s('ENTRIES_LIST_URL', 'Lists/CalendarEntries'),
      holidays: s('HOLIDAYS_LIST_URL', 'Lists/Holidays')
    },
    hrGroup: s('HR_GROUP', 'Orpheus HR'),
    auditLogPath: s('AUDIT_LOG_PATH') || null,
    logRequestHeaders: s('LOG_REQUEST_HEADERS', 'false').toLowerCase() === 'true'
  };

  if (cfg.authMode === 'none' && cfg.dataMode === 'sharepoint') {
    throw new Error('AUTH_MODE=none with DATA_MODE=sharepoint is not allowed: no anonymous SharePoint access.');
  }
  const missing: string[] = [];
  if (cfg.authMode === 'entra') {
    if (!cfg.tenantId) missing.push('TENANT_ID');
    if (!cfg.clientId) missing.push('CLIENT_ID');
    if (!cfg.apiAudience) missing.push('API_AUDIENCE');
  }
  if (cfg.dataMode === 'sharepoint') {
    if (!cfg.siteUrl) missing.push('SITE_URL');
    if (!cfg.tenantId) missing.push('TENANT_ID');
    if (!cfg.clientId) missing.push('CLIENT_ID');
    if (!cfg.clientSecret) missing.push('CLIENT_SECRET');
    if (!cfg.spScope) missing.push('SP_SCOPE');
  }
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${[...new Set(missing)].join(', ')}.`);
  }
  return cfg;
}
