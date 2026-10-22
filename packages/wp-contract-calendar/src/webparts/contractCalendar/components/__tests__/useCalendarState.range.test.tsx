import * as React from 'react';
import { renderHook, act } from '@testing-library/react-hooks/dom';
import type { Contract, DateKey, IDataService } from '@orpheussystems/shared-core';
import { DataContext } from '../../DataContext';
import type { IContractCalendarWebPartProps } from '../../IContractCalendarWebPartProps';
import { useCalendarState } from '../useCalendarState';
import { datesBetween } from '../rangeSelection';
import { ControlledService } from './controlledService';
import { activeToasts, unmountToastHost } from '@orpheussystems/shared-ui/toast';

const errorToasts = (): ReturnType<typeof activeToasts> => activeToasts().filter(t => t.kind === 'error');
beforeEach(() => { unmountToastHost(); });


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
async function loaded(service: ControlledService) {
  const hook = renderHook<IWrapperProps, ReturnType<typeof useCalendarState>>(() => useCalendarState(), {
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

async function stored(service: ControlledService, contractId: number, from: DateKey, to: DateKey): Promise<string[]> {
  return (await service.inner.getEntries(contractId, from, to)).map(e => `${e.date}:${e.type}`);
}

describe('useCalendarState.applyRange', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true }); });
  afterAll(() => { jest.useRealTimers(); });

  it('paints every eligible day of a range across a weekend and leaves the weekend alone', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    // Wed 4 Nov .. Tue 10 Nov 2026: Sat 7 / Sun 8 are blocked.
    await act(() => result.current.applyRange(datesBetween('2026-11-04', '2026-11-10'), 'paint'));
    expect(service.calls.upsertEntry).toBe(5);
    expect(await stored(service, 1, '2026-11-04', '2026-11-10')).toEqual([
      '2026-11-04:OffSiteFull', '2026-11-05:OffSiteFull', '2026-11-06:OffSiteFull', '2026-11-09:OffSiteFull', '2026-11-10:OffSiteFull'
    ]);
    expect(result.current.entries['2026-11-07']).toBeUndefined();
    expect(result.current.entries['2026-11-09']?.type).toBe('OffSiteFull');
    expect(errorToasts()).toHaveLength(0);
  });

  it('does not rewrite days that already hold the selected type when painting', async () => {
    const service = new ControlledService(1);
    await service.inner.upsertEntry({ contractId: 1, date: '2026-11-05', type: 'OffSiteFull' });
    const { result } = await loaded(service);
    await act(() => result.current.applyRange(datesBetween('2026-11-04', '2026-11-06'), 'paint'));
    expect(service.calls.upsertEntry).toBe(2);
  });

  it('erases only the days holding the selected type', async () => {
    const service = new ControlledService(1);
    await service.inner.upsertEntry({ contractId: 1, date: '2026-11-04', type: 'OffSiteFull' });
    await service.inner.upsertEntry({ contractId: 1, date: '2026-11-05', type: 'OnSiteFull' });
    await service.inner.upsertEntry({ contractId: 1, date: '2026-11-06', type: 'OffSiteFull' });
    const { result } = await loaded(service);
    await act(() => result.current.applyRange(datesBetween('2026-11-03', '2026-11-09'), 'erase'));
    expect(service.calls.deleteEntry).toBe(2);
    expect(service.calls.upsertEntry).toBe(0);
    expect(await stored(service, 1, '2026-11-03', '2026-11-09')).toEqual(['2026-11-05:OnSiteFull']);
    expect(result.current.entries['2026-11-04']).toBeUndefined();
    expect(result.current.entries['2026-11-05']?.type).toBe('OnSiteFull');
    expect(result.current.pendingOverlap).toBeUndefined();
  });

  it('asks once for the overlap days and writes them to the chosen contract, the rest to the selected one', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    // Thu 28 Jan .. Wed 3 Feb 2027; contract 1186 starts on 1 Feb.
    await act(() => result.current.applyRange(datesBetween('2027-01-28', '2027-02-03'), 'paint'));
    expect(result.current.pendingOverlap?.dates).toEqual(['2027-02-01', '2027-02-02', '2027-02-03']);
    expect(result.current.pendingOverlap?.candidates.map(c => c.id)).toEqual([1, 2]);
    expect(service.calls.upsertEntry).toBe(0); // nothing is written until the choice is made

    await act(() => result.current.resolveOverlap(2));
    expect(result.current.pendingOverlap).toBeUndefined();
    expect(await stored(service, 2, '2027-01-28', '2027-02-03')).toEqual([
      '2027-02-01:OffSiteFull', '2027-02-02:OffSiteFull', '2027-02-03:OffSiteFull'
    ]);
    expect(await stored(service, 1, '2027-01-28', '2027-02-03')).toEqual(['2027-01-28:OffSiteFull', '2027-01-29:OffSiteFull']);
    expect(result.current.entries['2027-01-28']?.type).toBe('OffSiteFull');
    expect(result.current.entries['2027-02-01']).toBeUndefined(); // moved to the sibling contract
  });

  it('writes only the non-overlap days when the overlap question is cancelled', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    await act(() => result.current.applyRange(datesBetween('2027-01-28', '2027-02-03'), 'paint'));
    await act(() => result.current.resolveOverlap(null));
    expect(await stored(service, 1, '2027-01-28', '2027-02-03')).toEqual(['2027-01-28:OffSiteFull', '2027-01-29:OffSiteFull']);
    expect(await stored(service, 2, '2027-01-28', '2027-02-03')).toEqual([]);
  });

  it('never asks about overlap days when erasing', async () => {
    const service = new ControlledService(1);
    await service.inner.upsertEntry({ contractId: 1, date: '2027-02-02', type: 'OffSiteFull' });
    await service.inner.upsertEntry({ contractId: 2, date: '2027-02-03', type: 'OffSiteFull' });
    const { result } = await loaded(service);
    await act(() => result.current.applyRange(datesBetween('2027-02-01', '2027-02-03'), 'erase'));
    expect(result.current.pendingOverlap).toBeUndefined();
    expect(await stored(service, 1, '2027-02-01', '2027-02-03')).toEqual([]);
    expect(await stored(service, 2, '2027-02-01', '2027-02-03')).toEqual(['2027-02-03:OffSiteFull']); // sibling untouched
  });

  it('keeps the saved days, rolls back the failed one and reports the count', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    service.setHoldWrites(true);
    let done: Promise<void> = Promise.resolve();
    act(() => { done = result.current.applyRange(datesBetween('2026-11-09', '2026-11-13'), 'paint'); });
    expect(service.held.map(h => h.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(result.current.entries['2026-11-11']?.type).toBe('OffSiteFull'); // optimistic

    await settle(() => service.held.forEach((h, i) => (i === 2 ? h.fail('Throttled') : h.succeed())));
    await act(() => done);
    expect(result.current.entries['2026-11-11']).toBeUndefined();
    for (const d of ['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13']) {
      expect(result.current.entries[d]?.type).toBe('OffSiteFull');
    }
    expect(errorToasts().map(t => t.title)).toEqual(['1 of 5 days could not be saved']);
  });

  it('is a no-op for a read-only user', async () => {
    const service = new ControlledService(3);
    const { result } = await loaded(service);
    expect(result.current.readOnly).toBe(true);
    await act(() => result.current.applyRange(datesBetween('2026-11-09', '2026-11-13'), 'paint'));
    expect(service.calls.upsertEntry + service.calls.deleteEntry).toBe(0);
    expect(result.current.pendingOverlap).toBeUndefined();
  });

  it('keeps single-click overlap as a one-day pending range', async () => {
    const service = new ControlledService(1);
    const { result } = await loaded(service);
    await act(() => result.current.clickDay('2027-02-05'));
    expect(result.current.pendingOverlap?.dates).toEqual(['2027-02-05']);
    await act(() => result.current.resolveOverlap(1));
    expect(await stored(service, 1, '2027-02-05', '2027-02-05')).toEqual(['2027-02-05:OffSiteFull']);
  });
});

