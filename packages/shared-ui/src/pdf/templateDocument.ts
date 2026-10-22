import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { BlockName, FilledTemplate, TEMPLATE_BLOCK_KEY } from './fillTemplate';
import {
  buildAttribution, buildGrid, buildHeader, buildSignatures, buildTotalsTable, timesheetInfo
} from './timesheetDocument';
import type { TimesheetModel } from './timesheetModel';

/** The template could not be rendered; `errors` lists every problem found. */
export class TemplateValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(['The timesheet template has errors:', ...errors].join('\n'));
    this.name = 'TemplateValidationError';
    this.errors = errors;
    Object.setPrototypeOf(this, TemplateValidationError.prototype);
  }
}

/** Resolves an `<img src>` to a `data:image/png|jpeg;base64,…` URL, or throws an Error with a user-readable message. */
export type ImageResolver = (src: string) => Promise<string>;

type PdfNode = Record<string, unknown>;

const DATA_URL = /^data:image\/(png|jpe?g);base64,/i;

function blockContent(model: TimesheetModel, name: BlockName): Content[] {
  switch (name) {
    case 'grid': return [buildGrid(model, { withTotals: true })];
    case 'grid.days': return [buildGrid(model, { withTotals: false })];
    case 'totals': return [buildTotalsTable(model)];
    case 'header': return buildHeader(model);
    case 'signatures': return [buildSignatures(model)];
  }
}

async function inlineImages(filled: FilledTemplate, resolveImage: ImageResolver): Promise<string[]> {
  const results = await Promise.all(filled.images.map(async img => {
    const src = img.getAttribute('src') || '';
    try {
      const url = await resolveImage(src);
      if (!DATA_URL.test(url)) { throw new Error('only PNG and JPEG images are supported'); }
      img.setAttribute('src', url);
      img.removeAttribute('data-src'); // html-to-pdfmake prefers data-src over src
      return undefined;
    } catch (err) {
      return `Image "${src}": ${err instanceof Error ? err.message : String(err)}`;
    }
  }));
  return results.filter((m): m is string => m !== undefined);
}

/**
 * Replaces every converted node carrying the block marker with the built-in block. A block node
 * keeps its other properties (colSpan, rowSpan, fillColor, styles, …) and gets the block as `stack`.
 * Inline text that contains a block is split into a stack of text runs and blocks.
 */
function swapBlocks(content: unknown, model: TimesheetModel, blocks: WeakSet<object>): unknown {
  if (Array.isArray(content)) { return content.map(c => swapBlocks(c, model, blocks)); }
  if (!content || typeof content !== 'object') { return content; }
  const node = content as PdfNode;

  const name = node[TEMPLATE_BLOCK_KEY] as BlockName | undefined;
  if (name) {
    const { [TEMPLATE_BLOCK_KEY]: _marker, text: _text, ...rest } = node;
    const replaced = { ...rest, stack: blockContent(model, name) };
    blocks.add(replaced);
    return replaced;
  }

  const out: PdfNode = { ...node };
  ['stack', 'columns', 'ul', 'ol'].forEach(k => {
    if (Array.isArray(out[k])) { out[k] = swapBlocks(out[k], model, blocks); }
  });
  const table = out.table as { body?: unknown[][] } | undefined;
  if (table && Array.isArray(table.body)) {
    out.table = { ...table, body: table.body.map(row => swapBlocks(row, model, blocks)) };
  }
  if (Array.isArray(out.text)) {
    const runs = swapBlocks(out.text, model, blocks) as unknown[];
    if (runs.some(r => !!r && typeof r === 'object' && blocks.has(r))) {
      // pdfmake text arrays cannot hold tables/columns: turn this node into a stack.
      const stack: unknown[] = [];
      let pending: unknown[] = [];
      const flush = (): void => { if (pending.length) { stack.push({ text: pending }); pending = []; } };
      runs.forEach(r => {
        if (r && typeof r === 'object' && blocks.has(r)) { flush(); stack.push(r); } else { pending.push(r); }
      });
      flush();
      delete out.text;
      out.stack = stack;
      blocks.add(out);
    } else {
      out.text = runs;
    }
  }
  return out;
}

/**
 * Builds the pdfmake document from a filled HTML template: inlines images through `resolveImage`,
 * converts the HTML with html-to-pdfmake, swaps the block markers for the built-in blocks and
 * appends the attribution line. Throws `TemplateValidationError` with every problem found.
 */
export async function buildTemplateDocDefinition(
  model: TimesheetModel, filled: FilledTemplate, resolveImage: ImageResolver, win: Window
): Promise<TDocumentDefinitions> {
  if (filled.errors.length) { throw new TemplateValidationError(filled.errors.slice()); }
  const imageErrors = await inlineImages(filled, resolveImage);
  if (imageErrors.length) { throw new TemplateValidationError(imageErrors); }

  // Loaded lazily so html-to-pdfmake stays in the PDF chunk next to pdfmake.
  const htmlToPdfmake = (await import('html-to-pdfmake')).default;
  const converted = htmlToPdfmake(filled.doc.body.innerHTML, { window: win, tableAutoSize: true });
  const swapped = swapBlocks(Array.isArray(converted) ? converted : [converted], model, new WeakSet()) as Content[];

  return {
    pageSize: filled.page.pageSize,
    pageOrientation: filled.page.pageOrientation,
    pageMargins: [20, 20, 20, 20],
    defaultStyle: { fontSize: 7 },
    info: timesheetInfo(model),
    content: [...swapped, buildAttribution()]
  };
}
