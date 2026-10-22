import {
  CalendarEntry, Contract, DateKey, Holiday,
  computeRemaining, computeTotals, daysInMonth, hoursFor, isBlocked, isWithin, monthsBetween
} from '@orpheussystems/shared-core';

export interface TimesheetLabels { approvingOrg: string; serviceProvider: string }
export interface TimesheetCell { day: number; hours?: number; kind: 'onsite' | 'offsite' | 'blocked' | 'empty' | 'na' }
export interface TimesheetRow { label: string; cells: TimesheetCell[]; onSite: number; offSite: number; total: number }
export interface TimesheetPage { rows: TimesheetRow[] }
export interface TimesheetModel {
  header: {
    frameworkContract: string; modality: string; specificContract: string;
    startDate: string; latestExecutionDate: string;
    targetOnSite: number; targetOffSite: number; targetTotal: number;
    remainingOnSite: number; remainingOffSite: number; remainingTotal: number;
  };
  pages: TimesheetPage[];
  grand: { onSite: number; offSite: number; total: number };
  labels: TimesheetLabels;
  period: { from: DateKey; to: DateKey };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ROWS_PER_PAGE = 12;

function pad(n: number): string { return String(n).padStart(2, '0'); }

export function formatLongDate(key: DateKey): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${pad(d)} ${MONTHS[m - 1]} ${y}`;
}

export function buildTimesheetModel(
  contract: Contract, entries: CalendarEntry[], holidays: Holiday[],
  period: { from: DateKey; to: DateKey }, labels: TimesheetLabels
): TimesheetModel {
  const inPeriod = entries.filter(x => isWithin(x.date, period.from, period.to));
  const byDate = new Map<DateKey, CalendarEntry>();
  inPeriod.forEach(x => byDate.set(x.date, x));

  const rows: TimesheetRow[] = monthsBetween(period.from, period.to).map(({ year, month }) => {
    const len = daysInMonth(year, month);
    const cells: TimesheetCell[] = [];
    for (let day = 1; day <= 31; day++) {
      if (day > len) { cells.push({ day, kind: 'na' }); continue; }
      const key = `${year}-${pad(month)}-${pad(day)}`;
      const entry = byDate.get(key);
      if (entry) {
        const onsite = entry.type === 'OnSiteFull' || entry.type === 'OnSiteHalf';
        cells.push({ day, hours: hoursFor(entry.type, contract.hoursPerDay), kind: onsite ? 'onsite' : 'offsite' });
      } else if (isBlocked(key, holidays, contract.country, true)) {
        cells.push({ day, kind: 'blocked' });
      } else {
        cells.push({ day, kind: 'empty' });
      }
    }
    const prefix = `${year}-${pad(month)}-`;
    const t = computeTotals(inPeriod.filter(x => x.date.startsWith(prefix)));
    return { label: `${MONTHS[month - 1]} ${year}`, cells, onSite: t.onSiteDays, offSite: t.offSiteDays, total: t.totalDays };
  });

  const pages: TimesheetPage[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) { pages.push({ rows: rows.slice(i, i + ROWS_PER_PAGE) }); }

  const totals = computeTotals(inPeriod);
  const rem = computeRemaining(contract, totals);
  return {
    header: {
      frameworkContract: contract.frameworkContract,
      modality: contract.modality,
      specificContract: contract.title,
      startDate: formatLongDate(contract.startDate),
      latestExecutionDate: formatLongDate(contract.latestExecutionDate),
      targetOnSite: contract.onSiteTargetDays,
      targetOffSite: contract.offSiteTargetDays,
      targetTotal: contract.onSiteTargetDays + contract.offSiteTargetDays,
      remainingOnSite: rem.onSite,
      remainingOffSite: rem.offSite,
      remainingTotal: rem.total
    },
    pages,
    grand: { onSite: totals.onSiteDays, offSite: totals.offSiteDays, total: totals.totalDays },
    labels,
    period
  };
}
