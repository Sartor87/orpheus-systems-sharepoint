import { buildTimesheetDocDefinition } from './timesheetDocument';
import type { TimesheetModel } from './timesheetModel';

export async function downloadTimesheet(model: TimesheetModel, fileName: string): Promise<void> {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default;
  const fonts = await import('pdfmake/build/vfs_fonts');
  // vfs_fonts export shape differs between pdfmake 0.2.x minors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfMake.vfs = (fonts as any).vfs ?? (fonts as any).pdfMake?.vfs ?? (fonts as any).default?.pdfMake?.vfs;
  pdfMake.createPdf(buildTimesheetDocDefinition(model)).download(fileName);
}
