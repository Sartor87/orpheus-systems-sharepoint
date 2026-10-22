import express from 'express';
import type { RequestHandler, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ServerConfig } from '../config';
import type { AuditSink } from '../audit/audit';
import type { AuthedRequest, ContextFactory } from '../context/contextFactory';
import { createMcpServer } from '../mcp/createMcpServer';
import { randomUUID } from 'crypto';
import { AuthRequiredError } from '../auth/errors';
import { logError } from '../log/errorLog';

export interface AppOptions {
  /** Token validation (Task 10). Runs before /mcp; must set req.claims or end the response. */
  authMiddleware?: RequestHandler;
}

const SENSITIVE = new Set(['authorization', 'cookie', 'set-cookie', 'proxy-authorization']);

/** Header names are kept, values of credentials are replaced. */
export function redactHeaders(h: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(h)) {
    const n = k.toLowerCase();
    out[k] = SENSITIVE.has(n) || n.startsWith('x-ms-token') ? '[redacted]' : v;
  }
  return out;
}

const firstHeader = (req: express.Request, name: string): string | null => {
  const v = req.headers[name];
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : null;
};

/** Same precedence as the context factory, so the log line matches the audit trail. */
const correlationIdOf = (req: express.Request): string =>
  firstHeader(req, 'x-ms-correlation-id') ?? firstHeader(req, 'request-id') ?? randomUUID();

const methodNotAllowed = (_req: express.Request, res: Response): void => {
  res
    .status(405)
    .set('Allow', 'POST')
    .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
};

export function createApp(
  cfg: ServerConfig,
  contexts: ContextFactory,
  sink: AuditSink,
  opts: AppOptions = {}
): express.Express {
  if (cfg.authMode === 'entra' && !opts.authMiddleware) {
    throw new Error('AUTH_MODE=entra requires an authMiddleware; refusing to serve /mcp unauthenticated.');
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  let headersLogged = false;
  const logFirstRequest: RequestHandler = (req, _res, next) => {
    if (cfg.logRequestHeaders && !headersLogged) {
      headersLogged = true;
      process.stdout.write(
        JSON.stringify({
          event: 'first_request',
          ip: req.ip,
          userAgent: req.get('user-agent') ?? null,
          headers: redactHeaders(req.headers)
        }) + '\n'
      );
    }
    next();
  };

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  const chain: RequestHandler[] = [logFirstRequest];
  if (opts.authMiddleware) chain.push(opts.authMiddleware);

  app.post('/mcp', ...chain, async (req, res) => {
    let correlationId: string | null = null;
    try {
      const { ctx, meta } = await contexts(req as AuthedRequest);
      correlationId = meta.correlationId;
      const server = createMcpServer(ctx, meta, sink);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (err instanceof AuthRequiredError && !res.headersSent) {
        res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'unauthorized' });
        return;
      }
      logError(correlationId ?? correlationIdOf(req), 'http:/mcp', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error.' }, id: null });
      }
    }
  });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  return app;
}
