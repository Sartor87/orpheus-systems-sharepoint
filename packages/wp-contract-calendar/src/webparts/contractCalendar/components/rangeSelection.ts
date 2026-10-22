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

/** How far (px) a touch may wander before it arms a drag; beyond it the gesture is a scroll. */
export const TOUCH_SLOP_PX = 8;

export interface IPoint { x: number; y: number }

/** True once `now` is further than `slop` from `start` (the slop distance itself still counts as resting). */
export function beyondSlop(start: IPoint, now: IPoint, slop: number = TOUCH_SLOP_PX): boolean {
  const dx = now.x - start.x;
  const dy = now.y - start.y;
  return dx * dx + dy * dy > slop * slop;
}
