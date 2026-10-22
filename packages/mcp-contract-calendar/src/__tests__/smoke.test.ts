import { computeTotals } from '@orpheussystems/shared-core';

describe('smoke', () => {
  it('loads shared-core pure code', () => {
    expect(computeTotals([]).totalDays).toBe(0);
  });
});
