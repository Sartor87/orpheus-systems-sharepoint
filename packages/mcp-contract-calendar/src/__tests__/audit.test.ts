import { Writable } from 'stream';
import { JsonLinesAuditSink, MemoryAuditSink, runTool } from '../audit/audit';
import type { AuditEvent, AuditSink, RequestMeta } from '../audit/audit';
import { ToolError } from '../tools/dateRange';
import type { ToolContext } from '../domain/types';

const ctx = { viewer: { user: { id: 42 }, roles: [] } } as unknown as ToolContext;
const meta: RequestMeta = { correlationId: 'c-1', oid: 'oid-1', upn: '<upn>', tokenId: 'tok-1' };

describe('runTool', () => {
  it('writes one ok event', async () => {
    const sink = new MemoryAuditSink();
    const r = await runTool('get_calendar', ctx, meta, sink, { a: 1 }, async () => ({ big: 'payload' }));
    expect(r).toEqual({ big: 'payload' });
    expect(sink.events).toHaveLength(1);
    const e = sink.events[0];
    expect(e).toMatchObject({
      tool: 'get_calendar', args: { a: 1 }, outcome: 'ok', correlationId: 'c-1', tokenId: 'tok-1',
      user: { oid: 'oid-1', upn: '<upn>', spUserId: 42 }
    });
    expect(e.serverVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(new Date(e.time).toISOString()).toBe(e.time);
    expect(e.detail).toBeUndefined();
  });

  it('copies per-day arrays into detail for write results', async () => {
    const sink = new MemoryAuditSink();
    await runTool('book_days', ctx, meta, sink, {}, async () => ({
      status: 'done', booked: ['2026-01-01'], skipped: [], failed: [], totals: { x: 1 }
    }));
    expect(sink.events[0].detail).toEqual({ booked: ['2026-01-01'], skipped: [], failed: [] });
  });

  it('records error and rethrows', async () => {
    const sink = new MemoryAuditSink();
    const err = new ToolError('forbidden', 'no');
    await expect(runTool('t', ctx, meta, sink, {}, async () => { throw err; })).rejects.toBe(err);
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({ outcome: 'error', errorCode: 'forbidden' });
  });

  it('uses internal for unknown errors', async () => {
    const sink = new MemoryAuditSink();
    await expect(runTool('t', ctx, meta, sink, {}, async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(sink.events[0]).toMatchObject({ outcome: 'error', errorCode: 'internal' });
  });

  it('marks needs_choice', async () => {
    const sink = new MemoryAuditSink();
    await runTool('t', ctx, meta, sink, {}, async () => ({ status: 'needs_choice' }));
    expect(sink.events[0].outcome).toBe('needs_choice');
  });

  it('survives a throwing sink', async () => {
    const sink: AuditSink = { write: (_e: AuditEvent) => { throw new Error('disk'); } };
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await expect(runTool('t', ctx, meta, sink, {}, async () => 5)).resolves.toBe(5);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('JsonLinesAuditSink', () => {
  it('writes parseable single lines', () => {
    const chunks: string[] = [];
    const stream = new Writable({ write(c, _e, cb) { chunks.push(c.toString()); cb(); } });
    const sink = new JsonLinesAuditSink(stream);
    const e = { time: 't', args: { s: 'a\nb' } } as unknown as AuditEvent;
    sink.write(e);
    sink.write(e);
    const text = chunks.join('');
    const lines = text.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('');
    expect(JSON.parse(lines[0])).toEqual(e);
  });
});
