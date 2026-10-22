/** @jest-environment jsdom */
import { fillTemplate, TEMPLATE_BLOCK_ATTR } from '../pdf/fillTemplate';

const GRID = '<table><tr><td>{{grid}}</td></tr></table>';
const fill = (html: string, v: Record<string, string> = {}) => fillTemplate(html, v, window);

describe('fillTemplate', () => {
  it('substitutes scalars in text and attributes, tolerating spaces', () => {
    const r = fill(`${GRID}<p>{{ contract.title }}</p><img alt="{{contract.title}}" src="data:image/png;base64,AA==">`, { 'contract.title': 'T1' });
    expect(r.errors).toEqual([]);
    expect(r.doc.querySelector('p')!.textContent).toBe('T1');
    expect(r.doc.querySelector('img')!.getAttribute('alt')).toBe('T1');
    expect(r.images).toHaveLength(1);
  });
  it('renders values literally', () => {
    const r = fill(`${GRID}<p>{{a}}</p>`, { a: 'a <b> & {{x}}' });
    expect(r.errors).toEqual([]);
    expect(r.doc.querySelector('p')!.textContent).toBe('a <b> & {{x}}');
    expect(r.doc.querySelector('p b')).toBeNull();
  });
  it('empties unknown custom keys', () => {
    const r = fill(`${GRID}<p>[{{custom.nope}}]</p>`);
    expect(r.errors).toEqual([]);
    expect(r.doc.querySelector('p')!.textContent).toBe('[]');
  });
  it('marks block elements', () => {
    const r = fill('<table><tr><td>{{grid}}</td><td> {{totals}} </td></tr></table>');
    const td = r.doc.querySelector(`td[${TEMPLATE_BLOCK_ATTR}="grid"]`)!;
    expect(td).not.toBeNull();
    expect(td.childNodes).toHaveLength(0);
    expect(r.blocks).toEqual(['grid', 'totals']);
    expect(r.errors).toEqual([]);
  });
  it('rejects block that is not alone', () => {
    const r = fill('<td>Days: {{grid}}</td>');
    expect(r.errors).toContain('{{grid}} must be the only content of its element');
  });
  it('reports unknown placeholders, also block in attribute', () => {
    const r = fill(`${GRID}<p title="{{grid}}">{{foo.bar}}</p>`);
    expect(r.errors).toContain('Unknown placeholder {{foo.bar}}');
    expect(r.errors).toContain('Unknown placeholder {{grid}}');
  });
  it('does not crash on markup inside braces', () => {
    const r = fill(`${GRID}<p>{{contract.<b>title</b>}}</p>`);
    expect(r.errors.some(m => m.includes('{{'))).toBe(true);
    expect(() => fill('{{contract.<b>title</b>}}')).not.toThrow();
    expect(fill('{{contract.<b>title</b>}}').errors.some(m => m.includes('{{'))).toBe(true);
  });
  it('requires grid or grid.days', () => {
    expect(fill('<p>x</p>').errors).toContain('The template must contain {{grid}} or {{grid.days}}');
    expect(fill('<div>{{grid.days}}</div>').errors).toEqual([]);
  });
  it('flags empty template', () => {
    expect(fill('  \n ').errors).toEqual(['The template is empty']);
  });
  it('parses page meta', () => {
    expect(fill(GRID).page).toEqual({ pageSize: 'A4', pageOrientation: 'landscape' });
    const r = fill(`<meta name="orpheus:page" content="a3 Portrait">${GRID}`);
    expect(r.page).toEqual({ pageSize: 'A3', pageOrientation: 'portrait' });
    expect(fill(`<meta name="orpheus:page" content="Letter landscape">${GRID}`).page.pageSize).toBe('LETTER');
    const bad = fill(`<meta name="orpheus:page" content="B5 up">${GRID}`);
    expect(bad.errors).toContain('Invalid orpheus:page value "B5 up"');
    expect(bad.page).toEqual({ pageSize: 'A4', pageOrientation: 'landscape' });
  });
  it('removes script and style and collects multiple errors', () => {
    const r = fill('<style>p{}</style><script>{{x}}</script><p>{{a.b}}{{c.d}}</p>');
    expect(r.doc.querySelector('script, style')).toBeNull();
    expect(r.errors).toEqual(expect.arrayContaining([
      'Unknown placeholder {{a.b}}', 'Unknown placeholder {{c.d}}',
      'The template must contain {{grid}} or {{grid.days}}'
    ]));
    expect(r.errors).toHaveLength(3);
  });
});
