import express from 'express';
import type { RequestHandler, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ServerConfig } from '../config';
import type { AuditSink } from '../audit/audit';
import type { AuthedRequest, ContextFactory } from '../context/contextFactory';
import { createMcpServer } from '../mcp/createMcpServer';

export interface AppOptions {
  /** Token validation (Task 10). Runs before /mcp; must set req.claims or end the response. */
  authMiddleware?: RequestHandler;
}

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
          headers: req.headers
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
    try {
      const { ctx, meta } = await contexts(req as AuthedRequest);
      const server = createMcpServer(ctx, meta, sink);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error.' }, id: null });
      }
    }
  });
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  return app;
}
