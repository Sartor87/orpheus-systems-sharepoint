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

function unmountAll(): void {
  hosts.splice(0).forEach(h => { ReactDom.unmountComponentAtNode(h); h.remove(); });
}

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
    unmountAll();
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

  it('shows the checked selection type and a separate legend and hint', async () => {
    const { host } = await mount(1);
    const radios = Array.from(host.querySelectorAll<HTMLInputElement>('fieldset input[type="radio"]'));
    expect(radios.map(r => r.value)).toEqual(['OffSiteFull', 'OffSiteHalf', 'OnSiteFull', 'OnSiteHalf']);
    expect(radios.filter(r => r.checked).map(r => r.value)).toEqual(['OffSiteFull']);
    expect(radios[0].closest('label')?.className).toContain('choiceChecked');

    await act(async () => { radios[3].click(); });
    expect(radios.filter(r => r.checked).map(r => r.value)).toEqual(['OnSiteHalf']);
    expect(radios[3].closest('label')?.className).toContain('choiceChecked');
    expect(radios[0].closest('label')?.className).not.toContain('choiceChecked');
    // Half-day swatches carry the same "½" marker as half-day cells.
    expect(radios[3].closest('label')?.textContent).toBe('½On-site · half day');

    const hint = Array.from(host.querySelectorAll('p')).filter(p => p.textContent === 'Click a marked day again with the same type to clear it.');
    expect(hint).toHaveLength(1);
    const legend = Array.from(host.querySelectorAll('span')).filter(sp => sp.textContent === 'Weekend / holiday (blocked)');
    expect(legend).toHaveLength(1);
    expect(legend[0].parentElement?.contains(hint[0])).toBe(false);
  });
});

/** jsdom (26) has no PointerEvent: a MouseEvent carrying the fields the drag reads stands in for it. */
function makePointerEvent(type: string, init: PointerEventInit): Event {
  if (typeof window.PointerEvent === 'function') { return new window.PointerEvent(type, init); }
  const ev = new MouseEvent(type, init);
  Object.defineProperty(ev, 'pointerId', { value: init.pointerId ?? 0 });
  Object.defineProperty(ev, 'pointerType', { value: init.pointerType ?? 'mouse' });
  return ev;
}

/** React 17 derives no enter events from synthetic dispatches, so the drag listens to pointerover. */
type PointerType = 'pointerdown' | 'pointerover' | 'pointermove' | 'pointerup' | 'pointercancel';

/** Defaults: pointer 1, primary button held for down/over/move (released for up/cancel). */
function pointer(el: EventTarget, type: PointerType, init: PointerEventInit = {}): void {
  const held = type === 'pointerdown' || type === 'pointerover' || type === 'pointermove';
  el.dispatchEvent(makePointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: held ? 1 : 0, pointerId: 1, ...init }));
}

function key(el: Element, k: string, init: KeyboardEventInit = {}): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
}

function shiftClick(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
}

async function stored(service: ControlledService, from: string, to: string, contractId: number = 1): Promise<string[]> {
  return (await service.inner.getEntries(contractId, from, to)).map(e => e.date);
}

