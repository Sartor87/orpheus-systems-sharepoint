import { addDays, compareKeys } from '@orpheussystems/shared-core';
import type { DateKey, EntryType } from '@orpheussystems/shared-core';

export type RangeMode = 'paint' | 'erase';

/** Every day from one key to the other, inclusive and ascending, whatever the argument order. */
export function datesBetween(a: DateKey, b: DateKey): DateKey[] {
  const [from, to] = compareKeys(a, b) <= 0 ? [a, b] : [b, a];
  const result: DateKey[] = [];
  for (let d = from; compareKeys(d, to) <= 0; d = addDays(d, 1)) {
    result.push(d);
  }
  return result;
}

/** The dates that can take an entry (blocked days are skipped silently), in input order. */
export function eligibleDates(dates: DateKey[], isBlocked: (date: DateKey) => boolean): DateKey[] {
  return dates.filter(d => !isBlocked(d));
}

/** A range started on a day that already holds the selected type clears it; anything else paints. */
export function rangeMode(anchorType: EntryType | undefined, selectedType: EntryType): RangeMode {
  return anchorType === selectedType ? 'erase' : 'paint';
}
