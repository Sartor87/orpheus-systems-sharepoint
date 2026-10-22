import { DateKey, Holiday, isBlocked, isWithin } from '@orpheussystems/shared-core';
import { beyondSlop, datesBetween, eligibleDates, rangeMode } from '../rangeSelection';

describe('datesBetween', () => {
  it('lists every day from the first to the last key, inclusive and ascending, across months', () => {
    expect(datesBetween('2027-01-28', '2027-02-03')).toEqual([
      '2027-01-28', '2027-01-29', '2027-01-30', '2027-01-31', '2027-02-01', '2027-02-02', '2027-02-03'
    ]);
  });

  it('does not depend on the argument order', () => {
    expect(datesBetween('2027-02-03', '2027-01-28')).toEqual(datesBetween('2027-01-28', '2027-02-03'));
  });

  it('returns the single day when both ends are the same', () => {
    expect(datesBetween('2026-11-03', '2026-11-03')).toEqual(['2026-11-03']);
  });

  it('crosses a year boundary', () => {
    expect(datesBetween('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
});

describe('eligibleDates', () => {
  const holidays: Holiday[] = [
    { id: 1, title: 'Christmas Eve', date: '2026-12-24', country: 'BG', source: 'Manual' },
    { id: 2, title: 'Somewhere else', date: '2026-12-22', country: 'RO', source: 'Manual' },
    { id: 3, title: 'New Year', date: '2027-01-01', country: '*', source: 'Manual' }
  ];
  const blocked = (d: DateKey): boolean =>
    !isWithin(d, '2026-02-02', '2026-12-31') || isBlocked(d, holidays, 'BG', true);

  it('drops weekends, holidays for the country or "*", and days outside the period', () => {
    expect(eligibleDates(datesBetween('2026-12-21', '2027-01-04'), blocked)).toEqual([
      '2026-12-21', '2026-12-22', '2026-12-23', // 22nd is a holiday for another country only
      '2026-12-25', // 24th holiday; 26th/27th weekend
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31' // 2027 is outside the period
    ]);
  });

  it('keeps the order of the input', () => {
    expect(eligibleDates(['2026-11-05', '2026-11-03'], blocked)).toEqual(['2026-11-05', '2026-11-03']);
  });
});

describe('rangeMode', () => {
  it('erases when the anchor already holds the selected type', () => {
    expect(rangeMode('OffSiteFull', 'OffSiteFull')).toBe('erase');
  });

  it('paints when the anchor is empty or holds another type', () => {
    expect(rangeMode(undefined, 'OffSiteFull')).toBe('paint');
    expect(rangeMode('OnSiteHalf', 'OffSiteFull')).toBe('paint');
  });
});

describe('beyondSlop', () => {
  it('is false while the pointer stays within the slop radius, inclusive', () => {
    expect(beyondSlop({ x: 10, y: 10 }, { x: 15, y: 15 })).toBe(false);
    expect(beyondSlop({ x: 0, y: 0 }, { x: 0, y: 8 })).toBe(false);
  });

  it('is true once the pointer moves further than the slop in any direction', () => {
    expect(beyondSlop({ x: 0, y: 0 }, { x: 0, y: 9 })).toBe(true);
    expect(beyondSlop({ x: 0, y: 0 }, { x: -6, y: -6 })).toBe(true);
    expect(beyondSlop({ x: 0, y: 0 }, { x: 3, y: 0 }, 2)).toBe(true);
  });
});
