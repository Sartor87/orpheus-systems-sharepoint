import request from 'supertest';
import type { Server } from 'http';
import { AddressInfo } from 'net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../http/app';
import { loadConfig } from '../config';
import { localContextFactory } from '../context/contextFactory';
import { MemoryAuditSink } from '../audit/audit';

const cfg = loadConfig({ AUTH_MODE: 'none', DATA_MODE: 'local', LOCAL_USER_ID: '1' });
const mk = (opts?: Parameters<typeof createApp>[3]) =>
  createApp(cfg, localContextFactory(cfg), new MemoryAuditSink(), opts);

const init = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } }
};
const ACCEPT = 'application/json, text/event-stream';

describe('app', () => {
  it('GET /healthz', async () => {
    const r = await request(mk()).get('/healthz');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  it('POST /mcp initialize', async () => {
    const r = await request(mk()).post('/mcp').set('Accept', ACCEPT).send(init);
    expect(r.status).toBe(200);
  });

  it('GET and DELETE /mcp are 405', async () => {
    expect((await request(mk()).get('/mcp')).status).toBe(405);
    expect((await request(mk()).delete('/mcp')).status).toBe(405);
  });

  it('runs the authMiddleware slot before /mcp', async () => {
    const app = mk({
      authMiddleware: (_req, res) => {
        res.status(401).json({ error: 'no' });
      }
    });
    const r = await request(app).post('/mcp').set('Accept', ACCEPT).send(init);
    expect(r.status).toBe(401);
  });

  it('refuses to build an entra app without authMiddleware', () => {
    const entra = { ...cfg, authMode: 'entra' as const };
    expect(() => createApp(entra, localContextFactory(cfg), new MemoryAuditSink())).toThrow(/authMiddleware/);
    expect(() =>
      createApp(entra, localContextFactory(cfg), new MemoryAuditSink(), { authMiddleware: (_q, _s, next) => next() })
    ).not.toThrow();
  });

  it('redacts credentials in the first-request header log', async () => {
    const lines: string[] = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(((s: string) => {
      lines.push(String(s));
      return true;
    }) as never);
    try {
      const app = createApp({ ...cfg, logRequestHeaders: true }, localContextFactory(cfg), new MemoryAuditSink());
      await request(app)
        .post('/mcp')
        .set('Accept', ACCEPT)
        .set('Authorization', 'Bearer SECRET-TOKEN')
        .set('Cookie', 'sid=SECRET-COOKIE')
        .set('X-MS-TOKEN-AAD-ID-TOKEN', 'SECRET-EASYAUTH')
        .set('User-Agent', 'ua-test')
        .send(init);
    } finally {
      spy.mockRestore();
    }
    const logged = lines.find(l => l.includes('first_request')) ?? '';
    expect(logged).toContain('ua-test');
    expect(logged).toContain('authorization');
    expect(logged).not.toMatch(/SECRET/);
  });

  describe('end to end over HTTP', () => {
    let server: Server;
    let client: Client;

    afterAll(async () => {
      await client?.close();
      await new Promise(res => (server ? server.close(res) : res(undefined)));
    });

    it('SDK client lists tools and books 5 days', async () => {
      server = mk().listen(0);
      const { port } = server.address() as AddressInfo;
      client = new Client({ name: 't', version: '0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
      expect((await client.listTools()).tools).toHaveLength(6);
      const r = await client.callTool({ name: 'book_days', arguments: { from: '2026-11-02', to: '2026-11-06' } });
      const body = JSON.parse((r.content as Array<{ text: string }>)[0].text);
      expect(body.status).toBe('done');
      expect(body.booked).toHaveLength(5);
    });
  });
});
