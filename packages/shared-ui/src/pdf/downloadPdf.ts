import type { Contract, ContractTemplateData, DateKey } from '@orpheussystems/shared-core';
import { buildTimesheetDocDefinition } from './timesheetDocument';
import type { TimesheetModel } from './timesheetModel';
import { fillTemplate } from './fillTemplate';
import { templateValues } from './templateValues';
import { buildTemplateDocDefinition } from './templateDocument';
import type { ImageResolver } from './templateDocument';

async function loadPdfMake() {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default;
  const fonts = await import('pdfmake/build/vfs_fonts');
  // vfs_fonts export shape differs between pdfmake 0.2.x minors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfMake.vfs = (fonts as any).vfs ?? (fonts as any).pdfMake?.vfs ?? (fonts as any).default?.pdfMake?.vfs;
  return pdfMake;
}

export async function downloadTimesheet(model: TimesheetModel, fileName: string): Promise<void> {
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(buildTimesheetDocDefinition(model)).download(fileName);
}
export interface TemplateInput {
  html: string;
  contract: Contract;
  templateData: ContractTemplateData;
  today: DateKey;
  resolveImage: ImageResolver;
}

/** Renders the timesheet from a user HTML template. Throws `TemplateValidationError` listing every template problem. */
export async function downloadTimesheetFromTemplate(
  model: TimesheetModel, input: TemplateInput, fileName: string
): Promise<void> {
  const filled = fillTemplate(input.html, templateValues(model, input.contract, input.templateData, input.today), window);
  const doc = await buildTemplateDocDefinition(model, filled, input.resolveImage, window);
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(doc).download(fileName);
}

export { sampleTimesheetTemplate } from './sampleTemplate';
export { TemplateValidationError } from './templateDocument';
export type { ImageResolver } from './templateDocument';
