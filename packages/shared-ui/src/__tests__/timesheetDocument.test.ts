import { buildTimesheetModel } from '../pdf/timesheetModel';
import { buildTimesheetDocDefinition } from '../pdf/timesheetDocument';
import { contract, e } from './fixtures';

test('doc definition has signature row with configurable labels and two-decimal hours', () => {
  const doc = buildTimesheetDocDefinition(buildTimesheetModel(contract({}), [e('OnSiteHalf', '2026-02-03', 1)], [], { from: '2026-02-01', to: '2026-02-28' }, { approvingOrg: 'ACME approval', serviceProvider: 'Service provider' }));
  const text = JSON.stringify(doc);
  expect(doc.pageOrientation).toBe('landscape');
  expect(text).toContain('"4.00"'); expect(text).toContain('ACME approval'); expect(text).toContain('Signature of consultant');
  expect(text).toContain('#9DC3E6');
});
