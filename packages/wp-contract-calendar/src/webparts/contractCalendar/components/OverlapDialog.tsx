import * as React from 'react';
import { ChoiceGroup, DefaultButton, Dialog, DialogFooter, DialogType, IChoiceGroupOption, PrimaryButton } from '@fluentui/react';
import type { Contract, DateKey, EntryType } from '@orpheussystems/shared-core';
import { entryTypeInfo, formatLongDate, formatShortDate } from './calendarFormat';

export interface IOverlapDialogProps {
  pending?: { date: DateKey; candidates: Contract[] };
  selectionType: EntryType;
  onResolve(contractId: number | null): void; // eslint-disable-line @rushstack/no-new-null
}

const OverlapDialog: React.FC<IOverlapDialogProps> = ({ pending, selectionType, onResolve }) => {
  const [choice, setChoice] = React.useState<number | undefined>();

  // Default to the first candidate (earliest start) each time the dialog opens.
  React.useEffect(() => {
    setChoice(pending?.candidates[0]?.id);
  }, [pending]);

  const options: IChoiceGroupOption[] = (pending?.candidates || []).map(c => ({
    key: String(c.id),
    text: `${c.title} (${formatShortDate(c.startDate)} – ${formatShortDate(c.latestExecutionDate)})`
  }));

  return (
    <Dialog
      hidden={!pending}
      onDismiss={() => onResolve(null)}
      dialogContentProps={{
        type: DialogType.normal,
        title: 'Which contract?',
        subText: pending
          ? `${formatLongDate(pending.date)} falls within more than one of your contracts. Choose where to record the ${entryTypeInfo(selectionType).spoken}.`
          : undefined
      }}
      modalProps={{ isBlocking: true }}
      minWidth={360}
    >
      <ChoiceGroup
        options={options}
        selectedKey={choice === undefined ? undefined : String(choice)}
        onChange={(_, o) => o && setChoice(parseInt(o.key, 10))}
      />
      <DialogFooter>
        <PrimaryButton text="Record" disabled={choice === undefined} onClick={() => onResolve(choice === undefined ? null : choice)} />
        <DefaultButton text="Cancel" onClick={() => onResolve(null)} />
      </DialogFooter>
    </Dialog>
  );
};

export default OverlapDialog;
