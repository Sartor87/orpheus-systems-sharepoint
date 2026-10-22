/** @jest-environment jsdom */
import { act } from 'react-dom/test-utils';
import { setIconOptions } from '@fluentui/react';
import { activeToasts, dismissToast, resetBrandToastForTests, showBrandToastOnce, showToast, unmountToastHost } from '../toast';

setIconOptions({ disableWarnings: true });

const KEY = 'test.brandToastShownAt';
const DAY = 24 * 60 * 60 * 1000;

const toastEls = (): HTMLElement[] => Array.from(document.body.querySelectorAll<HTMLElement>('[role="status"], [role="alert"]'));
const show = (o: Partial<Parameters<typeof showToast>[0]> = {}): string => {
  let id = '';
  act(() => { id = showToast({ kind: 'info', title: 'Hello', ...o }); });
  return id;
};
const advance = (ms: number): void => { act(() => { jest.advanceTimersByTime(ms); }); };
function hover(el: Element, on: boolean): void {
  act(() => {
    el.dispatchEvent(new MouseEvent(on ? 'mouseover' : 'mouseout', { bubbles: true, relatedTarget: on ? null : document.body }));
  });
}

beforeEach(() => { jest.useFakeTimers(); resetBrandToastForTests(); window.localStorage.clear(); });
afterEach(() => {
  act(() => { unmountToastHost(); });
  jest.useRealTimers();
});

describe('toasts', () => {
  it('mounts one host lazily and shares the store on window', () => {
    expect(document.getElementById('orpheus-toast-host')).toBeNull();
    show();
    show();
    expect(document.querySelectorAll('#orpheus-toast-host')).toHaveLength(1);
    expect((window as unknown as { __orpheusToasts: { v: number } }).__orpheusToasts.v).toBe(1);
    expect(activeToasts()).toHaveLength(2);
  });

  it('auto-dismisses after 15 s', () => {
    show();
    expect(toastEls()).toHaveLength(1);
    advance(14999);
    expect(toastEls()).toHaveLength(1);
    advance(2);
    expect(toastEls()).toHaveLength(0);
  });

  it('honours durationMs', () => {
    show({ durationMs: 1000 });
    advance(1001);
    expect(toastEls()).toHaveLength(0);
  });

  it('pauses while hovered and resumes with the remaining time', () => {
    show();
    advance(10000);
    hover(toastEls()[0], true);
    advance(60000);
    expect(toastEls()).toHaveLength(1);
    hover(toastEls()[0], false);
    advance(4000);
    expect(toastEls()).toHaveLength(1);
    advance(1100);
    expect(toastEls()).toHaveLength(0);
  });

  it('closes with the close button and with dismissToast', () => {
    show();
    const close = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close notification"]') as HTMLButtonElement;
    act(() => { close.click(); });
    expect(toastEls()).toHaveLength(0);
    const id = show({ title: 'again' });
    act(() => { dismissToast(id); });
    expect(toastEls()).toHaveLength(0);
  });

  it('stacks at most 3, newest on top', () => {
    ['one', 'two', 'three', 'four'].forEach(title => show({ title }));
    const titles = toastEls().map(e => e.textContent || '');
    expect(titles).toHaveLength(3);
    expect(titles[0]).toContain('four');
    expect(titles.join('')).not.toContain('one');
  });

  it('uses role alert for errors and status otherwise', () => {
    show({ kind: 'error', title: 'Boom' });
    show({ kind: 'success', title: 'Fine' });
    expect(toastEls().map(e => e.getAttribute('role'))).toEqual(['status', 'alert']);
  });

  it('runs the action once and closes the toast', () => {
    const onClick = jest.fn();
    show({ title: 'Act', action: { label: 'Retry', onClick } });
    const btn = Array.from(document.body.querySelectorAll('button')).filter(b => b.textContent === 'Retry')[0];
    act(() => { btn.click(); });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(toastEls()).toHaveLength(0);
  });

  it('clears timers on unmount', () => {
    show();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    act(() => { unmountToastHost(); });
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('showBrandToastOnce', () => {
  const brandCount = (): number => toastEls().filter(e => (e.textContent || '').includes('Contract Calendar by Orpheus Systems')).length;
  const brand = (): boolean => { let r = false; act(() => { r = showBrandToastOnce(KEY); }); return r; };

  it('shows once with a safe link, not again within 7 days, again after 7 days', () => {
    jest.setSystemTime(new Date(2026, 9, 22, 12));
    expect(brand()).toBe(true);
    expect(brandCount()).toBe(1);
    const link = document.body.querySelector('a[href="https://orpheussystems.com/"]') as HTMLAnchorElement;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(window.localStorage.getItem(KEY)).not.toBeNull();

    jest.setSystemTime(Date.now() + 7 * DAY - 60000);
    expect(brand()).toBe(false);

    jest.setSystemTime(Date.now() + 120000);
    expect(brand()).toBe(true);
  });

  it('still shows once per page load when storage throws', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      expect(brand()).toBe(true);
      expect(brand()).toBe(false);
      expect(brandCount()).toBe(1);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
