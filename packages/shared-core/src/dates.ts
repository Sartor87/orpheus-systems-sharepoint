import { DateKey } from './models';

function pad(n: number, width: number = 2): string {
  let s = String(n);
  while (s.length < width) { s = '0' + s; }
  return s;
}

export function toDateKey(d: Date): DateKey {
  return pad(d.getFullYear(), 4) + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** Parses yyyy-MM-dd as local midnight. */
export function fromDateKey(k: DateKey): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(k: DateKey, n: number): DateKey {
  const d = fromDateKey(k);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function isWeekend(k: DateKey): boolean {
  const day = fromDateKey(k).getDay();
  return day === 0 || day === 6;
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/** Inclusive list of months (1-12) spanned by the two keys. */
export function monthsBetween(from: DateKey, to: DateKey): Array<{ year: number; month: number }> {
  const a = fromDateKey(from);
  const b = fromDateKey(to);
  const result: Array<{ year: number; month: number }> = [];
  let year = a.getFullYear();
  let month = a.getMonth() + 1;
  const endIndex = b.getFullYear() * 12 + b.getMonth();
  while (year * 12 + (month - 1) <= endIndex) {
    result.push({ year, month });
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return result;
}

export function compareKeys(a: DateKey, b: DateKey): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isWithin(k: DateKey, from: DateKey, to: DateKey): boolean {
  return compareKeys(k, from) >= 0 && compareKeys(k, to) <= 0;
}
