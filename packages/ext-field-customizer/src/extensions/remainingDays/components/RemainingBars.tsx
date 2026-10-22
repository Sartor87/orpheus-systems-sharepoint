import * as React from 'react';
import { orpheusTokens } from '@orpheussystems/shared-ui/tokens';
import type { Bar } from '../bars';
import styles from '../RemainingDays.module.scss';

const DASH = '—';
const COLORS: Record<Exclude<Bar['state'], 'none'>, string> = {
  ok: '#107C10',
  warn: orpheusTokens.amber,
  over: '#A4262C'
};

/** Rounds to at most 2 decimals and drops trailing zeros: 12.5, 3, 0.33. */
function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function detail(bar: Bar): string {
  if (bar.state === 'none' || bar.remaining === undefined) return `${bar.label}: no data`;
  const rest = bar.remaining < 0 ? `${fmt(-bar.remaining)} over` : `${fmt(bar.remaining)} left`;
  return `${bar.label}: ${fmt(bar.used)} of ${fmt(bar.target)} days used, ${rest}`;
}

function short(bar: Bar): string {
  if (bar.state === 'none' || bar.remaining === undefined) return `${bar.label} ${DASH}`;
  return bar.remaining < 0 ? `${bar.label} ${fmt(-bar.remaining)} over` : `${bar.label} ${fmt(bar.remaining)} left`;
}

export interface IRemainingBarsProps {
  bars: [Bar, Bar];
}

export default function RemainingBars({ bars }: IRemainingBarsProps): React.ReactElement {
  if (bars.every((b) => b.state === 'none')) {
    return <span className={styles.none} title={bars.map(detail).join('; ')}>{DASH}</span>;
  }
  return (
    <div className={styles.root}>
      {bars.map((bar) => {
        if (bar.state === 'none') {
          return <div key={bar.label} className={styles.none} title={detail(bar)}>{short(bar)}</div>;
        }
        return (
          <div key={bar.label} className={styles.row} title={detail(bar)}>
            <span>{short(bar)}</span>
            <div
              className={styles.track}
              role="meter"
              aria-label={detail(bar)}
              aria-valuemin={0}
              aria-valuemax={bar.target}
              aria-valuenow={Math.min(bar.used, bar.target)}
            >
              <div className={styles.fill} style={{ width: `${bar.ratio * 100}%`, backgroundColor: COLORS[bar.state] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
