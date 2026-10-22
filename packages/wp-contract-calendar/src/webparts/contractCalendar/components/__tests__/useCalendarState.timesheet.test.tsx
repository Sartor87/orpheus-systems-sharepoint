import * as React from 'react';
import { renderHook, act } from '@testing-library/react-hooks/dom';
import { IDataService, LocalDataService } from '@orpheussystems/shared-core';
import type { TimesheetModel } from '@orpheussystems/shared-ui/timesheet';
import { DataContext } from '../../DataContext';
import type { IContractCalendarWebPartProps } from '../../IContractCalendarWebPartProps';
import { useCalendarState } from '../useCalendarState';

const baseProps: IContractCalendarWebPartProps = {
  useLocalData: true, demoUserId: 1, contractsListId: '', entriesListId: '', holidaysListId: '',
  monthsToShow: 0, blockWeekends: true, approvingOrgLabel: '', serviceProviderLabel: ''
};

type Hook = ReturnType<typeof renderHook<{}, ReturnType<typeof useCalendarState>>>;

async function loaded(demoUserId: number, download: jest.Mock): Promise<Hook> {
  const service: IDataService = new LocalDataService({ demoUserId });
  const value = { service, props: { ...baseProps, demoUserId } };
  const wrapper: React.FC = ({ children }) => <DataContext.Provider value={value}>{children}</DataContext.Provider>;
  const loadPdf = (): Promise<{ downloadTimesheet: jest.Mock }> => Promise.resolve({ downloadTimesheet: download });
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
    expect(result.current.error).toBeUndefined();
  });

  it('reports a failure through error', async () => {
    const download = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = await loaded(1, download);
    await act(async () => { await result.current.generateTimesheet({ from: '2026-02-02', to: '2026-03-31' }); });
    expect(result.current.error).toContain('boom');
  });
});
