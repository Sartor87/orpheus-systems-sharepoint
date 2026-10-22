/** @jest-environment jsdom */
import { ContractTemplateData } from '@orpheussystems/shared-core';
import { buildTimesheetModel } from '../pdf/timesheetModel';
import { templateValues } from '../pdf/templateValues';
import { contract, e, labels } from './fixtures';

const data: ContractTemplateData = {
  position: 'Developer', vendor: 'Example Services Ltd', lot: 'Lot 1', approverName: 'Alex Approver',
  custom: { footnote1: 'First note' }
};

function values(from: string, to: string): Record<string, string> {
  const c = contract({ onSiteTargetDays: 63, offSiteTargetDays: 147 });
  const model = buildTimesheetModel(c, [e('OnSiteFull', '2026-02-03')], [], { from, to }, labels);
  return templateValues(model, c, data, '2026-03-05');
}

describe('templateValues', () => {
  it('formats dates and numbers', () => {
    const v = values('2026-02-01', '2026-02-28');
    expect(v['contract.startDate']).toBe('02 February 2026');
    expect(v['contract.latestExecutionDate']).toBe('19 February 2027');
    expect(v['contract.targetTotal']).toBe('210.00');
    expect(v['contract.targetOnSite']).toBe('63.00');
    expect(v['totals.onSite']).toBe('1.00');
    expect(v['period.from']).toBe('01 February 2026');
    expect(v['generatedOn']).toBe('05 March 2026');
  });
  it('maps people, code, title and labels', () => {
    const v = values('2026-02-01', '2026-02-28');
    expect(v['contract.title']).toBe('Contract');
    expect(v['contract.code']).toBe('1185-Jane-Doe');
    expect(v['contractor.name']).toBe('Jane Doe');
    expect(v['contractor.email']).toBe('jane@example.com');
    expect(v['contractManager.name']).toBe('Max Manager');
    expect(v['labels.serviceProvider']).toBe('Service provider');
    expect(v['labels.approvingOrg']).toBe('Client approval');
  });
  it('maps vendor and its alias, plus custom fields', () => {
    const v = values('2026-02-01', '2026-02-28');
    expect(v['contract.vendor']).toBe('Example Services Ltd');
    expect(v['contract.serviceProvider']).toBe('Example Services Ltd');
    expect(v['contract.position']).toBe('Developer');
    expect(v['contract.lot']).toBe('Lot 1');
    expect(v['contract.approverName']).toBe('Alex Approver');
    expect(v['custom.footnote1']).toBe('First note');
  });
  it('builds period label for single month and range', () => {
    expect(values('2026-02-01', '2026-02-28')['period.label']).toBe('February 2026');
    expect(values('2026-02-01', '2026-03-31')['period.label']).toBe('February 2026 – March 2026');
  });
});
