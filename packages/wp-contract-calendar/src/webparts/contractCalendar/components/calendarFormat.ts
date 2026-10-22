import { DateKey, EntryType, fromDateKey } from '@orpheussystems/shared-core';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday-first column headers. */
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface EntryTypeInfo {
  type: EntryType;
  label: string;
  /** Lower-case phrase for screen readers, e.g. "on-site full day". */
  spoken: string;
  color: string;
}

/** Order and colours of the original planner mock. */
export const ENTRY_TYPES: EntryTypeInfo[] = [
  { type: 'OffSiteFull', label: 'Off-site · full day', spoken: 'off-site full day', color: '#4CAF50' },
  { type: 'OffSiteHalf', label: 'Off-site · half day', spoken: 'off-site half day', color: '#FFC107' },
  { type: 'OnSiteFull', label: 'On-site · full day', spoken: 'on-site full day', color: '#1976D2' },
  { type: 'OnSiteHalf', label: 'On-site · half day', spoken: 'on-site half day', color: '#9C27B0' }
];

export const BLOCKED_COLOR = '#FFCCCC';

export function entryTypeInfo(type: EntryType): EntryTypeInfo {
  return ENTRY_TYPES.filter(t => t.type === type)[0];
}

/** "3 Feb 2026" */
export function formatShortDate(k: DateKey): string {
  const d = fromDateKey(k);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].substring(0, 3)} ${d.getFullYear()}`;
}

/** "Tuesday 3 February 2026" */
export function formatLongDate(k: DateKey): string {
  const d = fromDateKey(k);
  return `${WEEKDAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Trims trailing zeros: 12 -> "12", 12.5 -> "12.5". */
export function formatDays(n: number): string {
  return String(Math.round(n * 10) / 10);
}
