import * as React from 'react';
import { Dropdown, IDropdownOption } from '@fluentui/react';
import type { Contract, UserInfo } from '@orpheussystems/shared-core';
import styles from './ContractCalendar.module.scss';
import { formatShortDate } from './calendarFormat';

export interface IContractHeaderProps {
  contracts: Contract[];
  selected?: Contract;
  currentUser?: UserInfo;
  readOnly: boolean;
  onSelect(id: number): void;
}

/** Metadata in the timesheet PDF header order. */
function metadata(c: Contract): Array<{ label: string; value: string }> {
  return [
    { label: 'Framework contract', value: c.frameworkContract },
    { label: 'Modality', value: c.modality },
    { label: 'Specific contract', value: c.title },
    { label: 'Starting date', value: formatShortDate(c.startDate) },
    { label: 'SC latest execution date', value: formatShortDate(c.latestExecutionDate) },
    { label: 'On-site / Off-site target', value: `${c.onSiteTargetDays} / ${c.offSiteTargetDays} days` }
  ];
}

const ContractHeader: React.FC<IContractHeaderProps> = ({ contracts, selected, currentUser, readOnly, onSelect }) => {
  // Show whose contract it is when the list is not just the user's own.
  const showContractor = contracts.some(c => !currentUser || c.contractor.id !== currentUser.id);
  const options: IDropdownOption[] = contracts.map(c => ({
    key: c.id,
    text: showContractor ? `${c.title} · ${c.contractor.displayName}` : c.title
  }));

  return (
    <div className={styles.headerTop}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true" />
        <div>
          <h2 className={styles.wordmark}>Contract <span className={styles.wordmarkAccent}>calendar</span></h2>
          <div className={styles.subtitle}>
            {selected ? `${selected.contractor.displayName} · ${selected.contractCode}` : 'On-site and off-site days per contract'}
            {readOnly && selected && <span className={styles.viewOnly}>View only</span>}
          </div>
        </div>
      </div>
      <Dropdown
        className={styles.contractPicker}
        label="Contract"
        options={options}
        selectedKey={selected ? selected.id : null}
        disabled={contracts.length === 0}
        onChange={(_, o) => o && onSelect(o.key as number)}
      />
      {selected && (
        <dl className={styles.metaStrip}>
          {metadata(selected).map(m => (
            <div key={m.label} className={styles.metaItem}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};

export default ContractHeader;
