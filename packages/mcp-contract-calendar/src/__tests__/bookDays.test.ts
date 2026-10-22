import { LocalDataService } from '@orpheussystems/shared-core';
import type { CalendarEntry, DateKey, Holiday, IDataService } from '@orpheussystems/shared-core';
import { bookDays } from '../tools/bookDays';
import type { ToolContext } from '../domain/types';
import { localContext } from './localContext';

class FailingData implements IDataService {
  constructor(private inner: LocalDataService, private failDate: DateKey) {}
  getCurrentUser() { return this.inner.getCurrentUser(); }
  getMyContracts() { return this.inner.getMyContracts(); }
  getEntries(id: number, from: DateKey, to: DateKey) { return this.inner.getEntries(id, from, to); }
  upsertEntry(e: CalendarEntry): Promise<CalendarEntry> {
    if (e.date === this.failDate) return Promise.reject(new Error('SharePoint 500'));
    return this.inner.upsertEntry(e);
  }
  deleteEntry(id: number, d: DateKey) { return this.inner.deleteEntry(id, d); }
  getHolidays(c: string, from: DateKey, to: DateKey): Promise<Holiday[]> { return this.inner.getHolidays(c, from, to); }
}

describe('bookDays', () => {
  it('books business days and skips weekend', async () => {
    const ctx = await localContext(1);
    const r = await bookDays(ctx, { from: '2026-11-02', to: '2026-11-08' });
    if (r.status !== 'done') throw new Error('expected done');
    expect(r.booked.map(b => b.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(r.skipped).toEqual([
      { date: '2026-11-07', reason: 'weekend' },
      { date: '2026-11-08', reason: 'weekend' }
    ]);
    expect(r.failed).toEqual([]);
    expect(r.totals.length).toBe(1);
  });

  it('skips a holiday', async () => {
    const ctx = await localContext(1);
    const hs = await ctx.data.getHolidays('BG', '2026-12-24', '2026-12-25');
    const h = hs.find(x => x.date === '2026-12-24');
    expect(h).toBeDefined();
    const r = await bookDays(ctx, { from: '2026-12-24', to: '2026-12-24' });
    if (r.status !== 'done') throw new Error('expected done');
    expect(r.booked).toEqual([]);
    expect(r.skipped).toEqual([{ date: '2026-12-24', reason: 'holiday' }]);
  });

  it('overlap without contractId asks and writes nothing', async () => {
    const ctx = await localContext(1);
    const r = await bookDays(ctx, { from: '2027-02-08', to: '2027-02-10' });
    expect(r.status).toBe('needs_choice');
    if (r.status !== 'needs_choice') return;
    expect(r.candidates.length).toBe(2);
    expect(r.dates).toEqual(['2027-02-08', '2027-02-09', '2027-02-10']);
    for (const id of [1, 2]) {
      expect(await ctx.data.getEntries(id, '2027-02-08', '2027-02-10')).toEqual(
        await new LocalDataService({ demoUserId: 1 }).getEntries(id, '2027-02-08', '2027-02-10')
      );
    }
  });

  it('overlap with contractId moves, never duplicates', async () => {
    const ctx = await localContext(1);
    await bookDays(ctx, { from: '2027-02-08', to: '2027-02-08', contractId: 1 });
    const r = await bookDays(ctx, { from: '2027-02-08', to: '2027-02-08', contractId: 2 });
    expect(r.status).toBe('done');
    const a = await ctx.data.getEntries(1, '2027-02-08', '2027-02-08');
    const b = await ctx.data.getEntries(2, '2027-02-08', '2027-02-08');
    expect(a.length + b.length).toBe(1);
    expect(b.length).toBe(1);
  });

  it('manager cannot book', async () => {
    const ctx = await localContext(3);
    await expect(bookDays(ctx, { from: '2026-11-02', to: '2026-11-02' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('no-role viewer cannot book', async () => {
    const base = await localContext(1);
    const ctx: ToolContext = { ...base, viewer: { ...base.viewer, roles: [] } };
    await expect(bookDays(ctx, { from: '2026-11-02', to: '2026-11-02' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it("someone else's contract", async () => {
    const ctx = await localContext(2);
    await expect(bookDays(ctx, { from: '2026-11-02', to: '2026-11-02', contractId: 1 })).rejects.toMatchObject({
      code: 'not_found'
    });
  });

  it('closed contract refused', async () => {
    const ctx = await localContext(1);
    await expect(bookDays(ctx, { from: '2026-11-02', to: '2026-11-02', contractId: 4 })).rejects.toMatchObject({
      code: 'forbidden',
      message: 'You can only book on your own active contracts.'
    });
  });

  it('bad range writes nothing', async () => {
    const ctx = await localContext(1);
    await expect(bookDays(ctx, { from: '2026-11-10', to: '2026-11-01' })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('partial failure is reported per day', async () => {
    const base = await localContext(1);
    const ctx: ToolContext = { ...base, data: new FailingData(new LocalDataService({ demoUserId: 1 }), '2026-11-04') };
    const r = await bookDays(ctx, { from: '2026-11-02', to: '2026-11-06' });
    if (r.status !== 'done') throw new Error('expected done');
    expect(r.booked.map(b => b.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']);
    expect(r.failed).toEqual([{ date: '2026-11-04', error: 'SharePoint 500' }]);
  });

  it('defaults to on-site full day', async () => {
    const ctx = await localContext(1);
    await bookDays(ctx, { from: '2026-11-03', to: '2026-11-03' });
    const e = await ctx.data.getEntries(1, '2026-11-03', '2026-11-03');
    expect(e[0].type).toBe('OnSiteFull');
  });
});
