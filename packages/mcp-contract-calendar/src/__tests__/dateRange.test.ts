import { parseRange, ToolError } from '../tools/dateRange';

function code(fn: () => unknown): string | undefined {
  try { fn(); } catch (e) { return e instanceof ToolError ? e.code : 'other'; }
  return undefined;
}

describe('parseRange', () => {
  it('handles a full year with a raised limit', () => {
    expect(parseRange('2026-01-01', '2026-12-31', 366)).toHaveLength(365);
  });
  it('lists days inclusively', () => {
    const r = parseRange('2026-12-01', '2026-12-05');
    expect(r).toHaveLength(5);
    expect(r[4]).toBe('2026-12-05');
  });
  it('accepts a single day', () => {
    expect(parseRange('2026-12-01', '2026-12-01')).toEqual(['2026-12-01']);
  });
  it.each([
    ['2026-02-30', '2026-03-01'],
    ['2026-12-05', '2026-12-01'],
    ['01.12.2026', '2026-12-05'],
    ['2026-01-01', '2026-02-01']
  ])('rejects %s..%s with invalid_input', (a, b) => {
    expect(code(() => parseRange(a, b))).toBe('invalid_input');
  });
  it('gives specific messages', () => {
    expect(() => parseRange('2026-02-30', '2026-03-01')).toThrow('Invalid date "2026-02-30"; use yyyy-MM-dd.');
    expect(() => parseRange('2026-12-05', '2026-12-01')).toThrow('"from" (2026-12-05) is after "to" (2026-12-01).');
    expect(() => parseRange('2026-01-01', '2026-02-01')).toThrow('Range of 32 days exceeds the limit of 31; split it.');
  });
});
