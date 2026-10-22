import * as React from 'react';
import { renderHook, act } from '@testing-library/react-hooks/dom';
import type { IDataService } from '@orpheussystems/shared-core';
import { DataContext } from '../../DataContext';
import type { IContractCalendarWebPartProps } from '../../IContractCalendarWebPartProps';
import { useCalendarState } from '../useCalendarState';
import type { CalendarStateOptions } from '../useCalendarState';
import { datesBetween } from '../rangeSelection';
import { setIconOptions } from '@fluentui/react';
import { activeToasts, unmountToastHost } from '@orpheussystems/shared-ui/toast';

setIconOptions({ disableWarnings: true });
import { ControlledService } from './controlledService';

const baseProps: IContractCalendarWebPartProps = {
  useLocalData: true, demoUserId: 1, contractsListId: '', entriesListId: '', holidaysListId: '',
  monthsToShow: 0, blockWeekends: true, approvingOrgLabel: '', serviceProviderLabel: ''
};


interface IWrapperProps { service: IDataService }
const Wrapper: React.FC<IWrapperProps> = ({ service, children }) => (
  <>
    <DataContext.Provider value={{ service, props: baseProps }}>{children}</DataContext.Provider>
  </>
);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function loaded(service: ControlledService, options: CalendarStateOptions = {}) {
  unmountToastHost();
  const hook = renderHook<IWrapperProps, ReturnType<typeof useCalendarState>>(() => useCalendarState(options), {
    wrapper: Wrapper as React.ComponentType<IWrapperProps>,
    initialProps: { service }
  });
  await hook.waitFor(() => !hook.result.current.loading && !!hook.result.current.selected);
  return hook;
}

async function settle(fn?: () => void): Promise<void> {
  await act(async () => {
    if (fn) { fn(); }
    for (let i = 0; i < 20; i++) { await Promise.resolve(); }
  });
}

describe('useCalendarState toasts', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true }); });
  afterAll(() => { jest.useRealTimers(); });

  it('toasts a saved range and a saved single day', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    await act(() => result.current.applyRange(datesBetween('2026-11-04', '2026-11-06'), 'paint'));
    expect(activeToasts()[0].kind).toBe('success');
    expect(activeToasts()[0].title).toBe('Saved 3 days to 001185_2026');
    await act(() => result.current.clickDay('2026-11-09'));
    expect(activeToasts()[0].title).toBe('Saved 9 Nov 2026');
  });

  it('retries only the failed dates', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);
    let done: Promise<void> = Promise.resolve();
    act(() => { done = result.current.applyRange(datesBetween('2026-11-09', '2026-11-11'), 'paint'); });
    await settle(() => service.held.forEach((h, i) => (i === 1 ? h.fail('Throttled') : h.succeed())));
    await act(() => done);
    const err = activeToasts().filter(t => t.kind === 'error')[0];
    expect(err.title).toBe('1 of 3 days could not be saved');
    service.setHoldWrites(false);
    const before = service.calls.upsertEntry;
    await act(async () => {
      (err.action as { onClick(): void }).onClick();
      for (let i = 0; i < 20; i++) { await Promise.resolve(); }
    });
    expect(service.calls.upsertEntry - before).toBe(1);
    expect(result.current.entries['2026-11-10']?.type).toBe('OffSiteFull');
  });

  it('toasts the timesheet download with its file name', async () => {
    const service = new ControlledService(1);
    const downloadTimesheet = jest.fn().mockResolvedValue(undefined);
    const { result } = await loaded(service, { loadPdf: () => Promise.resolve({ downloadTimesheet }) });
    await act(async () => { await result.current.generateTimesheet({ from: '2026-02-02', to: '2026-02-28' }); });
    expect(activeToasts()[0].title).toBe('Timesheet downloaded');
    expect(activeToasts()[0].text).toMatch(/^Timesheet_.*\.pdf$/);
  });
});
