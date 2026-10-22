import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { setIconOptions } from '@fluentui/react';
import { IDataService, LocalDataService } from '@orpheussystems/shared-core';
import { DataContext } from '../../DataContext';
import type { IContractCalendarWebPartProps } from '../../IContractCalendarWebPartProps';
import ContractCalendar from '../ContractCalendar';
import { ControlledService } from './controlledService';

const props: IContractCalendarWebPartProps = {
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

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

const hosts: HTMLDivElement[] = [];

async function mount(demoUserId: number, service: IDataService = new LocalDataService({ demoUserId })): Promise<{ host: HTMLDivElement; service: IDataService }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  await act(async () => {
    ReactDom.render(
      <DataContext.Provider value={{ service, props: { ...props, demoUserId } }}>
        <ContractCalendar isDarkTheme={false} />
      </DataContext.Provider>,
      host
    );
  });
  await flush();
  return { host, service };
}

function day(host: HTMLElement, label: string): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>(`button[aria-label^="${label},"]`);
  if (!el) { throw new Error(`No day button for ${label}`); }
  return el;
}

describe('ContractCalendar', () => {
  beforeAll(() => {
    // SharePoint registers the Fluent icon font; jsdom does not.
    setIconOptions({ disableWarnings: true });
    jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true });
  });
  afterAll(() => { jest.useRealTimers(); });
  afterEach(() => {
    hosts.splice(0).forEach(h => { ReactDom.unmountComponentAtNode(h); h.remove(); });
  });

  it('renders the header metadata and Monday-first months from the current month', async () => {
    const { host } = await mount(1);
    const text = host.textContent || '';
    for (const label of ['Framework contract', 'FWC-2024-01', 'Modality', 'Hybrid', 'Specific contract', '001185_2026',
      'Starting date', '2 Feb 2026', 'SC latest execution date', '19 Feb 2027', 'On-site / Off-site target', '63 / 147 days']) {
      expect(text).toContain(label);
    }
    const months = Array.from(host.querySelectorAll('section[aria-label]')).map(s => s.getAttribute('aria-label'));
    expect(months).toEqual(['October 2026', 'November 2026', 'December 2026', 'January 2027', 'February 2027']);
    // 1 October 2026 is a Thursday: three padding cells before it.
    const firstGrid = host.querySelectorAll('section[aria-label="October 2026"] button');
    expect(firstGrid[0].getAttribute('aria-label')).toBe('Thursday 1 October 2026, no entry');
  });

  it('marks a day with the selected type and announces it', async () => {
    const { host, service } = await mount(1);
    await act(async () => { day(host, 'Tuesday 3 November 2026').click(); });
    await flush();
    expect(day(host, 'Tuesday 3 November 2026').getAttribute('aria-label')).toBe('Tuesday 3 November 2026, off-site full day');
    expect((await service.getEntries(1, '2026-11-03', '2026-11-03')).length).toBe(1);
  });

  it('marks weekends as blocked and disabled', async () => {
    const { host } = await mount(1);
    const saturday = day(host, 'Saturday 24 October 2026');
    expect(saturday.getAttribute('aria-disabled')).toBe('true');
    expect(saturday.getAttribute('aria-label')).toBe('Saturday 24 October 2026, blocked: Weekend');
  });

  it('disables every day for a contract manager', async () => {
    const { host } = await mount(3);
    expect(day(host, 'Tuesday 3 November 2026').getAttribute('aria-disabled')).toBe('true');
    expect(host.textContent).toContain('View only');
  });

  it('hides the grid after a failed load and recovers through Retry', async () => {
    const service = new ControlledService(1);
    service.setFailEntries(true);
    const { host } = await mount(1, service);
    expect(host.textContent).toContain('Could not load the calendar: Entries list unavailable');
    expect(host.querySelectorAll('section[aria-label] button').length).toBe(0);

    service.setFailEntries(false);
    const retry = Array.from(host.querySelectorAll('button')).filter(b => b.textContent === 'Retry')[0];
    await act(async () => { retry.click(); });
    await flush();
    expect(host.textContent).not.toContain('Could not load the calendar');
    expect(day(host, 'Tuesday 3 November 2026').getAttribute('aria-disabled')).toBeNull();
  });
});
