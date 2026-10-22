import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { orpheusTokens } from '../theme/tokens';
import { orpheusBrand } from '../brand/brand';
import type { TimesheetCell, TimesheetModel, TimesheetRow } from './timesheetModel';

function field(label: string, value: string | number): Content {
  return {
    stack: [
      { text: label, color: orpheusTokens.pdfLabel, fontSize: 6 },
      { text: String(value), color: orpheusTokens.pdfValue, bold: true }
    ],
    margin: [0, 0, 0, 4]
  };
}

function fill(c: TimesheetCell): string | undefined {
  switch (c.kind) {
    case 'onsite': return orpheusTokens.pdfOnSite;
    case 'offsite': return orpheusTokens.pdfOffSite;
    case 'blocked': return orpheusTokens.pdfBlocked;
    default: return undefined;
  }
}

const num = (n: number): string => n.toFixed(2);

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function gridHeaderRow(withTotals: boolean): TableCell[] {
  return [
    { text: 'Month', bold: true },
    ...DAYS.map(d => ({ text: String(d), bold: true, alignment: 'center' as const })),
    ...(withTotals ? [{ text: 'on-site', bold: true }, { text: 'off-site', bold: true }, { text: 'total', bold: true }] : [])
  ];
}

function gridRow(r: TimesheetRow, withTotals: boolean): TableCell[] {
  return [
    { text: r.label },
    ...r.cells.map(c => ({
      text: c.hours !== undefined ? num(c.hours) : '',
      alignment: 'center' as const,
      fillColor: fill(c)
    })),
    ...(withTotals ? [{ text: num(r.onSite) }, { text: num(r.offSite) }, { text: num(r.total) }] : [])
  ];
}

function gridTotalRow(model: TimesheetModel): TableCell[] {
  return [
    { text: 'Total', bold: true },
    ...DAYS.map(() => ({ text: '' })),
    { text: num(model.grand.onSite), bold: true }, { text: num(model.grand.offSite), bold: true }, { text: num(model.grand.total), bold: true }
  ];
}

function gridTable(rows: TimesheetRow[], withTotals: boolean, totalRow?: TableCell[]): Content {
  const body: TableCell[][] = [gridHeaderRow(withTotals), ...rows.map(r => gridRow(r, withTotals))];
  if (totalRow) { body.push(totalRow); }
  return {
    table: { headerRows: 1, widths: [62, ...DAYS.map(() => '*'), ...(withTotals ? [28, 28, 28] : [])], body },
    layout: { paddingLeft: () => 1, paddingRight: () => 1, paddingTop: () => 1, paddingBottom: () => 1 },
    margin: [0, 6, 0, 0]
  };
}

/** The days table over all model rows (no paging). */
export function buildGrid(model: TimesheetModel, opts: { withTotals: boolean }): Content {
  const rows = model.pages.reduce<TimesheetRow[]>((acc, p) => acc.concat(p.rows), []);
  return gridTable(rows, opts.withTotals, opts.withTotals ? gridTotalRow(model) : undefined);
}

/** Month | on-site | off-site | total, one row per month plus a bold grand-total row. */
export function buildTotalsTable(model: TimesheetModel): Content {
  const rows = model.pages.reduce<TimesheetRow[]>((acc, p) => acc.concat(p.rows), []);
  const body: TableCell[][] = [
    [{ text: 'Month', bold: true }, { text: 'on-site', bold: true }, { text: 'off-site', bold: true }, { text: 'total', bold: true }],
    ...rows.map(r => [{ text: r.label }, { text: num(r.onSite) }, { text: num(r.offSite) }, { text: num(r.total) }]),
    [{ text: 'Total', bold: true }, { text: num(model.grand.onSite), bold: true }, { text: num(model.grand.offSite), bold: true }, { text: num(model.grand.total), bold: true }]
  ];
  return {
    table: { headerRows: 1, widths: [62, 40, 40, 40], body },
    layout: { paddingLeft: () => 1, paddingRight: () => 1, paddingTop: () => 1, paddingBottom: () => 1 },
    margin: [0, 6, 0, 0]
  };
}

export function buildHeader(model: TimesheetModel): Content[] {
  const h = model.header;
  return [
    {
      columns: [
        field('Framework contract', h.frameworkContract), field('Modality', h.modality),
        field('Specific contract', h.specificContract), field('Starting date', h.startDate),
        field('SC latest execution date', h.latestExecutionDate),
        field('Consultant days on-site', h.targetOnSite), field('Consultant days off-site', h.targetOffSite),
        field('Consultant days total', h.targetTotal)
      ]
    },
    {
      columns: [
        field('SC days on-site', h.targetOnSite), field('SC days off-site', h.targetOffSite),
        field('SC days total', h.targetTotal), field('Remaining on-site', h.remainingOnSite),
        field('Remaining off-site', h.remainingOffSite), field('Remaining total', h.remainingTotal)
      ]
    }
  ];
}

export function buildSignatures(model: TimesheetModel): Content {
  return {
    columns: [
      { text: 'Signature of consultant', width: '*' },
      { text: `Signature of ${model.labels.serviceProvider}`, width: '*' },
      { text: model.labels.approvingOrg, width: '*' }
    ],
    margin: [0, 30, 0, 0]
  };
}

export function buildAttribution(): Content {
  return {
    text: `Generated with ${orpheusBrand.name} Contract Calendar · ${orpheusBrand.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`,
    link: orpheusBrand.url,
    alignment: 'center',
    fontSize: 6,
    color: orpheusTokens.pdfLabel,
    margin: [0, 14, 0, 0]
  };
}

export function timesheetInfo(model: TimesheetModel): TDocumentDefinitions['info'] {
  return {
    title: `Timesheet ${model.header.specificContract} ${model.period.from}–${model.period.to}`,
    author: orpheusBrand.name,
    creator: `${orpheusBrand.name} Contract Calendar`,
    producer: `${orpheusBrand.name} Contract Calendar (pdfmake)`,
    subject: 'On-site / off-site timesheet',
    keywords: `timesheet, contract, ${orpheusBrand.name}`
  };
}

export function buildTimesheetDocDefinition(model: TimesheetModel): TDocumentDefinitions {
  const content: Content[] = [];
  model.pages.forEach((page, idx) => {
    const isLast = idx === model.pages.length - 1;
    const pageContent: Content[] = [
      ...buildHeader(model),
      gridTable(page.rows, true, isLast ? gridTotalRow(model) : undefined)
    ];
    if (isLast) { pageContent.push(buildSignatures(model), buildAttribution()); }
    content.push({ stack: pageContent, ...(isLast ? {} : { pageBreak: 'after' as const }) });
  });

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [20, 20, 20, 20],
    info: timesheetInfo(model),
    defaultStyle: { fontSize: 7 },
    content
  };
}
