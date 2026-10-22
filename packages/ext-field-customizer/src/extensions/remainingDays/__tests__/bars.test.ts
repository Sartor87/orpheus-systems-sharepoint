import { parseNumber, remainingBars } from '../bars';

describe('parseNumber', () => {
  it('handles numbers, numeric strings with . or , and empties', () => {
    expect(parseNumber(12.5)).toBe(12.5);
    expect(parseNumber('12.5')).toBe(12.5);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber(' 7 ')).toBe(7);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber(null)).toBeUndefined();
    expect(parseNumber(undefined)).toBeUndefined();
    expect(parseNumber('abc')).toBeUndefined();
    expect(parseNumber(NaN)).toBeUndefined();
  });
});

const v = (a: unknown, b: unknown, c: unknown, d: unknown): Parameters<typeof remainingBars>[0] =>
  ({ onSiteTarget: a, onSiteUsed: b, offSiteTarget: c, offSiteUsed: d });

describe('remainingBars', () => {
  it('computes warn state at 80% used', () => {
    const [on, off] = remainingBars(v(63, 50.5, 10, 2));
    expect(on.label).toBe('On-site');
    expect(on.used).toBe(50.5);
    expect(on.target).toBe(63);
    expect(on.remaining).toBe(12.5);
    expect(on.ratio).toBeCloseTo(0.8, 2);
    expect(on.state).toBe('warn');
    expect(off.label).toBe('Off-site');
    expect(off.state).toBe('ok');
    expect(off.remaining).toBe(8);
  });

  it('is over when used exceeds target, ratio capped at 1', () => {
    const [on] = remainingBars(v(63, 64, 0, 0));
    expect(on.state).toBe('over');
    expect(on.remaining).toBe(-1);
    expect(on.ratio).toBe(1);
  });

  it('is warn (not over) when exactly used up', () => {
    const [on] = remainingBars(v(10, 10, 0, 0));
    expect(on.state).toBe('warn');
    expect(on.remaining).toBe(0);
  });

  it('is none for zero target', () => {
    const [, off] = remainingBars(v(63, 1, 0, 0));
    expect(off.state).toBe('none');
    expect(off.remaining).toBeUndefined();
    expect(off.ratio).toBe(0);
  });

  it('is none for empty/undefined values, never NaN', () => {
    const [on, off] = remainingBars(v('', undefined, null, 'x'));
    for (const b of [on, off]) {
      expect(b.state).toBe('none');
      expect(b.remaining).toBeUndefined();
      expect(Number.isNaN(b.ratio)).toBe(false);
      expect(Number.isNaN(b.used)).toBe(false);
      expect(Number.isNaN(b.target)).toBe(false);
    }
  });

  it('parses comma decimals', () => {
    const [on] = remainingBars(v('63', '12,5', 0, 0));
    expect(on.used).toBe(12.5);
    expect(on.remaining).toBe(50.5);
    expect(on.state).toBe('ok');
  });
});
