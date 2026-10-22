import { LocalDataService } from '@orpheussystems/shared-core';
import type { CalendarEntry, DateKey, Holiday, IDataService } from '@orpheussystems/shared-core';
import { bookDays } from '../tools/bookDays';
import { removeDays } from '../tools/removeDays';
import type { ToolContext } from '../domain/types';
import { localContext } from './localContext';

class FailingDelete implements IDataService {
  constructor(private inner: LocalDataService, private failDate: DateKey) {}
  getCurrentUser() { return this.inner.getCurrentUser(); }
  getMyContracts() { return this.inner.getMyContracts(); }
  getEntries(id: number, from: DateKey, to: DateKey) { return this.inner.getEntries(id, from, to); }
  upsertEntry(e: CalendarEntry): Promise<CalendarEntry> { return this.inner.upsertEntry(e); }
  deleteEntry(id: number, d: DateKey) {
    if (d === this.failDate) return Promise.reject(new Error('SharePoint 500'));
    return this.inner.deleteEntry(id, d);
  }
  getHolidays(c: string, from: DateKey, to: DateKey): Promise<Holiday[]> { return this.inner.getHolidays(c, from, to); }
}

const range = { from: '2026-11-02', to: '2026-11-04', contractId: 1 };

describe('removeDays', () => {
  it('removes booked days, then reports them as notFound', async () => {
    const ctx = await localContext(1);
    await bookDays(ctx, range);
    const before = await ctx.data.getEntries(1, range.from, range.to);
    const r = await removeDays(ctx, range);
    expect(r.removed).toEqual(before.map(e => ({ date: e.date, entryId: e.id })));
    expect(r.removed.map(x => x.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(r.removed.every(x => typeof x.entryId === 'number')).toBe(true);
    expect(r.notFound).toEqual([]);
    expect(r.failed).toEqual([]);
    expect(await ctx.data.getEntries(1, range.from, range.to)).toEqual([]);
    const again = await removeDays(ctx, range);
    expect(again.removed).toEqual([]);
    expect(again.notFound).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('returns totals and remaining', async () => {
    const ctx = await localContext(1);
    await bookDays(ctx, range);
    const r = await removeDays(ctx, { ...range, to: '2026-11-02' });
    expect(r.totals).toBeDefined();
    expect(r.remaining).toBeDefined();
  });

  it('manager cannot remove', async () => {
    const ctx = await localContext(3);
    await expect(removeDays(ctx, range)).rejects.toMatchObject({
      code: 'forbidden',
      message: 'Only contractors can remove days.'
    });
  });

  it("someone else's contract is not found", async () => {
    const ctx = await localContext(2);
    await expect(removeDays(ctx, range)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('closed contract refused', async () => {
    const ctx = await localContext(1);
    await expect(removeDays(ctx, { ...range, contractId: 4 })).rejects.toMatchObject({
      code: 'forbidden',
      message: 'You can only change your own active contracts.'
    });
  });

  it('bad range is invalid_input', async () => {
    const ctx = await localContext(1);
    await expect(removeDays(ctx, { ...range, from: '2026-11-10' })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('delete failure goes to failed, never removed', async () => {
    const base = await localContext(1);
    await bookDays(base, range);
    const ctx: ToolContext = { ...base, data: new FailingDelete(base.data as LocalDataService, '2026-11-03') };
    const r = await removeDays(ctx, range);
    expect(r.removed.map(x => x.date)).toEqual(['2026-11-02', '2026-11-04']);
    expect(r.failed).toEqual([{ date: '2026-11-03', error: 'SharePoint 500' }]);
    expect(r.notFound).toEqual([]);
  });
});
