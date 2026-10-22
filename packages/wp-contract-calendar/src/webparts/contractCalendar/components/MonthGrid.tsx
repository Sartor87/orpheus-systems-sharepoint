import * as React from 'react';
import { CalendarEntry, Contract, DateKey, daysInMonth, Holiday, isWeekend, isWithin, toDateKey } from '@orpheussystems/shared-core';
import styles from './ContractCalendar.module.scss';
import DayCell from './DayCell';
import { MONTH_NAMES, WEEKDAY_SHORT } from './calendarFormat';

export interface IMonthGridProps {
  year: number;
  /** 1-12 */
  month: number;
  contract: Contract;
  entries: Record<DateKey, CalendarEntry>;
  holidays: Holiday[];
  readOnly: boolean;
  today: DateKey;
  isDayBlocked(date: DateKey): boolean;
  onDayClick(date: DateKey): void;
}

function blockedReason(date: DateKey, contract: Contract, holidays: Holiday[]): string {
  if (!isWithin(date, contract.startDate, contract.latestExecutionDate)) { return 'Outside the contract period'; }
  const holiday = holidays.filter(h => h.date === date)[0];
  if (holiday) { return holiday.title; }
  return isWeekend(date) ? 'Weekend' : 'Blocked';
}

const MonthGrid: React.FC<IMonthGridProps> = ({ year, month, contract, entries, holidays, readOnly, today, isDayBlocked, onDayClick }) => {
  // Monday-first: Monday = 0 ... Sunday = 6.
  const leading = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const count = daysInMonth(year, month);
  const title = `${MONTH_NAMES[month - 1]} ${year}`;

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < leading; i++) {
    cells.push(<span key={`pad-${i}`} className={styles.pad} aria-hidden="true" />);
  }
  for (let day = 1; day <= count; day++) {
    const date = toDateKey(new Date(year, month - 1, day));
    const blocked = isDayBlocked(date);
    cells.push(
      <DayCell
        key={date}
        date={date}
        day={day}
        type={entries[date]?.type}
        blocked={blocked}
        outside={!isWithin(date, contract.startDate, contract.latestExecutionDate)}
        blockedReason={blocked ? blockedReason(date, contract, holidays) : undefined}
        readOnly={readOnly}
        isToday={date === today}
        onClick={onDayClick}
      />
    );
  }

  return (
    <section className={styles.month} aria-label={title}>
      <h3 className={styles.monthTitle}>
        <span>{MONTH_NAMES[month - 1]}</span> <span className={styles.monthYear}>{year}</span>
      </h3>
      <div className={styles.grid}>
        {WEEKDAY_SHORT.map((d, i) => (
          <span key={d} className={i >= 5 ? `${styles.weekday} ${styles.weekend}` : styles.weekday} aria-hidden="true">{d}</span>
        ))}
        {cells}
      </div>
    </section>
  );
};

export default React.memo(MonthGrid);
