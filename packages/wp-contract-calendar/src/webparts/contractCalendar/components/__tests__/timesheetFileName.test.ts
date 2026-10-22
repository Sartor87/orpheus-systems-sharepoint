import { LocalDataService } from '@orpheussystems/shared-core';
import { timesheetFileName } from '../timesheetFileName';

describe('timesheetFileName', () => {
  it('builds Timesheet_<code>_<from>_<to>.pdf', async () => {
    const svc = new LocalDataService({ demoUserId: 1 });
    const c = (await svc.getMyContracts()).find(x => x.id === 1)!;
    expect(timesheetFileName(c, '2026-02-02', '2027-02-19')).toBe('Timesheet_1185-Jane-Doe_2026-02-02_2027-02-19.pdf');
  });
});
