import { buildTimesheetModel } from '../pdf/timesheetModel';
import { buildTimesheetDocDefinition, buildGrid, buildTotalsTable } from '../pdf/timesheetDocument';
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

describe('exported timesheet blocks', () => {
  const period2 = { from: '2026-02-01' as const, to: '2026-03-31' as const };
  const lbl = { approvingOrg: 'A', serviceProvider: 'S' };

  it('buildTotalsTable lists one row per month and a bold grand total', () => {
    const model = buildTimesheetModel(contract({}), [e('OnSiteFull', '2026-02-02'), e('OffSiteFull', '2026-03-03')], [], period2, lbl);
    const t = (buildTotalsTable(model) as any).table;
    const texts = t.body.map((r: any[]) => r.map(c => c.text));
    expect(texts[0]).toEqual(['Month', 'on-site', 'off-site', 'total']);
    expect(texts[1]).toEqual(['February 2026', '1.00', '0.00', '1.00']);
    expect(texts[2]).toEqual(['March 2026', '0.00', '1.00', '1.00']);
    expect(texts[3]).toEqual(['Total', '1.00', '1.00', '2.00']);
    expect(t.body[3].every((c: any) => c.bold)).toBe(true);
  });

  it('buildGrid without totals has Month + 31 day columns per body row', () => {
    const model = buildTimesheetModel(contract({}), [], [], period2, lbl);
    const t = (buildGrid(model, { withTotals: false }) as any).table;
    expect(t.headerRows).toBe(1);
    expect(t.body).toHaveLength(3);
    t.body.forEach((r: any[]) => expect(r).toHaveLength(32));
  });

  it('buildGrid with totals covers all 14 months in one table plus a Total row', () => {
    const model = buildTimesheetModel(contract({}), [], [], { from: '2026-02-01', to: '2027-03-31' }, lbl);
    const t = (buildGrid(model, { withTotals: true }) as any).table;
    expect(t.headerRows).toBe(1);
    expect(t.body).toHaveLength(1 + 14 + 1);
    expect(t.body[15][0].text).toBe('Total');
  });
});

describe('multi-page built-in timesheet', () => {
  it('builds fresh header blocks for every page (pdfmake mutates shared nodes)', () => {
    const model = buildTimesheetModel(contract({}), [], [], { from: '2026-02-01', to: '2027-03-31' }, { approvingOrg: 'A', serviceProvider: 'S' });
    const dd = buildTimesheetDocDefinition(model);
    const stacks = (dd.content as { stack: unknown[] }[]).map(c => c.stack);
    expect(stacks.length).toBeGreaterThan(1);
    stacks.forEach(s => expect(s.slice(0, 2)).toEqual(stacks[0].slice(0, 2)));
    for (let i = 0; i < 2; i++) {
      expect(stacks[1][i]).not.toBe(stacks[0][i]);
      expect(stacks[0][i]).toHaveProperty('columns');
    }
  });
});
