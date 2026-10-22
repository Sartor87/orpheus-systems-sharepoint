import { createWriteStream } from 'fs';
import { loadConfig } from './config';
import { JsonLinesAuditSink } from './audit/audit';
import { localContextFactory, sharePointContextFactory } from './context/contextFactory';
import type { ContextFactory } from './context/contextFactory';
import { createApp } from './http/app';
import { authMiddleware } from './auth/authMiddleware';

function main(): void {
  const cfg = loadConfig(process.env);
  const sink = new JsonLinesAuditSink(
    cfg.auditLogPath ? createWriteStream(cfg.auditLogPath, { flags: 'a' }) : process.stdout
  );

  const contexts: ContextFactory = cfg.dataMode === 'local' ? localContextFactory(cfg) : sharePointContextFactory(cfg);
  // createApp refuses to serve entra mode without the middleware, so auth cannot be skipped by accident.
  const app = createApp(cfg, contexts, sink, cfg.authMode === 'entra' ? { authMiddleware: authMiddleware(cfg) } : {});

  app.listen(cfg.port, () => {
    process.stdout.write(
      JSON.stringify({ event: 'listening', port: cfg.port, authMode: cfg.authMode, dataMode: cfg.dataMode }) + '\n'
    );
  });
}

main();
