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
    const { result } = await loaded(service, { loadPdf: () => Promise.resolve({ downloadTimesheet, downloadTimesheetFromTemplate: jest.fn(), sampleTimesheetTemplate: '' }) });
    await act(async () => { await result.current.generateTimesheet({ from: '2026-02-02', to: '2026-02-28' }); });
    expect(activeToasts()[0].title).toBe('Timesheet downloaded');
    expect(activeToasts()[0].text).toMatch(/^Timesheet_.*\.pdf$/);
  });

  it('toasts the days counted against the contract chosen for an overlap', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    const title2 = (result.current.contracts.filter(c => c.id === 2)[0]).title;
    await act(() => result.current.applyRange(datesBetween('2027-01-28', '2027-02-03'), 'paint'));
    await act(() => result.current.resolveOverlap(2));
    const titles = activeToasts().map(t => t.title);
    expect(titles).toContain(`Counted 3 days against ${title2}`);
    expect(titles).toContain('Saved 2 days to 001185_2026');
  });

  it('toasts a single-day overlap choice', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    const title2 = (result.current.contracts.filter(c => c.id === 2)[0]).title;
    await act(() => result.current.clickDay('2027-02-02'));
    await act(() => result.current.resolveOverlap(2));
    expect(activeToasts()[0].title).toBe(`Counted 1 day against ${title2}`);
  });

  it('retries a failed single-day save', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);
    act(() => { result.current.clickDay('2026-11-09').catch(() => undefined); });
    await settle(() => service.held[0].fail('Throttled'));
    const err = activeToasts().filter(t => t.kind === 'error')[0];
    expect(err.title).toBe('Could not save 9 Nov 2026');
    service.setHoldWrites(false);
    const before = service.calls.upsertEntry;
    await act(async () => {
      (err.action as { onClick(): void }).onClick();
      for (let i = 0; i < 20; i++) { await Promise.resolve(); }
    });
    expect(service.calls.upsertEntry - before).toBe(1);
    expect(result.current.entries['2026-11-09']?.type).toBe('OffSiteFull');
  });

  it('does not write on Retry after the contract was switched', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    const title1 = (result.current.contracts.filter(c => c.id === 1)[0]).title;
    service.setHoldWrites(true);
    act(() => { result.current.clickDay('2026-11-09').catch(() => undefined); });
    await settle(() => service.held[0].fail('Throttled'));
    const err = activeToasts().filter(t => t.kind === 'error')[0];
    service.setHoldWrites(false);
    await settle(() => result.current.selectContract(2));
    const before = service.calls.upsertEntry;
    await act(async () => {
      (err.action as { onClick(): void }).onClick();
      for (let i = 0; i < 20; i++) { await Promise.resolve(); }
    });
    expect(service.calls.upsertEntry).toBe(before);
    expect(activeToasts()[0].title).toBe(`Switch back to ${title1} to retry.`);
  });

  it('refreshes one write toast for rapid saves instead of stacking', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    await act(() => result.current.clickDay('2026-11-09'));
    await act(() => result.current.clickDay('2026-11-10'));
    const saved = activeToasts().filter(t => t.kind === 'success');
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe('Saved 10 Nov 2026');
  });

  it('dismisses its write toasts when the contract is switched', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    await act(() => result.current.clickDay('2026-11-09'));
    expect(activeToasts()).toHaveLength(1);
    await settle(() => result.current.selectContract(2));
    expect(activeToasts()).toHaveLength(0);
  });

  it('dismisses its toasts when the calendar unmounts', async () => {
    const service = new ControlledService(1);
    const { result, unmount } = await loaded(service);
    await act(() => result.current.clickDay('2026-11-09'));
    expect(activeToasts()).toHaveLength(1);
    unmount();
    expect(activeToasts()).toHaveLength(0);
  });
});
