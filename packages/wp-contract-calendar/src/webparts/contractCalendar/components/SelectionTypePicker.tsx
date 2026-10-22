import * as React from 'react';
import { ChoiceGroup, IChoiceGroupOption } from '@fluentui/react';
import type { EntryType } from '@orpheussystems/shared-core';
import styles from './ContractCalendar.module.scss';
import { BLOCKED_COLOR, ENTRY_TYPES } from './calendarFormat';

export interface ISelectionTypePickerProps {
  value: EntryType;
  disabled: boolean;
  onChange(type: EntryType): void;
}

function renderLabel(color: string, half: boolean): (option?: IChoiceGroupOption) => JSX.Element {
  return (option?: IChoiceGroupOption): JSX.Element => (
    <span className={styles.choiceLabel}>
      <span className={`${styles.swatch} ${half ? styles.swatchHalf : ''}`} style={{ background: color }} aria-hidden="true" />
      {option?.text}
    </span>
  );
}

const OPTIONS: IChoiceGroupOption[] = ENTRY_TYPES.map(t => ({
  key: t.type,
  text: t.label,
  onRenderLabel: renderLabel(t.color, t.type === 'OnSiteHalf' || t.type === 'OffSiteHalf')
}));

const SelectionTypePicker: React.FC<ISelectionTypePickerProps> = ({ value, disabled, onChange }) => (
  <div className={styles.picker}>
    <ChoiceGroup
      label="Mark days as"
      selectedKey={value}
      options={OPTIONS}
      disabled={disabled}
      onChange={(_, option) => option && onChange(option.key as EntryType)}
      styles={{ flexContainer: { display: 'flex', flexWrap: 'wrap', columnGap: '20px' } }}
    />
    <div className={styles.legendNote}>
      <span className={styles.swatch} style={{ background: BLOCKED_COLOR }} aria-hidden="true" />
      Weekend / holiday (blocked) · click a marked day again with the same type to clear it
    </div>
  </div>
);

export default SelectionTypePicker;
