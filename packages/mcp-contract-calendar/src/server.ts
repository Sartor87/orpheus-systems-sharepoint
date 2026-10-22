import { createWriteStream } from 'fs';
import { loadConfig } from './config';
import { JsonLinesAuditSink } from './audit/audit';
import { localContextFactory } from './context/contextFactory';
import type { ContextFactory } from './context/contextFactory';
import { createApp } from './http/app';

function main(): void {
  const cfg = loadConfig(process.env);
  const sink = new JsonLinesAuditSink(
    cfg.auditLogPath ? createWriteStream(cfg.auditLogPath, { flags: 'a' }) : process.stdout
  );

  let contexts: ContextFactory;
  if (cfg.dataMode === 'local') {
    contexts = localContextFactory(cfg);
  } else {
    // SharePoint context factory and Entra auth middleware arrive in Task 10.
    throw new Error('DATA_MODE=sharepoint is not wired yet.');
  }

  createApp(cfg, contexts, sink).listen(cfg.port, () => {
    process.stdout.write(
      JSON.stringify({ event: 'listening', port: cfg.port, authMode: cfg.authMode, dataMode: cfg.dataMode }) + '\n'
    );
  });
}

main();
