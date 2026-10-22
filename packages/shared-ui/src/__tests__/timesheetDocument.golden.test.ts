import { buildTimesheetModel } from '../pdf/timesheetModel';
import { buildTimesheetDocDefinition } from '../pdf/timesheetDocument';
import { contract, e, hol, labels } from './fixtures';

describe('buildTimesheetDocDefinition golden output', () => {
  it('matches the snapshot for one month with on-site, off-site, half days and a holiday', () => {
    const model = buildTimesheetModel(
      contract({}),
      [e('OnSiteFull', '2026-02-02'), e('OffSiteFull', '2026-02-03'), e('OnSiteHalf', '2026-02-04'), e('OffSiteHalf', '2026-02-05')],
      [hol('2026-02-10', 'BG')],
      { from: '2026-02-01', to: '2026-02-28' },
      labels
    );
    expect(buildTimesheetDocDefinition(model)).toMatchSnapshot();
  });

  it('matches the snapshot for 14 months (two pages)', () => {
    const model = buildTimesheetModel(
      contract({}),
      [e('OnSiteFull', '2026-02-02'), e('OffSiteHalf', '2027-03-03')],
      [hol('2026-05-01', 'BG')],
      { from: '2026-02-01', to: '2027-03-31' },
      labels
    );
    expect(model.pages).toHaveLength(2);
    expect(buildTimesheetDocDefinition(model)).toMatchSnapshot();
  });
});