describe('ContractCalendar range selection', () => {
  beforeAll(() => {
    setIconOptions({ disableWarnings: true });
    jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true });
  });
  afterAll(() => { jest.useRealTimers(); });
  afterEach(() => {
    unmountAll();
  });

  it('drags across month cards, previews the range and paints the eligible days on release', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    await act(async () => { pointer(day(host, 'Friday 27 November 2026'), 'pointerdown'); });
    await act(async () => { pointer(day(host, 'Monday 30 November 2026'), 'pointerover'); });
    await act(async () => { pointer(day(host, 'Wednesday 2 December 2026'), 'pointerover'); });
    expect(day(host, 'Tuesday 1 December 2026').className).toContain('rangePreview');
    expect(day(host, 'Saturday 28 November 2026').className).not.toContain('rangePreview');
    expect(day(host, 'Thursday 3 December 2026').className).not.toContain('rangePreview');
    expect(service.calls.upsertEntry).toBe(0);

    await act(async () => { pointer(day(host, 'Wednesday 2 December 2026'), 'pointerup'); });
    await flush();
    expect(service.calls.upsertEntry).toBe(4);
    expect(await stored(service, '2026-11-27', '2026-12-02')).toEqual(['2026-11-27', '2026-11-30', '2026-12-01', '2026-12-02']);
    expect(day(host, 'Tuesday 1 December 2026').className).not.toContain('rangePreview');
    expect(day(host, 'Tuesday 1 December 2026').getAttribute('aria-label')).toBe('Tuesday 1 December 2026, off-site full day');
  });

  it('commits the current range when the pointer is released outside the grid', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    await act(async () => { pointer(day(host, 'Monday 9 November 2026'), 'pointerdown'); });
    await act(async () => { pointer(day(host, 'Tuesday 10 November 2026'), 'pointerover'); });
    await act(async () => { pointer(document.body, 'pointerup'); });
    await flush();
    expect(await stored(service, '2026-11-09', '2026-11-10')).toEqual(['2026-11-09', '2026-11-10']);
  });

  it('erases when the drag starts on a day holding the selected type', async () => {
    const service = new ControlledService(1);
    await service.inner.upsertEntry({ contractId: 1, date: '2026-11-03', type: 'OffSiteFull' });
    await service.inner.upsertEntry({ contractId: 1, date: '2026-11-05', type: 'OffSiteFull' });
    const { host } = await mount(1, service);
    await act(async () => { pointer(day(host, 'Tuesday 3 November 2026'), 'pointerdown'); });
    await act(async () => { pointer(day(host, 'Thursday 5 November 2026'), 'pointerover'); });
    await act(async () => { pointer(day(host, 'Thursday 5 November 2026'), 'pointerup'); });
    await flush();
    expect(service.calls.upsertEntry).toBe(0);
    expect(await stored(service, '2026-11-03', '2026-11-05')).toEqual([]);
  });

  it('cancels the drag on Escape without writing', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    await act(async () => { pointer(day(host, 'Tuesday 3 November 2026'), 'pointerdown'); });
    await act(async () => { pointer(day(host, 'Friday 6 November 2026'), 'pointerover'); });
    expect(day(host, 'Thursday 5 November 2026').className).toContain('rangePreview');
    await act(async () => { key(document.body, 'Escape'); });
    expect(day(host, 'Thursday 5 November 2026').className).not.toContain('rangePreview');
    await act(async () => { pointer(day(host, 'Friday 6 November 2026'), 'pointerup'); });
    await flush();
    expect(service.calls.upsertEntry + service.calls.deleteEntry).toBe(0);
  });

  it('treats press and release on one day as a click, and swallows the click after a drag back to the anchor', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    const tue = day(host, 'Tuesday 3 November 2026');
    await act(async () => { pointer(tue, 'pointerdown'); pointer(tue, 'pointerup'); tue.click(); });
    await flush();
    expect(await stored(service, '2026-11-03', '2026-11-03')).toEqual(['2026-11-03']);

    const wed = day(host, 'Wednesday 4 November 2026');
    await act(async () => { pointer(wed, 'pointerdown'); });
    await act(async () => { pointer(day(host, 'Thursday 5 November 2026'), 'pointerover'); });
    await act(async () => { pointer(wed, 'pointerover'); });
    await act(async () => { pointer(wed, 'pointerup'); wed.click(); });
    await flush();
    expect(service.calls.upsertEntry).toBe(2);
    expect(service.calls.deleteEntry).toBe(0);
    expect(await stored(service, '2026-11-03', '2026-11-05')).toEqual(['2026-11-03', '2026-11-04']);
  });

  it('commits the range from the anchor on Shift+click, painting because the anchor click painted', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    await act(async () => { day(host, 'Tuesday 3 November 2026').click(); });
    await flush();
    await act(async () => { shiftClick(day(host, 'Tuesday 10 November 2026')); });
    await flush();
    expect(await stored(service, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'
    ]);
  });

  it('extends a pending range with Shift+Arrow and commits it with Enter', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    const tue = day(host, 'Tuesday 3 November 2026');
    tue.focus();
    await act(async () => { key(tue, 'ArrowRight', { shiftKey: true }); });
    await act(async () => { key(document.activeElement as Element, 'ArrowDown', { shiftKey: true }); });
    expect(document.activeElement).toBe(day(host, 'Wednesday 11 November 2026'));
    expect(day(host, 'Monday 9 November 2026').className).toContain('rangePreview');
    expect(service.calls.upsertEntry).toBe(0);
    await act(async () => { key(document.activeElement as Element, 'Enter'); });
    await flush();
    expect(await stored(service, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11'
    ]);
  });

  it('cancels a keyboard range with Escape', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    const tue = day(host, 'Tuesday 3 November 2026');
    tue.focus();
    await act(async () => { key(tue, 'ArrowRight', { shiftKey: true }); });
    expect(day(host, 'Wednesday 4 November 2026').className).toContain('rangePreview');
    await act(async () => { key(document.activeElement as Element, 'Escape'); });
    expect(day(host, 'Wednesday 4 November 2026').className).not.toContain('rangePreview');
    await act(async () => { key(document.activeElement as Element, 'Enter'); });
    await flush();
    expect(service.calls.upsertEntry).toBe(0);
  });

  it('asks once about the overlap days of a dragged range', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    await act(async () => { pointer(day(host, 'Thursday 28 January 2027'), 'pointerdown'); });
    await act(async () => { pointer(day(host, 'Wednesday 3 February 2027'), 'pointerover'); });
    await act(async () => { pointer(day(host, 'Wednesday 3 February 2027'), 'pointerup'); });
    await flush();
    expect(document.body.textContent).toContain('Count 3 days against 001185_2026 or 001186_2027?');
    expect(service.calls.upsertEntry).toBe(0);
  });

  it('ignores drags and Shift+click for a read-only user', async () => {
    const service = new ControlledService(3);
    const { host } = await mount(3, service);
    await act(async () => { pointer(day(host, 'Tuesday 3 November 2026'), 'pointerdown'); });
    await act(async () => { pointer(day(host, 'Friday 6 November 2026'), 'pointerover'); });
    expect(day(host, 'Thursday 5 November 2026').className).not.toContain('rangePreview');
    await act(async () => { pointer(day(host, 'Friday 6 November 2026'), 'pointerup'); });
    await act(async () => { shiftClick(day(host, 'Friday 6 November 2026')); });
    await flush();
    expect(service.calls.upsertEntry + service.calls.deleteEntry).toBe(0);
  });
});

