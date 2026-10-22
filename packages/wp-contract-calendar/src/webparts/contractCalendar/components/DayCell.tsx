import * as React from 'react';
import type { DateKey, EntryType } from '@orpheussystems/shared-core';
import styles from './ContractCalendar.module.scss';
import { entryTypeInfo, formatLongDate } from './calendarFormat';

export interface IDayCellProps {
  date: DateKey;
  day: number;
  type?: EntryType;
  blocked: boolean;
  /** Blocked because it is outside the contract period (drawn muted rather than as a holiday). */
  outside?: boolean;
  /** Holiday name, or "Weekend" / "Outside the contract period". */
  blockedReason?: string;
  readOnly: boolean;
  isToday: boolean;
  onClick(date: DateKey): void;
}

const TYPE_CLASS: Record<EntryType, string> = {
  OnSiteFull: styles.onSiteFull,
  OnSiteHalf: styles.onSiteHalf,
  OffSiteFull: styles.offSiteFull,
  OffSiteHalf: styles.offSiteHalf
};

const DayCell: React.FC<IDayCellProps> = ({ date, day, type, blocked, outside, blockedReason, readOnly, isToday, onClick }) => {
  const state = blocked
    ? `blocked${blockedReason ? ': ' + blockedReason : ''}`
    : type ? entryTypeInfo(type).spoken : 'no entry';
  const disabled = blocked || readOnly;
  const half = type === 'OnSiteHalf' || type === 'OffSiteHalf';

  const className = [
    styles.day,
    outside ? styles.outside : blocked ? styles.blocked : type ? TYPE_CLASS[type] : '',
    readOnly && !blocked ? styles.readOnlyDay : '',
    isToday ? styles.today : ''
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={className}
      aria-label={`${formatLongDate(date)}, ${state}${isToday ? ', today' : ''}`}
      aria-disabled={disabled || undefined}
      title={blocked ? blockedReason : undefined}
      onClick={disabled ? undefined : () => onClick(date)}
    >
      <span className={styles.dayNumber}>{day}</span>
      {half && <span className={styles.halfBadge} aria-hidden="true">½</span>}
    </button>
  );
};

export default React.memo(DayCell);