/** Adds a third contract for user 1 covering 3 Feb .. 31 Mar 2027 (writes to it are held, never applied). */
class ThreeContractsService extends ControlledService {
  public async getMyContracts(): Promise<Contract[]> {
    const mine = await super.getMyContracts();
    const third: Contract = { ...mine[1], id: 5, title: '001187_2027', startDate: '2027-02-03', latestExecutionDate: '2027-03-31' };
    return [...mine, third];
  }
}

describe('useCalendarState.resolveOverlap with three contracts', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true }); });
  afterAll(() => { jest.useRealTimers(); });

  it('sends overlap days outside the chosen contract to the shown contract instead of dropping them', async () => {
    const service = new ThreeContractsService(1);
    const { result } = await loaded(service);
    expect(result.current.selected?.id).toBe(1);
    // Mon 1 .. Fri 5 Feb 2027: 1-2 covered by {1, 2}, 3-5 by {1, 2, 5}.
    await act(() => result.current.applyRange(datesBetween('2027-02-01', '2027-02-05'), 'paint'));
    expect(result.current.pendingOverlap?.dates).toEqual(['2027-02-01', '2027-02-02', '2027-02-03', '2027-02-04', '2027-02-05']);
    expect(result.current.pendingOverlap?.candidates.map(c => c.id)).toEqual([1, 2, 5]);

    service.setHoldWrites(true);
    act(() => { result.current.resolveOverlap(5).catch(() => undefined); });
    expect(service.held.map(h => `${h.contractId}:${h.date}`).sort()).toEqual([
      '1:2027-02-01', '1:2027-02-02', '5:2027-02-03', '5:2027-02-04', '5:2027-02-05'
    ]);
  });
});
