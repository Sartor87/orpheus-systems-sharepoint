import request from 'supertest';
import { createApp } from '../http/app';
import { loadConfig } from '../config';
import { localContextFactory } from '../context/contextFactory';
import { MemoryAuditSink } from '../audit/audit';
import { authMiddleware } from '../auth/authMiddleware';
import { AuthRequiredError } from '../auth/errors';

const cfg = loadConfig({
  AUTH_MODE: 'entra', DATA_MODE: 'local', TENANT_ID: 't-1', CLIENT_ID: 'c-1', API_AUDIENCE: 'api://x'
});
const claims = { oid: 'o', upn: null, tid: 't-1', uti: null, raw: 'tok' };
const init = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } }
};
const ACCEPT = 'application/json, text/event-stream';

describe('authMiddleware', () => {
  it('401 + WWW-Authenticate without a bearer header', async () => {
    const verify = jest.fn();
    const app = createApp(cfg, localContextFactory(cfg), new MemoryAuditSink(), { authMiddleware: authMiddleware(cfg, verify) });
    const r = await request(app).post('/mcp').set('Accept', ACCEPT).send(init);
    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toMatch(/^Bearer/);
    expect(r.body).toEqual({ error: 'unauthorized' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('401 when verify throws, without leaking detail', async () => {
    const verify = jest.fn().mockRejectedValue(new Error('secret detail'));
    const app = createApp(cfg, localContextFactory(cfg), new MemoryAuditSink(), { authMiddleware: authMiddleware(cfg, verify) });
    const r = await request(app).post('/mcp').set('Authorization', 'Bearer bad').set('Accept', ACCEPT).send(init);
    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toMatch(/^Bearer/);
    expect(JSON.stringify(r.body)).not.toContain('secret');
  });

  it('passes through and sets req.claims when valid', async () => {
    const verify = jest.fn().mockResolvedValue(claims);
    const seen: unknown[] = [];
    const app = createApp(
      cfg,
      async req => { seen.push(req.claims); return localContextFactory(cfg)(req); },
      new MemoryAuditSink(),
      { authMiddleware: authMiddleware(cfg, verify) }
    );
    const r = await request(app).post('/mcp').set('Authorization', 'Bearer good').set('Accept', ACCEPT).send(init);
    expect(r.status).toBe(200);
    expect(verify).toHaveBeenCalledWith('good', { tenantId: 't-1', audience: 'api://x' });
    expect(seen).toEqual([claims]);
  });

  it('maps AuthRequiredError from the context factory to 401 + WWW-Authenticate', async () => {
    const verify = jest.fn().mockResolvedValue(claims);
    const app = createApp(
      cfg,
      async () => { throw new AuthRequiredError('consent'); },
      new MemoryAuditSink(),
      { authMiddleware: authMiddleware(cfg, verify) }
    );
    const r = await request(app).post('/mcp').set('Authorization', 'Bearer good').set('Accept', ACCEPT).send(init);
    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toMatch(/^Bearer/);
  });
});
