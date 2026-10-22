export type BlockName = 'grid' | 'grid.days' | 'totals' | 'header' | 'signatures';
export interface PageSetup { pageSize: 'A4' | 'A3' | 'LETTER'; pageOrientation: 'portrait' | 'landscape' }
export interface FilledTemplate {
  doc: Document; blocks: BlockName[]; page: PageSetup; images: HTMLImageElement[]; errors: string[];
}

/**
 * Marker attribute set on block elements. The marker mechanism lives in setBlockMarker only.
 * html-to-pdfmake drops plain data-* attributes but copies the JSON in data-pdfmake onto the
 * converted node, so a block element becomes a node carrying `{ orpheusBlock: '<name>' }`.
 */
export const TEMPLATE_BLOCK_ATTR = 'data-pdfmake';
/** Property the converted pdfmake node carries for a block element. */
export const TEMPLATE_BLOCK_KEY = 'orpheusBlock';
export function setBlockMarker(el: Element, name: BlockName): void {
  while (el.firstChild) { el.removeChild(el.firstChild); }
  el.setAttribute(TEMPLATE_BLOCK_ATTR, JSON.stringify({ [TEMPLATE_BLOCK_KEY]: name }));
}

const BLOCKS: BlockName[] = ['grid', 'grid.days', 'totals', 'header', 'signatures'];
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;
const SOLE_PLACEHOLDER = /^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$/;
const DEFAULT_PAGE: PageSetup = { pageSize: 'A4', pageOrientation: 'landscape' };

function isBlock(name: string): name is BlockName { return BLOCKS.indexOf(name as BlockName) >= 0; }

function parsePage(doc: Document, errors: string[]): PageSetup {
  const metas = Array.prototype.slice.call(doc.querySelectorAll('meta[name]')) as Element[];
  const meta = metas.filter(m => (m.getAttribute('name') || '').toLowerCase() === 'orpheus:page')[0];
  if (!meta) { return { ...DEFAULT_PAGE }; }
  const raw = meta.getAttribute('content') || '';
  const m = /^\s*(A4|A3|LETTER)\s+(portrait|landscape)\s*$/i.exec(raw);
  if (!m) { errors.push(`Invalid orpheus:page value "${raw}"`); return { ...DEFAULT_PAGE }; }
  return { pageSize: m[1].toUpperCase() as PageSetup['pageSize'], pageOrientation: m[2].toLowerCase() as PageSetup['pageOrientation'] };
}

export function fillTemplate(html: string, values: Record<string, string>, win: Window): FilledTemplate {
  const doc = new (win as Window & typeof globalThis).DOMParser().parseFromString(html, 'text/html');
  const errors: string[] = [];
  const blocks: BlockName[] = [];
  const report = (msg: string): void => { if (errors.indexOf(msg) < 0) { errors.push(msg); } };

  if (!html.trim()) {
    return { doc, blocks, page: { ...DEFAULT_PAGE }, images: [], errors: ['The template is empty'] };
  }

  Array.prototype.slice.call(doc.querySelectorAll('script, style')).forEach((el: Element) => el.remove());
  const page = parsePage(doc, errors);

  // Replace one placeholder match; returns the replacement text. Single pass, so values are never re-scanned.
  const replace = (whole: string, name: string, inAttribute: boolean): string => {
    if (Object.prototype.hasOwnProperty.call(values, name)) { return values[name]; }
    if (name.indexOf('custom.') === 0) { return ''; }
    if (!inAttribute && isBlock(name)) {
      report(`{{${name}}} must be the only content of its element`);
      return whole;
    }
    report(`Unknown placeholder {{${name}}}`);
    return whole;
  };

  const elements = Array.prototype.slice.call(doc.querySelectorAll('*')) as Element[];

  // Attributes
  elements.forEach(el => {
    Array.prototype.slice.call(el.attributes).forEach((a: Attr) => {
      if (a.value.indexOf('{{') >= 0) {
        el.setAttribute(a.name, a.value.replace(PLACEHOLDER, (w: string, n: string) => replace(w, n, true)));
      }
    });
  });

  // Block elements: leaf element whose trimmed text is exactly one block placeholder.
  elements.forEach(el => {
    if (el.children.length > 0) { return; }
    const m = SOLE_PLACEHOLDER.exec((el.textContent || '').trim());
    if (!m || !isBlock(m[1])) { return; }
    if (blocks.indexOf(m[1]) < 0) { blocks.push(m[1]); }
    setBlockMarker(el, m[1]);
  });

  // Text nodes
  const walker = doc.createTreeWalker(doc.documentElement, 0x4);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { texts.push(n as Text); }
  texts.forEach(t => {
    if (t.data.indexOf('{{') < 0) { return; }
    const stripped = t.data.replace(PLACEHOLDER, '');
    if (stripped.indexOf('{{') >= 0) { report('Malformed placeholder: "{{" without a matching "}}" in the same text'); }
    t.data = t.data.replace(PLACEHOLDER, (w: string, n: string) => replace(w, n, false));
  });

  if (blocks.indexOf('grid') < 0 && blocks.indexOf('grid.days') < 0) {
    report('The template must contain {{grid}} or {{grid.days}}');
  }

  const images = Array.prototype.slice.call(doc.querySelectorAll('img')) as HTMLImageElement[];
  return { doc, blocks, page, images, errors };
}
