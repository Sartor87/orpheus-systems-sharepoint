import * as React from 'react';
import { getId } from '@fluentui/react';
import type { EntryType } from '@orpheussystems/shared-core';
import styles from './ContractCalendar.module.scss';
import { BLOCKED_COLOR, ENTRY_TYPES } from './calendarFormat';

export interface ISelectionTypePickerProps {
  value: EntryType;
  disabled: boolean;
  onChange(type: EntryType): void;
}

const HALF_TEXT: Partial<Record<EntryType, string>> = { OnSiteHalf: '#FFFFFF', OffSiteHalf: '#1F2329' };

/** Swatch matching the grid cells: solid colour, with the same "½" marker as half-day cells. */
export const TypeSwatch: React.FC<{ type?: EntryType; color: string }> = ({ type, color }) => {
  const halfText = type ? HALF_TEXT[type] : undefined;
  return (
    <span className={styles.swatch} style={{ background: color, color: halfText }} aria-hidden="true">
      {halfText ? '½' : null}
    </span>
  );
};

/**
 * Native radio group (visually hidden inputs, custom ring) so the checked state is unambiguous on the
 * dark card and the colour swatch never competes with the indicator.
 */
const SelectionTypePicker: React.FC<ISelectionTypePickerProps> = ({ value, disabled, onChange }) => {
  const name = React.useMemo(() => getId('entryType'), []);
  return (
    <fieldset className={styles.picker} disabled={disabled}>
      <legend className={styles.pickerTitle}>Mark days as</legend>
      <div className={styles.choices}>
        {ENTRY_TYPES.map(t => {
          const checked = t.type === value;
          return (
            <label key={t.type} className={checked ? `${styles.choice} ${styles.choiceChecked}` : styles.choice}>
              <input
                type="radio"
                className={styles.choiceInput}
                name={name}
                value={t.type}
                checked={checked}
                onChange={() => onChange(t.type)}
              />
              <span className={styles.radioRing} aria-hidden="true" />
              <TypeSwatch type={t.type} color={t.color} />
              <span className={styles.choiceText}>{t.label}</span>
            </label>
          );
        })}
      </div>
      <div className={styles.legendRow}>
        <TypeSwatch color={BLOCKED_COLOR} />
        <span>Weekend / holiday (blocked)</span>
      </div>
      <p className={styles.hint}>Click a marked day again with the same type to clear it.</p>
      <p className={styles.hint}>Drag across days, or Shift+click, to mark or clear a whole range.</p>
    </fieldset>
  );
};

export default SelectionTypePicker;
