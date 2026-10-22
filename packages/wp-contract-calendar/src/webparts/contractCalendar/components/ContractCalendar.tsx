import * as React from 'react';
import styles from './ContractCalendar.module.scss';
import type { IContractCalendarProps } from './IContractCalendarProps';
import { orpheusTokens } from '@orpheussystems/shared-ui/tokens';
import { DataContext } from '../DataContext';

/** Minimal shell; the calendar UI arrives in a later task. */
const ContractCalendar: React.FC<IContractCalendarProps> = () => {
  const { service } = React.useContext(DataContext);
  const [summary, setSummary] = React.useState<string>('Loading...');

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([service.getCurrentUser(), service.getMyContracts()])
      .then(([user, contracts]) => {
        if (!cancelled) { setSummary(`${user.displayName}: ${contracts.length} contract(s)`); }
      })
      .catch((e: Error) => { if (!cancelled) { setSummary(`Error: ${e.message}`); } });
    return () => { cancelled = true; };
  }, [service]);

  return (
    <section className={styles.contractCalendar}>
      <div style={{ color: orpheusTokens.amber }}>{summary}</div>
    </section>
  );
};

export default ContractCalendar;
