import type { ToolContext } from '../domain/types';

export interface AuditEvent {
  time: string;
  correlationId: string;
  serverVersion: string;
  user: { oid: string | null; upn: string | null; spUserId: number };
  tool: string;
  args: unknown;
  outcome: 'ok' | 'needs_choice' | 'error';
  errorCode?: string;
  /** Per-day result arrays / item ids of write tools. Never prompt text. */
  detail?: unknown;
  tokenId: string | null;
}

export interface AuditSink {
  write(e: AuditEvent): void;
}

export class JsonLinesAuditSink implements AuditSink {
  constructor(private stream: NodeJS.WritableStream) {}
  write(e: AuditEvent): void {
    this.stream.write(JSON.stringify(e) + '\n');
  }
}

export class MemoryAuditSink implements AuditSink {
  events: AuditEvent[] = [];
  write(e: AuditEvent): void {
    this.events.push(e);
  }
}

export interface RequestMeta {
  correlationId: string;
  oid: string | null;
  upn: string | null;
  tokenId: string | null;
}

// lib/audit/audit.js and src/audit/audit.ts both resolve to the package root.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serverVersion: string = require('../../package.json').version;

const DETAIL_KEYS = ['booked', 'skipped', 'failed', 'removed', 'notFound'];

function detailOf(result: unknown): unknown {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;
  const d: Record<string, unknown> = {};
  for (const k of DETAIL_KEYS) if (k in r) d[k] = r[k];
  return Object.keys(d).length ? d : undefined;
}

export async function runTool<A, R>(
  name: string,
  ctx: ToolContext,
  meta: RequestMeta,
  sink: AuditSink,
  args: A,
  fn: (ctx: ToolContext, args: A) => Promise<R>
): Promise<R> {
  const base = {
    time: new Date().toISOString(),
    correlationId: meta.correlationId,
    serverVersion,
    user: { oid: meta.oid, upn: meta.upn, spUserId: ctx.viewer.user.id },
    tool: name,
    args,
    tokenId: meta.tokenId
  };
  const emit = (e: AuditEvent): void => {
    try {
      sink.write(e);
    } catch (err) {
      process.stderr.write(`audit sink write failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  };
  let result: R;
  try {
    result = await fn(ctx, args);
  } catch (err) {
    const code = err && typeof err === 'object' && (err as { name?: string }).name === 'ToolError'
      ? String((err as { code: unknown }).code)
      : 'internal';
    emit({ ...base, outcome: 'error', errorCode: code });
    throw err;
  }
  const detail = detailOf(result);
  const status = (result as { status?: unknown } | null)?.status;
  emit({
    ...base,
    outcome: status === 'needs_choice' ? 'needs_choice' : 'ok',
    ...(detail !== undefined ? { detail } : {})
  });
  return result;
}
