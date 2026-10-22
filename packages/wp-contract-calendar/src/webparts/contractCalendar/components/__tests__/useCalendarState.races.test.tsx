import * as React from 'react';
import { renderHook, act } from '@testing-library/react-hooks/dom';
import type { IDataService } from '@orpheussystems/shared-core';
import { DataContext } from '../../DataContext';
import type { IContractCalendarWebPartProps } from '../../IContractCalendarWebPartProps';
import { useCalendarState } from '../useCalendarState';
import { ControlledService } from './controlledService';

const baseProps: IContractCalendarWebPartProps = {
  useLocalData: true,
  demoUserId: 1,
  contractsListId: '',
  entriesListId: '',
  holidaysListId: '',
  monthsToShow: 0,
  blockWeekends: true,
  approvingOrgLabel: '',
  serviceProviderLabel: ''
};

interface IWrapperProps { service: IDataService }

const Wrapper: React.FC<IWrapperProps> = ({ service, children }) => (
  <DataContext.Provider value={{ service, props: baseProps }}>{children}</DataContext.Provider>
);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(service: ControlledService) {
  return renderHook<IWrapperProps, ReturnType<typeof useCalendarState>>(() => useCalendarState(), {
    wrapper: Wrapper as React.ComponentType<IWrapperProps>,
    initialProps: { service }
  });
}

/** Starts a write without awaiting it, so the test can settle it later. */
function start(pending: Promise<void>): void {
  pending.catch(() => undefined);
}

/** Lets resolved service promises and the resulting state updates run. */
async function settle(fn?: () => void): Promise<void> {
  await act(async () => {
    if (fn) { fn(); }
    for (let i = 0; i < 20; i++) { await Promise.resolve(); }
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function loaded(service: ControlledService) {
  const hook = setup(service);
  await hook.waitFor(() => !hook.result.current.loading && !!hook.result.current.selected);
  return hook;
}

const DAY = '2026-11-03'; // Tuesday, no fixture entry, inside contract 1185 only

describe('useCalendarState write ordering', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true }); });
  afterAll(() => { jest.useRealTimers(); });

  it('keeps the latest click while an earlier write lands', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);

    act(() => start(result.current.clickDay(DAY)));           // upsert OffSiteFull
    expect(result.current.entries[DAY]?.type).toBe('OffSiteFull');
    act(() => start(result.current.clickDay(DAY)));           // same type -> delete
    expect(result.current.entries[DAY]).toBeUndefined();

    await settle(() => service.held[0].succeed());               // stale upsert lands; delete still pending
    expect(result.current.entries[DAY]).toBeUndefined();
    await settle(() => service.held[1].succeed());               // delete lands
    expect(result.current.entries[DAY]).toBeUndefined();
  });

  it('does not let a stale rejection roll back over a later pending write', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);

    act(() => start(result.current.clickDay(DAY)));           // A: OffSiteFull
    act(() => result.current.setSelectionType('OnSiteFull'));
    act(() => start(result.current.clickDay(DAY)));           // B: OnSiteFull

    await settle(() => service.held[0].fail());                  // stale A fails while B waits
    expect(result.current.entries[DAY]?.type).toBe('OnSiteFull');
    expect(result.current.error).toBeUndefined();
    await settle(() => service.held[1].succeed());
    expect(result.current.entries[DAY]?.type).toBe('OnSiteFull');
  });

  it('rolls back to the last confirmed write, not the click-time snapshot', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);

    act(() => start(result.current.clickDay(DAY)));           // upsert OffSiteFull
    act(() => start(result.current.clickDay(DAY)));           // delete

    await settle(() => service.held[0].succeed());               // first write confirmed while the delete is pending
    expect(result.current.entries[DAY]).toBeUndefined();         // still shows the pending delete
    await settle(() => service.held[1].fail());                  // delete rejected
    expect(result.current.entries[DAY]?.type).toBe('OffSiteFull');
    expect(result.current.entries[DAY]?.id).toBeDefined();       // the saved entry, not an optimistic copy
    expect(result.current.error).toBe('Delete failed');
  });

  it('shows the optimistic entry, then rolls it back with an error', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);

    act(() => start(result.current.clickDay(DAY)));
    expect(result.current.entries[DAY]?.type).toBe('OffSiteFull');
    expect(result.current.totals.offSiteFull).toBeGreaterThan(0);
    const before = result.current.totals.offSiteFull;

    await settle(() => service.held[0].fail('Date is blocked'));
    expect(result.current.entries[DAY]).toBeUndefined();
    expect(result.current.totals.offSiteFull).toBe(before - 1);
    expect(result.current.error).toBe('Date is blocked');

    service.setHoldWrites(false);
    await act(() => result.current.clickDay(DAY));
    expect(result.current.error).toBeUndefined();
  });

  it('rolls back a failed move to the sibling contract', async () => {
    const service = new ControlledService(1);
    await service.inner.upsertEntry({ contractId: 1, date: '2027-02-05', type: 'OnSiteFull' });
    const { result } = await loaded(service);
    expect(result.current.entries['2027-02-05']?.type).toBe('OnSiteFull');
    service.setHoldWrites(true);

    await act(() => result.current.clickDay('2027-02-05'));     // OffSiteFull on an overlap date
    expect(result.current.pendingOverlap?.candidates.map(c => c.id)).toEqual([1, 2]);
    act(() => start(result.current.resolveOverlap(2)));
    expect(result.current.entries['2027-02-05']).toBeUndefined(); // optimistically moved off contract 1

    await settle(() => service.held[0].fail('Move failed'));
    expect(result.current.entries['2027-02-05']?.type).toBe('OnSiteFull');
    expect(result.current.error).toBe('Move failed');
    expect((await service.inner.getEntries(2, '2027-02-05', '2027-02-05'))).toEqual([]);
  });

  it('clears the error when it is dismissed', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);
    act(() => start(result.current.clickDay(DAY)));
    await settle(() => service.held[0].fail());
    expect(result.current.error).toBeDefined();
    act(() => result.current.dismissError());
    expect(result.current.error).toBeUndefined();
  });
});

