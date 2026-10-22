import * as React from 'react';
import { renderHook, act } from '@testing-library/react-hooks/dom';
import { IDataService, LocalDataService } from '@orpheussystems/shared-core';
import { DataContext } from '../../DataContext';
import type { IContractCalendarWebPartProps } from '../../IContractCalendarWebPartProps';
import { computeMonths, useCalendarState } from '../useCalendarState';
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

type Setup = ReturnType<typeof renderHook<{}, ReturnType<typeof useCalendarState>>> & { service: IDataService };

function setup(demoUserId: number, props: Partial<IContractCalendarWebPartProps> = {}): Setup {
  const service: IDataService = new LocalDataService({ demoUserId });
  const value = { service, props: { ...baseProps, demoUserId, ...props } };
  const wrapper: React.FC = ({ children }) => (
    <DataContext.Provider value={value}>{children}</DataContext.Provider>
  );
  const hook = renderHook(() => useCalendarState(), { wrapper });
  return { service, ...hook };
}

async function loaded(demoUserId: number, props: Partial<IContractCalendarWebPartProps> = {}): Promise<Setup> {
  const ctx = setup(demoUserId, props);
  await ctx.waitFor(() => !ctx.result.current.loading && !!ctx.result.current.selected);
  return ctx;
}

describe('useCalendarState', () => {
  // Pin "today" inside contract 1185's period; timers still advance in real time for waitFor.
  beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true }); });
  afterAll(() => { jest.useRealTimers(); });

  it('selects the contract running today and loads its entries', async () => {
    const { result } = await loaded(1);
    expect(result.current.contracts.map(c => c.id)).toEqual([1, 2]);
    expect(result.current.selected?.id).toBe(1);
    expect(result.current.entries['2026-02-06']?.type).toBe('OnSiteFull');
    expect(result.current.readOnly).toBe(false);
  });

  it('honours initialContractId when visible', async () => {
    const { result } = await loaded(1, { initialContractId: 2 });
    expect(result.current.selected?.id).toBe(2);
  });

  it('removes the entry when clicking a day with the same type', async () => {
    const { result, service } = await loaded(1);
    act(() => result.current.setSelectionType('OnSiteFull'));
    await act(() => result.current.clickDay('2026-02-06'));
    expect(result.current.entries['2026-02-06']).toBeUndefined();
    const stored = await service.getEntries(1, '2026-02-06', '2026-02-06');
    expect(stored).toEqual([]);
  });

  it('replaces the type when clicking a day with a different type', async () => {
    const { result, service } = await loaded(1);
    act(() => result.current.setSelectionType('OffSiteHalf'));
    await act(() => result.current.clickDay('2026-02-06'));
    expect(result.current.entries['2026-02-06']?.type).toBe('OffSiteHalf');
    const stored = await service.getEntries(1, '2026-02-06', '2026-02-06');
    expect(stored.map(e => e.type)).toEqual(['OffSiteHalf']);
    expect(result.current.totals.offSiteHalf).toBeGreaterThan(0);
  });

  it('ignores a blocked date', async () => {
    const { result, service } = await loaded(1);
    const before = result.current.totals.totalDays;
    await act(() => result.current.clickDay('2026-03-03')); // Liberation Day (BG)
    expect(result.current.entries['2026-03-03']).toBeUndefined();
    expect(errorToasts()).toHaveLength(0);
    expect(result.current.totals.totalDays).toBe(before);
    expect(await service.getEntries(1, '2026-03-03', '2026-03-03')).toEqual([]);
  });

  it('asks which contract to use on an overlap date and writes to the chosen one', async () => {
    const { result, service } = await loaded(1);
    await act(() => result.current.clickDay('2027-02-05'));
    expect(result.current.pendingOverlap?.dates).toEqual(['2027-02-05']);
    expect(result.current.pendingOverlap?.candidates.map(c => c.id)).toEqual([1, 2]);
    expect(result.current.pendingOverlap?.candidates.map(c => c.title)).toEqual(['001185_2026', '001186_2027']);
    await act(() => result.current.resolveOverlap(2));
    expect(result.current.pendingOverlap).toBeUndefined();
    expect((await service.getEntries(2, '2027-02-05', '2027-02-05')).map(e => e.type)).toEqual(['OffSiteFull']);
    expect(await service.getEntries(1, '2027-02-05', '2027-02-05')).toEqual([]);
    expect(result.current.entries['2027-02-05']).toBeUndefined();
  });

  it('cancels an overlap without writing anything', async () => {
    const { result, service } = await loaded(1);
    await act(() => result.current.clickDay('2027-02-05'));
    await act(() => result.current.resolveOverlap(null));
    expect(result.current.pendingOverlap).toBeUndefined();
    expect(await service.getEntries(1, '2027-02-05', '2027-02-05')).toEqual([]);
    expect(await service.getEntries(2, '2027-02-05', '2027-02-05')).toEqual([]);
  });

  it('rolls back and reports an error when the service rejects', async () => {
    const { result, service } = await loaded(1, { blockWeekends: false });
    // Weekends are not blocked in the UI here, but the service rejects them.
    await act(() => result.current.clickDay('2026-02-07'));
    expect(result.current.entries['2026-02-07']).toBeUndefined();
    expect(errorToasts()[0].text).toMatch(/blocked/);
    await act(() => result.current.clickDay('2026-02-09'));
    expect(activeToasts()[0].kind).toBe('success');
    expect(result.current.entries['2026-02-09']?.type).toBe('OffSiteFull');
    expect((await service.getEntries(1, '2026-02-09', '2026-02-09')).length).toBe(1);
  });

  it('is read-only for a contract manager', async () => {
    const { result, service } = await loaded(3);
    expect(result.current.readOnly).toBe(true);
    await act(() => result.current.clickDay('2026-02-09'));
    expect(result.current.entries['2026-02-09']).toBeUndefined();
    expect(await service.getEntries(1, '2026-02-09', '2026-02-09')).toEqual([]);
  });
});

describe('computeMonths', () => {
  const contract = { startDate: '2026-02-02', latestExecutionDate: '2027-02-19' };

  it('starts at the current month when the contract is running and caps at 12', () => {
    const months = computeMonths(contract, 0, '2026-10-22');
    expect(months[0]).toEqual({ year: 2026, month: 10 });
    expect(months[months.length - 1]).toEqual({ year: 2027, month: 2 });
    expect(months).toHaveLength(5);
  });

  it('starts at the contract start when not yet running and honours monthsToShow', () => {
    const months = computeMonths(contract, 3, '2025-12-01');
    expect(months).toEqual([{ year: 2026, month: 2 }, { year: 2026, month: 3 }, { year: 2026, month: 4 }]);
  });

  it('caps a long span at 12 months when monthsToShow is 0', () => {
    expect(computeMonths({ startDate: '2025-01-01', latestExecutionDate: '2027-12-31' }, 0, '2024-01-01')).toHaveLength(12);
  });

  it('shows the full contract once it has ended', () => {
    const months = computeMonths(contract, 0, '2028-01-01');
    expect(months[0]).toEqual({ year: 2026, month: 2 });
    expect(months).toHaveLength(12);
  });
});
