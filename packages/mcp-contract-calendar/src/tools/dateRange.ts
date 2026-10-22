import { addDays, compareKeys, fromDateKey, toDateKey } from '@orpheussystems/shared-core';
import type { DateKey } from '@orpheussystems/shared-core';

export const MAX_RANGE_DAYS = 31;

export type ToolErrorCode = 'not_found' | 'forbidden' | 'invalid_input';

export class ToolError extends Error {
  constructor(public code: ToolErrorCode, message: string) {
    super(message);
    Object.setPrototypeOf(this, ToolError.prototype);
    this.name = 'ToolError';
  }
}

function checkKey(k: string): DateKey {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || toDateKey(fromDateKey(k)) !== k) {
    throw new ToolError('invalid_input', `Invalid date "${k}"; use yyyy-MM-dd.`);
  }
  return k;
}

/** Every calendar day from..to inclusive. */
export function parseRange(from: string, to: string, maxDays: number = MAX_RANGE_DAYS): DateKey[] {
  const a = checkKey(from);
  const b = checkKey(to);
  if (compareKeys(a, b) > 0) {
    throw new ToolError('invalid_input', `"from" (${a}) is after "to" (${b}).`);
  }
  const days: DateKey[] = [];
  for (let k = a; compareKeys(k, b) <= 0; k = addDays(k, 1)) {
    days.push(k);
    if (days.length > maxDays) {
      const total = Math.round((fromDateKey(b).getTime() - fromDateKey(a).getTime()) / 86400000) + 1;
      throw new ToolError('invalid_input', `Range of ${total} days exceeds the limit of ${maxDays}; split it.`);
    }
  }
  return days;
}