describe('useCalendarState load failures and service rebuilds', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true }); });
  afterAll(() => { jest.useRealTimers(); });

  it('keeps the grid locked when entries fail to load, and retry recovers', async () => {
    const service = new ControlledService(1);
    service.setFailEntries(true);
    const { result, waitFor } = setup(service);
    await waitFor(() => !!result.current.loadError);
    expect(result.current.loading).toBe(false);
    expect(result.current.loadError).toBe('Entries list unavailable');

    await act(() => result.current.clickDay(DAY));
    expect(service.calls.upsertEntry).toBe(0);

    service.setFailEntries(false);
    act(() => result.current.retryLoad());
    await waitFor(() => !result.current.loading && !result.current.loadError);
    expect(result.current.entries['2026-02-06']?.type).toBe('OnSiteFull');
    await act(() => result.current.clickDay(DAY));
    expect(service.calls.upsertEntry).toBe(1);
    expect(result.current.entries[DAY]?.type).toBe('OffSiteFull');
  });

  it('locks the grid during a rebuild refetch, fetches once, and clears a previous error', async () => {
    const first = new ControlledService(1);
    const { result, rerender, waitFor } = await loaded(first);
    first.setHoldWrites(true);
    act(() => start(result.current.clickDay(DAY)));
    await settle(() => first.held[0].fail());
    expect(result.current.error).toBeDefined();

    const second = new ControlledService(1);
    second.holdEntries();
    rerender({ service: second });
    await settle();
    expect(result.current.loading).toBe(true);
    expect(result.current.entries).toEqual({});
    await act(() => result.current.clickDay(DAY));
    expect(first.calls.upsertEntry + second.calls.upsertEntry).toBe(1);

    second.releaseEntries();
    await waitFor(() => !result.current.loading);
    expect(result.current.entries['2026-02-06']?.type).toBe('OnSiteFull');
    expect(result.current.error).toBeUndefined();
    expect(second.calls.getEntries).toBe(1);
  });
});

describe('useCalendarState service write serialization', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true }); });
  afterAll(() => { jest.useRealTimers(); });

  it('never has two service writes in flight for the same date', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);

    act(() => start(result.current.clickDay(DAY)));             // upsert
    act(() => start(result.current.clickDay(DAY)));             // delete, queued behind the upsert
    expect(result.current.entries[DAY]).toBeUndefined();         // optimistic UI is immediate
    expect(service.held.map(h => h.op)).toEqual(['upsert']);
    expect(service.calls.upsertEntry + service.calls.deleteEntry).toBe(1);

    await settle(() => service.held[0].succeed());
    expect(service.held.map(h => h.op)).toEqual(['upsert', 'delete']);
    await settle(() => service.held[1].succeed());

    expect(result.current.entries[DAY]).toBeUndefined();
    expect(await service.inner.getEntries(1, DAY, DAY)).toEqual([]);
  });

  it('issues the queued write even when the earlier one fails, and the server matches the UI', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);

    act(() => start(result.current.clickDay(DAY)));             // OffSiteFull
    act(() => result.current.setSelectionType('OnSiteHalf'));
    act(() => start(result.current.clickDay(DAY)));             // OnSiteHalf, queued
    expect(service.held).toHaveLength(1);

    await settle(() => service.held[0].fail());
    expect(service.held).toHaveLength(2);
    await settle(() => service.held[1].succeed());

    expect(result.current.entries[DAY]?.type).toBe('OnSiteHalf');
    expect((await service.inner.getEntries(1, DAY, DAY)).map(e => e.type)).toEqual(['OnSiteHalf']);
  });

  it('runs writes for different dates concurrently', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);

    act(() => start(result.current.clickDay(DAY)));
    act(() => start(result.current.clickDay('2026-11-04')));
    expect(service.held.map(h => h.date)).toEqual([DAY, '2026-11-04']);

    await settle(() => service.held[1].succeed());
    await settle(() => service.held[0].succeed());
    expect(result.current.entries[DAY]?.type).toBe('OffSiteFull');
    expect(result.current.entries['2026-11-04']?.type).toBe('OffSiteFull');
  });
});
