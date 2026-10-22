/** @jest-environment jsdom */
import type { Content } from 'pdfmake/interfaces';
import { buildTimesheetModel, TimesheetModel } from '../pdf/timesheetModel';
import { fillTemplate } from '../pdf/fillTemplate';
import { buildAttribution, buildTotalsTable, timesheetInfo } from '../pdf/timesheetDocument';
import { buildTemplateDocDefinition, ImageResolver, TemplateValidationError } from '../pdf/templateDocument';
import { contract, e, labels } from './fixtures';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function model(from = '2026-02-01', to = '2026-02-28'): TimesheetModel {
  const c = contract({ startDate: '2026-01-01', latestExecutionDate: '2027-03-31' });
  return buildTimesheetModel(c, [e('OnSiteFull', '2026-02-03')], [], { from, to }, labels);
}

const noImages: ImageResolver = () => Promise.reject(new Error('unexpected'));

async function build(html: string, values: Record<string, string> = {}, resolve: ImageResolver = noImages, m: TimesheetModel = model()) {
  return buildTemplateDocDefinition(m, fillTemplate(html, values, window), resolve, window);
}

/** Every node of a pdfmake content tree, depth-first. */
function nodes(c: unknown): Record<string, unknown>[] {
  if (Array.isArray(c)) { return c.reduce<Record<string, unknown>[]>((acc, x) => acc.concat(nodes(x)), []); }
  if (!c || typeof c !== 'object') { return []; }
  const n = c as Record<string, unknown>;
  const out = [n];
  ['stack', 'columns', 'ul', 'ol', 'text'].forEach(k => { if (Array.isArray(n[k])) { out.push(...nodes(n[k])); } });
  const t = n.table as { body?: unknown[][] } | undefined;
  if (t && t.body) { t.body.forEach(row => out.push(...nodes(row))); }
  return out;
}
const tables = (c: unknown) => nodes(c).filter(n => n.table) as unknown as { table: { headerRows?: number; body: unknown[][] } }[];
const texts = (c: unknown) => nodes(c).map(n => n.text).filter(t => typeof t === 'string') as string[];

describe('buildTemplateDocDefinition', () => {
  const TEMPLATE = '<meta name="orpheus:page" content="A4 portrait"><h1>{{contractor.name}}</h1>'
    + '<div>{{grid.days}}</div><div>{{totals}}</div><div>{{signatures}}</div>';

  it('converts the template and swaps the block markers for the built-in blocks', async () => {
    const m = model();
    const dd = await build(TEMPLATE, { 'contractor.name': 'Jane Doe' }, noImages, m);
    const content = dd.content as Content[];
    expect(texts(content)).toContain('Jane Doe');
    const ts = tables(content);
    expect(ts.some(t => t.table.body.every(r => r.length === 32))).toBe(true);
    expect(ts).toContainEqual(expect.objectContaining({ table: expect.objectContaining((buildTotalsTable(m) as { table: object }).table) }));
    expect(texts(content)).toEqual(expect.arrayContaining(['Signature of consultant', 'Signature of Service provider', 'Client approval']));
    expect(content[content.length - 1]).toEqual(buildAttribution());
    expect(dd.info).toEqual(timesheetInfo(m));
    expect(dd).toMatchObject({ pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [20, 20, 20, 20], defaultStyle: { fontSize: 7 } });
    expect(nodes(content).some(n => 'orpheusBlock' in n)).toBe(false);
  });

  it('replaces a block inside a table cell within table.body', async () => {
    const dd = await build('<table><tr><td>{{grid}}</td><td>side</td></tr></table>');
    const outer = (dd.content as Content[])[0] as { table: { body: unknown[][] } };
    const cell = outer.table.body[0][0];
    const inner = tables(cell);
    expect(inner).toHaveLength(1);
    expect(inner[0].table.body[0]).toHaveLength(35);
    expect(texts(outer.table.body[0][1])).toContain('side');
  });

  it('replaces a block nested in inline text', async () => {
    const dd = await build('<div>{{grid}}</div><p>before <span>{{signatures}}</span> after</p>');
    const all = texts(dd.content);
    expect(all).toEqual(expect.arrayContaining(['Signature of consultant']));
    expect(all.join('|')).toMatch(/before/);
    expect(all.join('|')).toMatch(/after/);
    expect(nodes(dd.content).some(n => 'orpheusBlock' in n)).toBe(false);
  });

  it('inlines images through the resolver', async () => {
    const resolve = jest.fn<Promise<string>, [string]>(() => Promise.resolve(PNG));
    const dd = await build('<div>{{grid}}</div><img src="logo.png">', {}, resolve);
    expect(resolve).toHaveBeenCalledWith('logo.png');
    expect(nodes(dd.content).filter(n => n.image)).toEqual([expect.objectContaining({ image: PNG })]);
  });

  it('collects image failures into a TemplateValidationError', async () => {
    const resolve: ImageResolver = src => Promise.reject(new Error(`cannot load ${src}`));
    const err = await build('<div>{{grid}}</div><img src="logo.png"><img src="/sites/x/b.jpg">', {}, resolve).catch(x => x);
    expect(err).toBeInstanceOf(TemplateValidationError);
    expect(err.name).toBe('TemplateValidationError');
    expect(err.errors).toEqual(['Image "logo.png": cannot load logo.png', 'Image "/sites/x/b.jpg": cannot load /sites/x/b.jpg']);
    expect(err.message).toContain('The timesheet template has errors:');
    expect(err.message).toContain('Image "logo.png": cannot load logo.png');
  });

  it('reports fill errors and image errors together', async () => {
    const resolve = jest.fn<Promise<string>, [string]>(src => Promise.reject(new Error(`cannot load ${src}`)));
    const err = await build('<p>{{foo}}</p><img src="logo.png">', {}, resolve).catch(x => x);
    expect(err).toBeInstanceOf(TemplateValidationError);
    expect(err.errors).toEqual([
      'Unknown placeholder {{foo}}', 'The template must contain {{grid}} or {{grid.days}}',
      'Image "logo.png": cannot load logo.png'
    ]);
    expect(resolve).toHaveBeenCalledWith('logo.png');
  });

  it('still throws the fill errors when every image resolves', async () => {
    const resolve = jest.fn<Promise<string>, [string]>(() => Promise.resolve(PNG));
    const err = await build('<p>{{foo}}</p><img src="logo.png">', {}, resolve).catch(x => x);
    expect(err).toBeInstanceOf(TemplateValidationError);
    expect(err.errors).toEqual(['Unknown placeholder {{foo}}', 'The template must contain {{grid}} or {{grid.days}}']);
  });

  it('rejects an unknown orpheusBlock value written by the author', async () => {
    const err = await build(`<div>{{grid}}</div><div data-pdfmake='{"orpheusBlock":"nope"}'>x</div>`).catch(x => x);
    expect(err).toBeInstanceOf(TemplateValidationError);
    expect(err.errors).toEqual(['Unknown block "nope"']);
  });

  it('renders a 14-month period as one grid table with a repeating header row', async () => {
    const m = model('2026-01-01', '2027-02-28');
    expect(m.pages.length).toBeGreaterThan(1);
    const dd = await build('<div>{{grid}}</div>', {}, noImages, m);
    const grids = tables(dd.content);
    expect(grids).toHaveLength(1);
    expect(grids[0].table.headerRows).toBe(1);
    expect(grids[0].table.body).toHaveLength(1 + 14 + 1);
  });
});
