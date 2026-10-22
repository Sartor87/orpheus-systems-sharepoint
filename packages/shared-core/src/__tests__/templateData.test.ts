import { EMPTY_TEMPLATE_DATA, demoTemplateData, parseTemplateFields } from '../templateData';

describe('parseTemplateFields', () => {
  it('parses key: value lines, later duplicates win, bad keys ignored', () => {
    expect(parseTemplateFields('a: 1\nb:two: three\n bad key: x\n\nc:\na: 9')).toEqual({ a: '9', b: 'two: three', c: '' });
  });
  it('handles CRLF', () => {
    expect(parseTemplateFields('a: 1\r\nb: 2\r\n')).toEqual({ a: '1', b: '2' });
  });
  it('returns {} for empty input', () => {
    expect(parseTemplateFields(undefined)).toEqual({});
    expect(parseTemplateFields(null)).toEqual({});
    expect(parseTemplateFields('')).toEqual({});
  });
  it('accepts Foo_bar-1 and ignores foo.bar', () => {
    expect(parseTemplateFields('Foo_bar-1: x\nfoo.bar: y')).toEqual({ 'Foo_bar-1': 'x' });
  });
});

describe('demoTemplateData', () => {
  it('returns fixture for contract 1', () => {
    const d = demoTemplateData(1);
    expect(d.lot).toBe('Lot 1');
    expect(d.position).toBe('Senior Solution Architect');
    expect(d.vendor).toBe('Example Services Ltd');
    expect(d.approverName).toBe('Jane Example');
    expect(d.custom.footnote2).toBe('Hours are recorded in the contract calendar.');
  });
  it('returns a copy of empty data for other ids', () => {
    const d = demoTemplateData(999);
    expect(d).toEqual(EMPTY_TEMPLATE_DATA);
    expect(d).not.toBe(EMPTY_TEMPLATE_DATA);
    expect(d.custom).not.toBe(EMPTY_TEMPLATE_DATA.custom);
  });
  it('EMPTY_TEMPLATE_DATA is frozen', () => {
    expect(Object.isFrozen(EMPTY_TEMPLATE_DATA)).toBe(true);
  });
});
