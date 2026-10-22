import * as React from 'react';
import { Contract, Remaining, Totals, usageRatio } from '@orpheussystems/shared-core';
import styles from './ContractCalendar.module.scss';
import { entryTypeInfo, formatDays } from './calendarFormat';

export interface IStatsPanelProps {
  contract: Contract;
  totals: Totals;
  remaining: Remaining;
}

interface IStatCardProps {
  title: string;
  accent: string;
  full: number;
  half: number;
  used: number;
  target: number;
  remaining: number;
  over: boolean;
}

const StatCard: React.FC<IStatCardProps> = ({ title, accent, full, half, used, target, remaining, over }) => {
  const pct = Math.min(100, Math.round(usageRatio(used, target) * 100));
  return (
    <div className={styles.statCard}>
      <div className={styles.statHeader}>
        <span className={styles.statDot} style={{ background: accent }} aria-hidden="true" />
        {title}
      </div>
      <div className={styles.statUsed}>
        <strong>{formatDays(used)}</strong>
        <span className={styles.statTarget}> / {formatDays(target)} days</span>
      </div>
      <div
        className={styles.meter}
        role="progressbar"
        aria-label={`${title} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={styles.meterFill} style={{ width: `${pct}%`, background: over ? '#C26700' : accent }} />
      </div>
      <div className={styles.statBreakdown}>
        {full} full · {half} half
      </div>
      <div className={over ? styles.remainingOver : styles.remainingOk}>
        {over ? `${formatDays(-remaining)} over target` : `${formatDays(remaining)} remaining`}
      </div>
    </div>
  );
};

const StatsPanel: React.FC<IStatsPanelProps> = ({ contract, totals, remaining }) => (
  <div className={styles.stats} aria-live="polite">
    <StatCard
      title="On-site"
      accent={entryTypeInfo('OnSiteFull').color}
      full={totals.onSiteFull}
      half={totals.onSiteHalf}
      used={totals.onSiteDays}
      target={contract.onSiteTargetDays}
      remaining={remaining.onSite}
      over={remaining.onSiteOver}
    />
    <StatCard
      title="Off-site"
      accent={entryTypeInfo('OffSiteFull').color}
      full={totals.offSiteFull}
      half={totals.offSiteHalf}
      used={totals.offSiteDays}
      target={contract.offSiteTargetDays}
      remaining={remaining.offSite}
      over={remaining.offSiteOver}
    />
    <div className={styles.statCard}>
      <div className={styles.statHeader}>Total</div>
      <div className={styles.statUsed}>
        <strong>{formatDays(totals.totalDays)}</strong>
        <span className={styles.statTarget}> / {formatDays(contract.onSiteTargetDays + contract.offSiteTargetDays)} days</span>
      </div>
      <div className={styles.statBreakdown}>{contract.hoursPerDay} h per day</div>
      <div className={remaining.total < 0 ? styles.remainingOver : styles.remainingOk}>
        {remaining.total < 0 ? `${formatDays(-remaining.total)} over target` : `${formatDays(remaining.total)} remaining`}
      </div>
    </div>
  </div>
);

export default StatsPanel;
