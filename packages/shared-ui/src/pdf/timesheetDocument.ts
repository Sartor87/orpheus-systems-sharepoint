import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { orpheusTokens } from '../theme/tokens';
import { orpheusBrand } from '../brand/brand';
import type { TimesheetCell, TimesheetModel } from './timesheetModel';

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

export function buildTimesheetDocDefinition(model: TimesheetModel): TDocumentDefinitions {
  const h = model.header;
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const headerRow = (): TableCell[] => [
    { text: 'Month', bold: true },
    ...days.map(d => ({ text: String(d), bold: true, alignment: 'center' as const })),
    { text: 'on-site', bold: true }, { text: 'off-site', bold: true }, { text: 'total', bold: true }
  ];

  const headerBlocks: Content[] = [
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

  const footer: Content = {
    columns: [
      { text: 'Signature of consultant', width: '*' },
      { text: `Signature of ${model.labels.serviceProvider}`, width: '*' },
      { text: model.labels.approvingOrg, width: '*' }
    ],
    margin: [0, 30, 0, 0]
  };

  const attribution: Content = {
    text: `Generated with ${orpheusBrand.name} Contract Calendar · ${orpheusBrand.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`,
    link: orpheusBrand.url,
    alignment: 'center',
    fontSize: 6,
    color: orpheusTokens.pdfLabel,
    margin: [0, 14, 0, 0]
  };

  const content: Content[] = [];
  model.pages.forEach((page, idx) => {
    const isLast = idx === model.pages.length - 1;
    const body: TableCell[][] = [headerRow()];
    page.rows.forEach(r => {
      body.push([
        { text: r.label },
        ...r.cells.map(c => ({
          text: c.hours !== undefined ? num(c.hours) : '',
          alignment: 'center' as const,
          fillColor: fill(c)
        })),
        { text: num(r.onSite) }, { text: num(r.offSite) }, { text: num(r.total) }
      ]);
    });
    if (isLast) {
      body.push([
        { text: 'Total', bold: true },
        ...days.map(() => ({ text: '' })),
        { text: num(model.grand.onSite), bold: true }, { text: num(model.grand.offSite), bold: true }, { text: num(model.grand.total), bold: true }
      ]);
    }
    const pageContent: Content[] = [
      ...headerBlocks,
      { table: { headerRows: 1, widths: [62, ...days.map(() => '*'), 28, 28, 28], body }, layout: { paddingLeft: () => 1, paddingRight: () => 1, paddingTop: () => 1, paddingBottom: () => 1 }, margin: [0, 6, 0, 0] }
    ];
    if (isLast) { pageContent.push(footer, attribution); }
    content.push({ stack: pageContent, ...(isLast ? {} : { pageBreak: 'after' as const }) });
  });

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [20, 20, 20, 20],
    info: {
      title: `Timesheet ${h.specificContract} ${model.period.from}–${model.period.to}`,
      author: orpheusBrand.name,
      creator: `${orpheusBrand.name} Contract Calendar`,
      producer: `${orpheusBrand.name} Contract Calendar (pdfmake)`,
      subject: 'On-site / off-site timesheet',
      keywords: `timesheet, contract, ${orpheusBrand.name}`
    },
    defaultStyle: { fontSize: 7 },
    content
  };
}
