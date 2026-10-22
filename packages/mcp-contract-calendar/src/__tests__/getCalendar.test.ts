import { LocalDataService, computeTotals } from '@orpheussystems/shared-core';
import { getCalendar } from '../tools/getCalendar';
import { getHolidays } from '../tools/getHolidays';
import { localContext } from './localContext';

describe('getCalendar', () => {
  it('contractor reads own calendar with totals', async () => {
    const ctx = await localContext(1);
    const r = await getCalendar(ctx, { contractId: 1, from: '2026-02-01', to: '2026-02-28' });
    const expected = await new LocalDataService({ demoUserId: 1 }).getEntries(1, '2026-02-01', '2026-02-28');
    expect(r.entries.length).toBe(expected.length);
    expect(r.periodTotals).toEqual(computeTotals(expected));
    expect(r.contract.id).toBe(1);
  });

  it("someone else's contract is not found", async () => {
    const ctx = await localContext(2);
    await expect(getCalendar(ctx, { contractId: 1, from: '2026-02-01', to: '2026-02-28' })).rejects.toMatchObject({
      code: 'not_found',
      message: 'Contract 1 not found.'
    });
  });

  it('manager sees contractor calendar', async () => {
    const ctx = await localContext(3);
    const r = await getCalendar(ctx, { contractId: 3, from: '2026-02-01', to: '2026-02-28' });
    expect(r.contract.id).toBe(3);
  });
});

describe('getHolidays', () => {
  it('holidays need a 2-letter country', async () => {
    const ctx = await localContext(1);
    await expect(getHolidays(ctx, { country: 'BGR', from: '2026-01-01', to: '2026-12-31' })).rejects.toMatchObject({
      code: 'invalid_input'
    });
    const h = await getHolidays(ctx, { country: 'bg', from: '2026-01-01', to: '2026-12-31' });
    expect(h.some(x => x.date === '2026-03-03' && x.country === 'BG')).toBe(true);
    expect(h.length).toBeGreaterThan(0);
  });
});
