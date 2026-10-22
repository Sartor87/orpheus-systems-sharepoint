export interface Bar {
  label: 'On-site' | 'Off-site';
  used: number;
  target: number;
  remaining: number | undefined;
  ratio: number;
  state: 'ok' | 'warn' | 'over' | 'none';
}

/** Parses a list-item value: numbers, and numeric strings with '.' or ',' decimals. Anything else is undefined. */
export function parseNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(',', '.');
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const WARN_RATIO = 0.8;

function makeBar(label: Bar['label'], targetRaw: unknown, usedRaw: unknown): Bar {
  const target = parseNumber(targetRaw);
  const used = parseNumber(usedRaw);
  if (target === undefined || used === undefined || target <= 0 || used < 0) {
    return { label, used: used ?? 0, target: target ?? 0, remaining: undefined, ratio: 0, state: 'none' };
  }
  const ratio = Math.min(used / target, 1);
  const state: Bar['state'] = used > target ? 'over' : used / target >= WARN_RATIO ? 'warn' : 'ok';
  return { label, used, target, remaining: target - used, ratio, state };
}

export function remainingBars(values: {
  onSiteTarget: unknown;
  onSiteUsed: unknown;
  offSiteTarget: unknown;
  offSiteUsed: unknown;
}): [Bar, Bar] {
  return [
    makeBar('On-site', values.onSiteTarget, values.onSiteUsed),
    makeBar('Off-site', values.offSiteTarget, values.offSiteUsed)
  ];
}
