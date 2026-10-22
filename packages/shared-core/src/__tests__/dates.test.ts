import { toDateKey, isWeekend, daysInMonth, monthsBetween, addDays } from '../dates';

test('toDateKey uses local components, not UTC', () => {
  expect(toDateKey(new Date(2026, 10, 1, 23, 30))).toBe('2026-11-01');
});
test('isWeekend', () => { expect(isWeekend('2026-11-01')).toBe(true); expect(isWeekend('2026-11-02')).toBe(false); });
test('daysInMonth handles February and 30-day months', () => {
  expect(daysInMonth(2027, 2)).toBe(28); expect(daysInMonth(2028, 2)).toBe(29); expect(daysInMonth(2026, 11)).toBe(30);
});
test('monthsBetween is inclusive and crosses years', () => {
  expect(monthsBetween('2026-11-15', '2027-02-01')).toEqual([{year:2026,month:11},{year:2026,month:12},{year:2027,month:1},{year:2027,month:2}]);
});
test('addDays crosses month end', () => { expect(addDays('2026-11-30', 1)).toBe('2026-12-01'); });
