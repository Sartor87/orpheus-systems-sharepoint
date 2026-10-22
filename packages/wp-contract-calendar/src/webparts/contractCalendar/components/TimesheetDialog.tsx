import * as React from 'react';
import { DatePicker, DayOfWeek, Dialog, DialogFooter, DialogType, PrimaryButton, DefaultButton, Spinner, SpinnerSize } from '@fluentui/react';
import { Contract, DateKey, compareKeys, fromDateKey, toDateKey } from '@orpheussystems/shared-core';
import { orpheusTokens } from '@orpheussystems/shared-ui/tokens';
import styles from './ContractCalendar.module.scss';

export interface ITimesheetDialogProps {
  contract: Contract;
  generating: boolean;
  /** Resolves true when the PDF was generated (the dialog then closes). */
  onGenerate(period: { from: DateKey; to: DateKey }): Promise<boolean>;
  onDismiss(): void;
}

const formatDate = (d?: Date): string => (d ? toDateKey(d) : '');

export const amberButtonStyles = {
  root: { background: orpheusTokens.amber, borderColor: orpheusTokens.amber, color: '#0B0D10' },
  rootHovered: { background: orpheusTokens.amberHover, borderColor: orpheusTokens.amberHover, color: '#0B0D10' },
  rootPressed: { background: orpheusTokens.amberHover, borderColor: orpheusTokens.amberHover, color: '#0B0D10' },
  rootDisabled: { background: '#4A4F58', borderColor: '#4A4F58', color: '#B5BABF' }
};

const TimesheetDialog: React.FC<ITimesheetDialogProps> = ({ contract, generating, onGenerate, onDismiss }) => {
  const min = fromDateKey(contract.startDate);
  const max = fromDateKey(contract.latestExecutionDate);
  const [from, setFrom] = React.useState<DateKey>(contract.startDate);
  const [to, setTo] = React.useState<DateKey>(contract.latestExecutionDate);

  const clamp = (d: Date): DateKey => {
    const k = toDateKey(d);
    return compareKeys(k, contract.startDate) < 0 ? contract.startDate
      : compareKeys(k, contract.latestExecutionDate) > 0 ? contract.latestExecutionDate : k;
  };
  const invalid = compareKeys(from, to) > 0;

  const generate = async (): Promise<void> => {
    if (invalid || generating) { return; }
    if (await onGenerate({ from, to })) { onDismiss(); }
  };

  return (
    <Dialog
      hidden={false}
      onDismiss={generating ? undefined : onDismiss}
      dialogContentProps={{ type: DialogType.normal, title: 'Generate timesheet', subText: `${contract.title} · ${contract.contractCode}` }}
      modalProps={{ isBlocking: true }}
    >
      <div className={styles.timesheetFields}>
        <DatePicker
          label="From"
          firstDayOfWeek={DayOfWeek.Monday}
          minDate={min}
          maxDate={max}
          value={fromDateKey(from)}
          formatDate={formatDate}
          onSelectDate={d => d && setFrom(clamp(d))}
          disabled={generating}
          isRequired
        />
        <DatePicker
          label="To"
          firstDayOfWeek={DayOfWeek.Monday}
          minDate={min}
          maxDate={max}
          value={fromDateKey(to)}
          formatDate={formatDate}
          onSelectDate={d => d && setTo(clamp(d))}
          disabled={generating}
          isRequired
        />
      </div>
      {invalid && <div role="alert" className={styles.timesheetInvalid}>The start date must not be after the end date.</div>}
      {generating && <Spinner size={SpinnerSize.medium} label="Generating PDF…" />}
      <DialogFooter>
        <PrimaryButton text="Generate" styles={amberButtonStyles} onClick={generate} disabled={invalid || generating} />
        <DefaultButton text="Cancel" onClick={onDismiss} disabled={generating} />
      </DialogFooter>
    </Dialog>
  );
};

export default TimesheetDialog;