async function typedStore(service: ControlledService, from: string, to: string): Promise<string[]> {
  return (await service.inner.getEntries(1, from, to)).map(e => `${e.date}:${e.type}`);
}

describe('ContractCalendar range selection guards', () => {
  beforeAll(() => {
    setIconOptions({ disableWarnings: true });
    jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true });
  });
  afterAll(() => { jest.useRealTimers(); });
  afterEach(() => { unmountAll(); });

  it('does not commit a keyboard range with Enter on a day other than its end', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    const tue = day(host, 'Tuesday 3 November 2026');
    tue.focus();
    await act(async () => { key(tue, 'ArrowRight', { shiftKey: true }); }); // pending 3..4, focus on 4
    const thu = day(host, 'Thursday 5 November 2026');
    thu.focus(); // Tab to another day, still inside the grid
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => { thu.dispatchEvent(enter); });
    expect(enter.defaultPrevented).toBe(false); // the button's own Enter activation goes ahead...
    expect(day(host, 'Wednesday 4 November 2026').className).not.toContain('rangePreview');
    await act(async () => { thu.click(); }); // ...which the browser turns into a click
    await flush();
    expect(await stored(service, '2026-11-01', '2026-11-30')).toEqual(['2026-11-05']);
  });

  it('clears a keyboard range when focus leaves the grid', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    const tue = day(host, 'Tuesday 3 November 2026');
    tue.focus();
    await act(async () => { key(tue, 'ArrowRight', { shiftKey: true }); });
    const wed = day(host, 'Wednesday 4 November 2026');
    expect(wed.className).toContain('rangePreview');
    const outside = host.querySelector<HTMLInputElement>('fieldset input[type="radio"]');
    if (!outside) { throw new Error('no radio'); }
    await act(async () => { outside.focus(); });
    expect(wed.className).not.toContain('rangePreview');
    await act(async () => { key(wed, 'Enter'); });
    await flush();
    expect(service.calls.upsertEntry).toBe(0);
  });

  it('cancels a drag when the window loses focus', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    await act(async () => { pointer(day(host, 'Tuesday 3 November 2026'), 'pointerdown'); });
    await act(async () => { pointer(day(host, 'Friday 6 November 2026'), 'pointerover'); });
    await act(async () => { window.dispatchEvent(new Event('blur')); });
    expect(day(host, 'Thursday 5 November 2026').className).not.toContain('rangePreview');
    await act(async () => { pointer(day(host, 'Friday 6 November 2026'), 'pointerup'); });
    await flush();
    expect(service.calls.upsertEntry + service.calls.deleteEntry).toBe(0);
  });

  it('cancels a drag whose button was released where the page could not see it', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    await act(async () => { pointer(day(host, 'Tuesday 3 November 2026'), 'pointerdown'); });
    await act(async () => { pointer(day(host, 'Wednesday 4 November 2026'), 'pointerover'); });
    await act(async () => { pointer(day(host, 'Friday 6 November 2026'), 'pointerover', { buttons: 0 }); });
    expect(day(host, 'Wednesday 4 November 2026').className).not.toContain('rangePreview');
    await act(async () => { pointer(document.body, 'pointerup'); });
    await flush();
    expect(service.calls.upsertEntry + service.calls.deleteEntry).toBe(0);
  });

  it('ignores release and cancel from another pointer', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    await act(async () => { pointer(day(host, 'Monday 9 November 2026'), 'pointerdown', { pointerId: 1 }); });
    await act(async () => { pointer(day(host, 'Wednesday 11 November 2026'), 'pointerover', { pointerId: 1 }); });
    await act(async () => { pointer(day(host, 'Friday 13 November 2026'), 'pointerdown', { pointerId: 2 }); });
    await act(async () => { pointer(day(host, 'Friday 13 November 2026'), 'pointerover', { pointerId: 2 }); });
    await act(async () => { pointer(document.body, 'pointerup', { pointerId: 2 }); });
    await act(async () => { pointer(document.body, 'pointercancel', { pointerId: 2 }); });
    await flush();
    expect(service.calls.upsertEntry).toBe(0);
    expect(day(host, 'Tuesday 10 November 2026').className).toContain('rangePreview');
    expect(day(host, 'Thursday 12 November 2026').className).not.toContain('rangePreview');
    await act(async () => { pointer(document.body, 'pointerup', { pointerId: 1 }); });
    await flush();
    expect(await stored(service, '2026-11-01', '2026-11-30')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
  });

  it('forgets the Shift+click anchor when the selection type changes', async () => {
    const service = new ControlledService(1);
    await service.inner.upsertEntry({ contractId: 1, date: '2026-11-03', type: 'OffSiteFull' });
    await service.inner.upsertEntry({ contractId: 1, date: '2026-11-04', type: 'OnSiteFull' });
    const { host } = await mount(1, service);
    await act(async () => { day(host, 'Tuesday 3 November 2026').click(); }); // clears 3: anchor in erase mode
    await flush();
    const onSite = Array.from(host.querySelectorAll<HTMLInputElement>('fieldset input[type="radio"]')).filter(r => r.value === 'OnSiteFull')[0];
    await act(async () => { onSite.click(); });
    await act(async () => { shiftClick(day(host, 'Friday 6 November 2026')); });
    await flush();
    // A fresh single click: 6 painted on-site, the on-site day 4 is not erased.
    expect(await typedStore(service, '2026-11-01', '2026-11-30')).toEqual(['2026-11-04:OnSiteFull', '2026-11-06:OnSiteFull']);
  });

  it('drags by touch only after the press rests, and lets a quick swipe scroll', async () => {
    const service = new ControlledService(1);
    const { host } = await mount(1, service);
    const months = host.querySelector('section[aria-label="November 2026"]')?.parentElement;
    if (!months) { throw new Error('no months root'); }
    const mon = day(host, 'Monday 9 November 2026');
    const wed = day(host, 'Wednesday 11 November 2026');
    const touch = { pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 10 };

    // Swipe: moves past the slop before arming -> no drag, and touchmove is left alone so the page scrolls.
    await act(async () => { pointer(mon, 'pointerdown', touch); });
    await act(async () => { pointer(document, 'pointermove', { ...touch, clientY: 30 }); });
    await act(async () => { jest.advanceTimersByTime(400); });
    const swipeMove = new Event('touchmove', { bubbles: true, cancelable: true });
    mon.dispatchEvent(swipeMove);
    expect(swipeMove.defaultPrevented).toBe(false);
    expect(months.className).not.toContain('dragging');
    await act(async () => { pointer(wed, 'pointerover', touch); });
    expect(day(host, 'Tuesday 10 November 2026').className).not.toContain('rangePreview');
    await act(async () => { pointer(document, 'pointercancel', touch); });

    // Rest: arms after the delay, then touchmove is cancelled and the drag paints on release.
    await act(async () => { pointer(mon, 'pointerdown', touch); });
    await act(async () => { pointer(document, 'pointermove', { ...touch, clientX: 13 }); }); // inside the slop
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(months.className).toContain('dragging');
    const dragMove = new Event('touchmove', { bubbles: true, cancelable: true });
    mon.dispatchEvent(dragMove);
    expect(dragMove.defaultPrevented).toBe(true);
    await act(async () => { pointer(wed, 'pointerover', touch); });
    await act(async () => { pointer(wed, 'pointerup', touch); });
    await flush();
    expect(await stored(service, '2026-11-01', '2026-11-30')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
  });
});
