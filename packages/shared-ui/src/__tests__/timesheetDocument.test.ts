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

describe('Orpheus attribution', () => {
  const model = buildTimesheetModel(contract({}), [e('OnSiteHalf', '2026-02-03', 1)], [], { from: '2026-02-01', to: '2026-02-28' }, { approvingOrg: 'A', serviceProvider: 'S' });
  const doc = buildTimesheetDocDefinition(model);

  it('has a linked footer line', () => {
    const text = JSON.stringify(doc);
    expect(text).toContain('Generated with Orpheus Systems Contract Calendar · orpheussystems.com');
    expect(text).toContain('"link":"https://orpheussystems.com/"');
  });

  it('sets document metadata', () => {
    expect(doc.info).toEqual({
      title: `Timesheet ${model.header.specificContract} 2026-02-01–2026-02-28`,
      author: 'Orpheus Systems',
      creator: 'Orpheus Systems Contract Calendar',
      producer: 'Orpheus Systems Contract Calendar (pdfmake)',
      subject: 'On-site / off-site timesheet',
      keywords: 'timesheet, contract, Orpheus Systems'
    });
  });
});
