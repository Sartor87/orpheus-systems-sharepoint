import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { setIconOptions } from '@fluentui/react';
import { LocalDataService } from '@orpheussystems/shared-core';
import { DataContext } from '../../DataContext';
import type { IContractCalendarWebPartProps } from '../../IContractCalendarWebPartProps';
import { useCalendarState } from '../useCalendarState';
import TimesheetDialog from '../TimesheetDialog';

setIconOptions({ disableWarnings: true });

const props: IContractCalendarWebPartProps = {
  useLocalData: true, demoUserId: 1, contractsListId: '', entriesListId: '', holidaysListId: '',
  monthsToShow: 0, blockWeekends: true, approvingOrgLabel: '', serviceProviderLabel: ''
};

const Harness: React.FC<{ onClose(): void }> = ({ onClose }) => {
  const state = useCalendarState({ loadPdf: () => Promise.reject(new Error('pdf exploded')) });
  if (!state.selected) { return null; }
  return (
    <TimesheetDialog
      contract={state.selected}
      generating={state.generating}
      error={state.timesheetError}
      onClearError={state.clearTimesheetError}
      onGenerate={state.generateTimesheet}
      onDismiss={onClose}
    />
  );
};

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) { await act(async () => { await Promise.resolve(); }); }
}

describe('TimesheetDialog', () => {
  it('shows a generation failure inside the dialog and re-enables Generate', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onClose = jest.fn();
    await act(async () => {
      ReactDom.render(
        <DataContext.Provider value={{ service: new LocalDataService({ demoUserId: 1 }), props }}>
          <Harness onClose={onClose} />
        </DataContext.Provider>,
        host
      );
    });
    await flush();
    const generate = (): HTMLButtonElement =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Generate')!;
    expect(generate()).toBeTruthy();
    await act(async () => { generate().click(); });
    await flush();
    const dialog = document.body;
    expect(dialog.textContent).toContain('pdf exploded');
    expect(generate().disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    ReactDom.unmountComponentAtNode(host);
  });
});
