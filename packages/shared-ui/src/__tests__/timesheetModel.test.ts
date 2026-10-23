import { buildTimesheetModel, formatLongDate } from '../pdf/timesheetModel';
import { contract, e, labels } from './fixtures';

test('rows span the period and short months get na cells', () => {
  const m = buildTimesheetModel(contract({ startDate: '2027-01-15', latestExecutionDate: '2027-03-10' }), [], [], { from: '2027-01-15', to: '2027-03-10' }, labels);
  expect(m.pages[0].rows.map(r => r.label)).toEqual(['January 2027', 'February 2027', 'March 2027']);
  expect(m.pages[0].rows[1].cells.filter(c => c.kind === 'na').map(c => c.day)).toEqual([29, 30, 31]);
  expect(m.pages[0].rows.every(r => r.cells.length === 31)).toBe(true);
});
test('hours and colours per entry type, totals per row and grand', () => {
  const m = buildTimesheetModel(contract({ hoursPerDay: 8 }), [e('OnSiteFull', '2026-02-03', 1), e('OffSiteHalf', '2026-02-04', 1)], [], { from: '2026-02-01', to: '2026-02-28' }, labels);
  const r = m.pages[0].rows[0];
  expect(r.cells[2]).toEqual({ day: 3, hours: 8, kind: 'onsite' });
  expect(r.cells[3]).toEqual({ day: 4, hours: 4, kind: 'offsite' });
  expect(r).toMatchObject({ onSite: 1, offSite: 0.5, total: 1.5 });
  expect(m.grand).toEqual({ onSite: 1, offSite: 0.5, total: 1.5 });
});
test('paginates at 12 months', () => {
  const m = buildTimesheetModel(contract({ startDate: '2026-01-01', latestExecutionDate: '2027-03-31' }), [], [], { from: '2026-01-01', to: '2027-03-31' }, labels);
  expect(m.pages.map(p => p.rows.length)).toEqual([12, 3]);
});
test('weekends and holidays are blocked, header targets and remaining', () => {
  const m = buildTimesheetModel(contract({ onSiteTargetDays: 10, offSiteTargetDays: 5 }), [e('OnSiteFull', '2026-02-03', 1)], [{ title: 'H', date: '2026-02-05', country: '*', source: 'Manual' }], { from: '2026-02-01', to: '2026-02-28' }, labels);
  const c = m.pages[0].rows[0].cells;
  expect(c[0].kind).toBe('blocked'); // Sun 1 Feb
  expect(c[4].kind).toBe('blocked'); // holiday
  expect(c[5].kind).toBe('empty'); // Fri 6 Feb? weekday
  expect(m.header).toMatchObject({ targetOnSite: 10, targetOffSite: 5, targetTotal: 15, remainingOnSite: 9, remainingOffSite: 5, remainingTotal: 14 });
});
test('timesheet model marks weekends as not blocked when blockWeekends is false', () => {
  const hols = [{ title: 'H', date: '2026-02-05', country: '*', source: 'Manual' as const }];
  const m = buildTimesheetModel(contract(), [], hols, { from: '2026-02-01', to: '2026-02-28' }, labels, { blockWeekends: false });
  const c = m.pages[0].rows[0].cells;
  expect(c[0].kind).toBe('empty'); // Sun 1 Feb
  expect(c[4].kind).toBe('blocked'); // holiday stays blocked
});
test('remaining subtracts days before the period too', () => {
  const c = contract({ startDate: '2027-01-01', latestExecutionDate: '2027-03-31', onSiteTargetDays: 20, offSiteTargetDays: 10 });
  const jan = ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'].map(d => e('OnSiteFull', d));
  const feb = ['2027-02-01', '2027-02-02'].map(d => e('OnSiteFull', d));
  const m = buildTimesheetModel(c, [...jan, ...feb], [], { from: '2027-02-01', to: '2027-02-28' }, labels);
  expect(m.header).toMatchObject({ remainingOnSite: 20 - 7, remainingOffSite: 10, remainingTotal: 30 - 7 });
});
test('remaining ignores entries after the period end', () => {
  const c = contract({ startDate: '2027-01-01', latestExecutionDate: '2027-03-31', onSiteTargetDays: 20, offSiteTargetDays: 10 });
  const m = buildTimesheetModel(c, [e('OnSiteFull', '2027-02-01'), e('OnSiteFull', '2027-03-01')], [], { from: '2027-02-01', to: '2027-02-28' }, labels);
  expect(m.header.remainingOnSite).toBe(19);
});
test('grid shows only the period days', () => {
  const c = contract({ startDate: '2027-01-01', latestExecutionDate: '2027-03-31' });
  const m = buildTimesheetModel(c, [e('OnSiteFull', '2027-01-05'), e('OnSiteFull', '2027-02-02')], [], { from: '2027-02-01', to: '2027-02-28' }, labels);
  expect(m.pages[0].rows).toHaveLength(1);
  expect(m.pages[0].rows[0].cells.filter(x => x.kind === 'onsite').map(x => x.day)).toEqual([2]);
  expect(m.grand).toEqual({ onSite: 1, offSite: 0, total: 1 });
});
test('formatLongDate', () => {
  expect(formatLongDate('2026-02-02')).toBe('02 February 2026');
});
