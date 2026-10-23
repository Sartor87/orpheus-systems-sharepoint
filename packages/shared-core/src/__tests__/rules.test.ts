import { canCreateContract, canEditContract, computeRemaining, computeTotals, contractsCoveringDate, dayValue, hasContractPeriod, holidayApplies, hoursFor, isBlocked, isOnSite, usageRatio } from '../rules';
import { contract, e, hol } from './fixtures';

test('computeTotals counts halves as 0.5', () => {
  const t = computeTotals([e('OnSiteFull'), e('OnSiteHalf'), e('OffSiteHalf')]);
  expect(t).toMatchObject({ onSiteDays: 1.5, offSiteDays: 0.5, totalDays: 2, onSiteFull: 1, onSiteHalf: 1, offSiteHalf: 1 });
});
test('computeRemaining flags over-target and never NaN with zero target', () => {
  const r = computeRemaining(contract({ onSiteTargetDays: 1, offSiteTargetDays: 0 }), computeTotals([e('OnSiteFull'), e('OnSiteHalf'), e('OffSiteHalf')]));
  expect(r).toEqual({ onSite: -0.5, offSite: -0.5, total: -1, onSiteOver: true, offSiteOver: true });
  expect(usageRatio(0.5, 0)).toBe(0);
});
test('usageRatio divides used by target', () => { expect(usageRatio(5, 10)).toBe(0.5); });
test('dayValue and isOnSite', () => {
  expect(dayValue('OnSiteFull')).toBe(1);
  expect(dayValue('OffSiteHalf')).toBe(0.5);
  expect(isOnSite('OnSiteHalf')).toBe(true);
  expect(isOnSite('OffSiteFull')).toBe(false);
});
test('hoursFor', () => { expect(hoursFor('OffSiteHalf', 8)).toBe(4); expect(hoursFor('OnSiteFull', 7.5)).toBe(7.5); });
test('contractsCoveringDate returns both bridge contracts in the overlap', () => {
  const a = contract({ id: 1, startDate: '2026-11-01', latestExecutionDate: '2027-01-31' });
  const b = contract({ id: 2, startDate: '2027-01-15', latestExecutionDate: '2027-06-30' });
  expect(contractsCoveringDate([a, b], '2027-01-20').map(c => c.id)).toEqual([1, 2]);
  expect(contractsCoveringDate([a, b], '2027-01-10').map(c => c.id)).toEqual([1]);
});
test('isBlocked: weekends, country holidays and * holidays', () => {
  const h = [hol('2026-12-24', 'BG'), hol('2027-01-01', '*')];
  expect(isBlocked('2026-12-24', h, 'BG', true)).toBe(true);
  expect(isBlocked('2026-12-24', h, 'DE', true)).toBe(false);
  expect(isBlocked('2027-01-01', h, 'DE', true)).toBe(true);
  expect(isBlocked('2026-11-07', h, 'BG', true)).toBe(true);   // Saturday
  expect(isBlocked('2026-11-07', h, 'BG', false)).toBe(false);
});
test('isBlocked compares countries regardless of case and surrounding spaces', () => {
  const h = [hol('2026-12-24', 'bg'), hol('2026-12-25', ' BG ')];
  expect(isBlocked('2026-12-24', h, 'BG', true)).toBe(true);
  expect(isBlocked('2026-12-25', h, 'bg', true)).toBe(true);
  expect(isBlocked('2026-12-24', h, 'DE', true)).toBe(false);
});
test('holidayApplies: same country in any case, or *', () => {
  expect(holidayApplies('Bg', 'bG')).toBe(true);
  expect(holidayApplies('*', 'DE')).toBe(true);
  expect(holidayApplies('DE', 'BG')).toBe(false);
  expect(holidayApplies('', '')).toBe(false);
});
test('contractsCoveringDate skips contracts with an empty start or end date', () => {
  const noStart = contract({ id: 1, startDate: '', latestExecutionDate: '2027-01-31' });
  const noEnd = contract({ id: 2, startDate: '2026-11-01', latestExecutionDate: '' });
  const ok = contract({ id: 3, startDate: '2026-11-01', latestExecutionDate: '2027-01-31' });
  expect(contractsCoveringDate([noStart, noEnd, ok], '2026-12-01').map(c => c.id)).toEqual([3]);
});
test('hasContractPeriod requires both dates', () => {
  expect(hasContractPeriod(contract())).toBe(true);
  expect(hasContractPeriod(contract({ startDate: '' }))).toBe(false);
  expect(hasContractPeriod(contract({ latestExecutionDate: '' }))).toBe(false);
});
test('canCreateContract: Admin or ContractManager', () => {
  expect(canCreateContract(['Admin'])).toBe(true);
  expect(canCreateContract(['ContractManager'])).toBe(true);
  expect(canCreateContract(['Contractor'])).toBe(false);
  expect(canCreateContract([])).toBe(false);
});
test("canEditContract: Admin, or the contract's own manager", () => {
  const c = contract();
  const managerId = c.contractManager.id;
  expect(canEditContract(['Admin'], c, 99)).toBe(true);
  expect(canEditContract(['ContractManager'], c, managerId)).toBe(true);
  expect(canEditContract(['ContractManager'], c, 99)).toBe(false);
  expect(canEditContract(['Contractor'], c, c.contractor.id)).toBe(false);
  expect(canEditContract([], c, managerId)).toBe(false);
  expect(canEditContract(['ContractManager'], contract({ contractManager: { ...c.contractManager, id: 0 } }), 0)).toBe(false);
});
