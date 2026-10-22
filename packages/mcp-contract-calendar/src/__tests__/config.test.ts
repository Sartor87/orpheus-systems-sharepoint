import { loadConfig } from '../config';

describe('loadConfig', () => {
  it('applies defaults in local mode', () => {
    const cfg = loadConfig({ AUTH_MODE: 'none', DATA_MODE: 'local' });
    expect(cfg.port).toBe(8787);
    expect(cfg.localUserId).toBe(1);
    expect(cfg.lists).toEqual({ contracts: 'Lists/Contracts', entries: 'Lists/CalendarEntries', holidays: 'Lists/Holidays' });
    expect(cfg.hrGroup).toBe('Orpheus HR');
    expect(cfg.auditLogPath).toBeNull();
    expect(cfg.logRequestHeaders).toBe(false);
  });
  it('rejects anonymous SharePoint access', () => {
    expect(() => loadConfig({ AUTH_MODE: 'none', DATA_MODE: 'sharepoint' })).toThrow(/anonymous/i);
  });
  it('requires Entra values in entra mode', () => {
    expect(() => loadConfig({ AUTH_MODE: 'entra', DATA_MODE: 'local', TENANT_ID: 't', CLIENT_ID: 'c' })).toThrow(/API_AUDIENCE/);
  });
  it('accepts a complete entra config', () => {
    const cfg = loadConfig({
      AUTH_MODE: 'entra', DATA_MODE: 'sharepoint', SITE_URL: 'https://x', TENANT_ID: 't', CLIENT_ID: 'c',
      CLIENT_SECRET: 's', API_AUDIENCE: 'api://a', SP_SCOPE: 'https://x/.default', LOG_REQUEST_HEADERS: 'true'
    });
    expect(cfg.authMode).toBe('entra');
    expect(cfg.logRequestHeaders).toBe(true);
  });
});
