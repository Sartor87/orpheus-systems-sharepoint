import type { Contract, DateKey } from '@orpheussystems/shared-core';

/** e.g. Timesheet_1185-Jane-Doe_2026-02-02_2027-02-19.pdf */
export function timesheetFileName(contract: Pick<Contract, 'contractCode'>, from: DateKey, to: DateKey): string {
  return `Timesheet_${contract.contractCode}_${from}_${to}.pdf`;
}
