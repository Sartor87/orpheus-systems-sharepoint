import { Contract, ContractTemplateData, DateKey } from '@orpheussystems/shared-core';
import { TimesheetModel, formatLongDate } from './timesheetModel';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatMonthYear(key: DateKey): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function n2(n: number): string { return n.toFixed(2); }

/** Optional SharePoint columns arrive as null despite the TS types; a placeholder must never print "null". */
function str(v: unknown): string { return v == null ? '' : String(v); }

/** Scalar placeholder values (see spec section 3). Values are plain text; escaping happens by DOM insertion. */
export function templateValues(
  model: TimesheetModel, contract: Contract, data: ContractTemplateData, today: DateKey
): Record<string, string> {
  const h = model.header;
  const fromLabel = formatMonthYear(model.period.from);
  const toLabel = formatMonthYear(model.period.to);
  const raw: Record<string, unknown> = {
    'contract.title': h.specificContract,
    'contract.code': contract.contractCode,
    'contract.frameworkContract': h.frameworkContract,
    'contract.modality': h.modality,
    'contract.startDate': h.startDate,
    'contract.latestExecutionDate': h.latestExecutionDate,
    'contract.targetOnSite': n2(h.targetOnSite),
    'contract.targetOffSite': n2(h.targetOffSite),
    'contract.targetTotal': n2(h.targetTotal),
    'contract.remainingOnSite': n2(h.remainingOnSite),
    'contract.remainingOffSite': n2(h.remainingOffSite),
    'contract.remainingTotal': n2(h.remainingTotal),
    'contract.position': data.position,
    'contract.vendor': data.vendor,
    'contract.serviceProvider': data.vendor,
    'contract.lot': data.lot,
    'contract.approverName': data.approverName,
    'contractor.name': contract.contractor.displayName,
    'contractor.email': contract.contractor.email,
    'contractManager.name': contract.contractManager.displayName,
    'contractManager.email': contract.contractManager.email,
    'period.from': formatLongDate(model.period.from),
    'period.to': formatLongDate(model.period.to),
    'period.label': fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`,
    'totals.onSite': n2(model.grand.onSite),
    'totals.offSite': n2(model.grand.offSite),
    'totals.total': n2(model.grand.total),
    'labels.serviceProvider': model.labels.serviceProvider,
    'labels.approvingOrg': model.labels.approvingOrg,
    'generatedOn': formatLongDate(today)
  };
  const custom = data.custom || {};
  Object.keys(custom).forEach(k => { raw[`custom.${k}`] = custom[k]; });
  const values: Record<string, string> = {};
  Object.keys(raw).forEach(k => { values[k] = str(raw[k]); });
  return values;
}
