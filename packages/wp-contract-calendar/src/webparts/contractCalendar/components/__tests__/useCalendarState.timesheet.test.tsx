import * as React from 'react';
import { renderHook, act } from '@testing-library/react-hooks/dom';
import { IDataService, LocalDataService } from '@orpheussystems/shared-core';
import type { TimesheetModel } from '@orpheussystems/shared-ui/timesheet';
import { DataContext } from '../../DataContext';
import type { IContractCalendarWebPartProps } from '../../IContractCalendarWebPartProps';
import { TimesheetPdfModule, useCalendarState } from '../useCalendarState';
import { activeToasts, unmountToastHost } from '@orpheussystems/shared-ui/toast';

const errorToasts = (): ReturnType<typeof activeToasts> => activeToasts().filter(t => t.kind === 'error');
beforeEach(() => { unmountToastHost(); });


const baseProps: IContractCalendarWebPartProps = {
  useLocalData: true, demoUserId: 1, contractsListId: '', entriesListId: '', holidaysListId: '',
  monthsToShow: 0, blockWeekends: true, approvingOrgLabel: '', serviceProviderLabel: ''
};

type Hook = ReturnType<typeof renderHook<{}, ReturnType<typeof useCalendarState>>>;

async function loaded(demoUserId: number, download: jest.Mock): Promise<Hook> {
  const service: IDataService = new LocalDataService({ demoUserId });
  const value = { service, props: { ...baseProps, demoUserId } };
  const wrapper: React.FC = ({ children }) => <DataContext.Provider value={value}>{children}</DataContext.Provider>;
  const loadPdf = (): Promise<TimesheetPdfModule> => Promise.resolve({ downloadTimesheet: download, downloadTimesheetFromTemplate: jest.fn(), sampleTimesheetTemplate: '' });
  const hook = renderHook(() => useCalendarState({ loadPdf }), { wrapper });
  await hook.waitFor(() => !hook.result.current.loading && !!hook.result.current.selected);
  return hook;
}

describe('generateTimesheet', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true }); });
  afterAll(() => { jest.useRealTimers(); });

  it('builds the model for the period and downloads it', async () => {
    const download = jest.fn().mockResolvedValue(undefined);
    const { result } = await loaded(1, download);
    await act(async () => { await result.current.generateTimesheet({ from: '2026-02-02', to: '2027-02-19' }); });
    expect(download).toHaveBeenCalledTimes(1);
    const [model, name] = download.mock.calls[0] as [TimesheetModel, string];
    expect(model.header.specificContract).toBe('001185_2026');
    expect(model.labels).toEqual({ approvingOrg: 'Client approval', serviceProvider: 'Service provider' });
    expect(name).toBe('Timesheet_1185-Jane-Doe_2026-02-02_2027-02-19.pdf');
  });

  it('is available to a manager', async () => {
    const download = jest.fn().mockResolvedValue(undefined);
    const { result } = await loaded(3, download);
    expect(result.current.readOnly).toBe(true);
    await act(async () => { await result.current.generateTimesheet({ from: '2026-02-02', to: '2026-03-31' }); });
    expect(download).toHaveBeenCalledTimes(1);
    expect(errorToasts()).toHaveLength(0);
  });

  it('reports a failure through error', async () => {
    const download = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = await loaded(1, download);
    await act(async () => { await result.current.generateTimesheet({ from: '2026-02-02', to: '2026-03-31' }); });
    expect(result.current.timesheetError).toContain('boom');
    expect(result.current.generating).toBe(false);
  });

  it('queries the service for exactly the requested period and applies label overrides', async () => {
    const download = jest.fn().mockResolvedValue(undefined);
    const service = new LocalDataService({ demoUserId: 1 });
    const getEntries = jest.spyOn(service, 'getEntries');
    const getHolidays = jest.spyOn(service, 'getHolidays');
    const value = { service, props: { ...baseProps, approvingOrgLabel: 'Ministry', serviceProviderLabel: 'Vendor' } };
    const wrapper: React.FC = ({ children }) => <DataContext.Provider value={value}>{children}</DataContext.Provider>;
    const loadPdf = (): Promise<TimesheetPdfModule> => Promise.resolve({ downloadTimesheet: download, downloadTimesheetFromTemplate: jest.fn(), sampleTimesheetTemplate: '' });
    const { result, waitFor } = renderHook(() => useCalendarState({ loadPdf }), { wrapper });
    await waitFor(() => !result.current.loading && !!result.current.selected);
    const c = result.current.selected!;
    getEntries.mockClear();
    getHolidays.mockClear();
    await act(async () => { await result.current.generateTimesheet({ from: '2026-03-02', to: '2026-04-30' }); });
    expect(getEntries).toHaveBeenCalledWith(c.id, '2026-03-02', '2026-04-30');
    expect(getHolidays).toHaveBeenCalledWith(c.country, '2026-03-02', '2026-04-30');
    const [model] = download.mock.calls[0] as [TimesheetModel];
    expect(model.labels).toEqual({ approvingOrg: 'Ministry', serviceProvider: 'Vendor' });
    expect(model.period).toEqual({ from: '2026-03-02', to: '2026-04-30' });
  });

  it('ignores a second call while one is in flight', async () => {
    let release: () => void = () => undefined;
    const download = jest.fn().mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    const { result } = await loaded(1, download);
    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      first = result.current.generateTimesheet({ from: '2026-02-02', to: '2026-03-31' });
      second = result.current.generateTimesheet({ from: '2026-02-02', to: '2026-03-31' });
      await Promise.resolve();
    });
    expect(await second).toBe(false);
    await act(async () => { release(); await first; });
    expect(download).toHaveBeenCalledTimes(1);
  });
});
