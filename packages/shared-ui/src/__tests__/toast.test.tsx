/** @jest-environment jsdom */
import { act } from 'react-dom/test-utils';
import { orpheusBrand } from '../brand/brand';
import {
  BRAND_TOAST_STORAGE_KEY, activeToasts, dismissToast, showBrandToastOnce, showToast, unmountToastHost
} from '../toast';

type ToastModule = typeof import('../toast');

const DAY = 24 * 60 * 60 * 1000;
const BRAND_TITLE = orpheusBrand.name;

const toastEls = (): HTMLElement[] => Array.from(document.body.querySelectorAll<HTMLElement>('[role="status"], [role="alert"]'));
const show = (o: Partial<Parameters<typeof showToast>[0]> = {}, mod: ToastModule = { showToast } as ToastModule): string => {
  let id = '';
  act(() => { id = mod.showToast({ kind: 'info', title: 'Hello', ...o }); });
  return id;
};
const advance = (ms: number): void => { act(() => { jest.advanceTimersByTime(ms); }); };
function hover(el: Element, on: boolean): void {
  act(() => {
    el.dispatchEvent(new MouseEvent(on ? 'mouseover' : 'mouseout', { bubbles: true, relatedTarget: on ? null : document.body }));
  });
}
function focus(el: HTMLElement, on: boolean): void {
  act(() => {
    el.dispatchEvent(new FocusEvent(on ? 'focusin' : 'focusout', { bubbles: true, relatedTarget: on ? null : document.body }));
  });
}
function isolated(): ToastModule {
  let m: ToastModule | undefined;
  jest.isolateModules(() => { m = require('../toast'); });
  return m as ToastModule;
}

beforeEach(() => { jest.useFakeTimers(); window.localStorage.clear(); });
afterEach(() => {
  act(() => { unmountToastHost(); });
  delete (window as unknown as Record<string, unknown>).__orpheusToasts_v2;
  document.getElementById('orpheus-toast-host-v2')?.remove();
  jest.useRealTimers();
});

describe('toasts', () => {
  it('mounts one versioned host lazily and shares the store on window', () => {
    expect(document.getElementById('orpheus-toast-host-v1')).toBeNull();
    show();
    show();
    expect(document.querySelectorAll('#orpheus-toast-host-v1')).toHaveLength(1);
    expect((window as unknown as { __orpheusToasts_v1: { v: number } }).__orpheusToasts_v1.v).toBe(1);
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

  it('keeps a toast until closed when durationMs is zero, negative or not finite', () => {
    show({ title: 'zero', durationMs: 0 });
    show({ title: 'neg', durationMs: -5 });
    show({ title: 'inf', durationMs: Infinity });
    advance(10 * 60 * 1000);
    expect(toastEls()).toHaveLength(3);
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

  it('pauses while focused and resumes after blur', () => {
    show({ action: { label: 'Go', onClick: () => undefined } });
    advance(10000);
    const btn = toastEls()[0].querySelector('button') as HTMLButtonElement;
    focus(btn, true);
    advance(60000);
    expect(toastEls()).toHaveLength(1);
    focus(btn, false);
    advance(4000);
    expect(toastEls()).toHaveLength(1);
    advance(1100);
    expect(toastEls()).toHaveLength(0);
  });

  it('closes with the dismiss button and with dismissToast', () => {
    show();
    const close = document.body.querySelector<HTMLButtonElement>('button[aria-label="Dismiss notification"]') as HTMLButtonElement;
    expect(close.querySelector('svg')).not.toBeNull();
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

describe('dedupeKey', () => {
  it('refreshes the visible toast instead of stacking, and restarts its timer', () => {
    const a = show({ title: 'Saved 1 day', dedupeKey: 'k' });
    advance(10000);
    const b = show({ title: 'Saved 2 days', dedupeKey: 'k' });
    expect(b).toBe(a);
    expect(toastEls()).toHaveLength(1);
    expect(toastEls()[0].textContent).toContain('Saved 2 days');
    advance(10000); // 20 s after the first, 10 s after the refresh
    expect(toastEls()).toHaveLength(1);
    advance(5100);
    expect(toastEls()).toHaveLength(0);
  });

  it('adds a new toast once the previous one is gone, and keeps different keys apart', () => {
    show({ title: 'A', dedupeKey: 'a' });
    show({ title: 'B', dedupeKey: 'b' });
    expect(toastEls()).toHaveLength(2);
    advance(16000);
    show({ title: 'A again', dedupeKey: 'a' });
    expect(toastEls()).toHaveLength(1);
  });
});

describe('showBrandToastOnce', () => {
  const brandCount = (): number => toastEls().filter(e => (e.textContent || '').includes(BRAND_TITLE)).length;
  const brand = (mod: ToastModule = { showBrandToastOnce } as ToastModule): boolean => {
    let r = false;
    act(() => { r = mod.showBrandToastOnce(); });
    return r;
  };

  it('always titles the toast with the brand name, whichever component asks first', () => {
    jest.setSystemTime(new Date(2026, 9, 22, 12));
    expect(brand()).toBe(true);
    expect(activeToasts().filter(t => t.kind === 'brand').map(t => t.title)).toEqual([orpheusBrand.name]);
  });

  it('uses the site-wide key', () => {
    expect(BRAND_TOAST_STORAGE_KEY).toBe('orpheus.site.brandToastShownAt');
  });

  it('shows once with a safe link, not again within 7 days, again after 7 days', () => {
    jest.setSystemTime(new Date(2026, 9, 22, 12));
    expect(brand()).toBe(true);
    expect(brandCount()).toBe(1);
    const link = document.body.querySelector('a[href="https://orpheussystems.com/"]') as HTMLAnchorElement;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(window.localStorage.getItem(BRAND_TOAST_STORAGE_KEY)).not.toBeNull();

    act(() => { unmountToastHost(); }); // a new page load
    jest.setSystemTime(Date.now() + 7 * DAY - 60000);
    expect(brand()).toBe(false);

    act(() => { unmountToastHost(); });
    jest.setSystemTime(Date.now() + 120000);
    expect(brand()).toBe(true);
  });

  it('shows once per page when storage throws, across module instances', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      const b = isolated();
      expect(brand()).toBe(true);
      expect(brand(b)).toBe(false);
      expect(brandCount()).toBe(1);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('shows one toast when two components in different bundles ask', () => {
    const b = isolated();
    expect(brand()).toBe(true);
    expect(brand(b)).toBe(false);
    expect(brandCount()).toBe(1);
  });
});

describe('two bundles on one page', () => {
  it('B renders through A\'s host; one host element; unmount via B tears down A\'s tree', () => {
    show({ title: 'from A' });
    const b = isolated();
    show({ title: 'from B' }, b);
    expect(document.querySelectorAll('#orpheus-toast-host-v1')).toHaveLength(1);
    expect(toastEls().map(e => e.textContent).join('|')).toMatch(/from B.*from A/);
    act(() => { b.unmountToastHost(); });
    expect(document.getElementById('orpheus-toast-host-v1')).toBeNull();
    expect(toastEls()).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('adopts a leftover host element that nothing is listening to', () => {
    const el = document.createElement('div');
    el.id = 'orpheus-toast-host-v1';
    document.body.appendChild(el);
    show({ title: 'adopted' });
    expect(document.querySelectorAll('#orpheus-toast-host-v1')).toHaveLength(1);
    expect(el.textContent).toContain('adopted');
  });

  it('a future v2 store and host coexist untouched', () => {
    const v2 = { v: 2, toasts: ['x'] };
    (window as unknown as Record<string, unknown>).__orpheusToasts_v2 = v2;
    const el2 = document.createElement('div');
    el2.id = 'orpheus-toast-host-v2';
    el2.textContent = 'v2 host';
    document.body.appendChild(el2);
    show({ title: 'v1 toast' });
    expect((window as unknown as Record<string, unknown>).__orpheusToasts_v2).toBe(v2);
    expect(v2.toasts).toEqual(['x']);
    expect(el2.textContent).toBe('v2 host');
    expect(document.getElementById('orpheus-toast-host-v1')).not.toBe(el2);
    act(() => { unmountToastHost(); });
    expect(document.getElementById('orpheus-toast-host-v2')).toBe(el2);
  });
});

type Win = { __orpheusToasts_v1?: Record<string, unknown> & { unmount?: () => void; toasts: unknown[]; brandShown: Record<string, true> } };
const win = (): Win => window as unknown as Win;

function isolatedWithDom(): { mod: ToastModule; dom: typeof import('react-dom') } {
  let mod: ToastModule | undefined;
  let dom: typeof import('react-dom') | undefined;
  jest.isolateModules(() => {
    mod = require('../toast');
    dom = require('react-dom');
  });
  return { mod: mod as ToastModule, dom: dom as typeof import('react-dom') };
}

describe('cross-bundle host adoption', () => {
  it('B does not render into A\'s container before A\'s effects flush, and no toast is lost', () => {
    const { mod: b, dom: bDom } = isolatedWithDom();
    const renderB = jest.spyOn(bDom, 'render');
    // No act between the calls: A's passive effects (the subscription) have not run when B shows its toast.
    showToast({ kind: 'info', title: 'from A' });
    b.showToast({ kind: 'info', title: 'from B' });
    expect(renderB).not.toHaveBeenCalled();
    expect(document.querySelectorAll('#orpheus-toast-host-v1')).toHaveLength(1);
    act(() => { /* flush effects */ });
    const text = toastEls().map(e => e.textContent).join('|');
    expect(text).toContain('from A');
    expect(text).toContain('from B');
    renderB.mockRestore();
  });

  it('unmount via B calls A\'s stored unmount and never B\'s own unmountComponentAtNode', () => {
    show({ title: 'from A' });
    const { mod: b, dom: bDom } = isolatedWithDom();
    const unmountB = jest.spyOn(bDom, 'unmountComponentAtNode');
    const store = win().__orpheusToasts_v1 as { unmount?: () => void };
    const original = store.unmount as () => void;
    const spy = jest.fn(original);
    store.unmount = spy;
    act(() => { b.unmountToastHost(); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(unmountB).not.toHaveBeenCalled();
    expect(document.getElementById('orpheus-toast-host-v1')).toBeNull();
    unmountB.mockRestore();
  });
});

describe('store seeding and backfill', () => {
  it('keeps a store that exists before the first call (same object, toasts kept)', () => {
    const seeded = {
      v: 1, nextId: 10, listeners: [], brandShown: {},
      toasts: [{ id: 'orpheus-toast-9', rev: 0, kind: 'info', title: 'seeded', durationMs: 0 }]
    };
    (window as unknown as { __orpheusToasts_v1: unknown }).__orpheusToasts_v1 = seeded;
    show({ title: 'new' });
    expect(win().__orpheusToasts_v1).toBe(seeded);
    expect(activeToasts().map(t => t.title)).toEqual(['new', 'seeded']);
    expect(toastEls()).toHaveLength(2);
  });

  it('backfills missing fields on an existing v1 store', () => {
    (window as unknown as { __orpheusToasts_v1: unknown }).__orpheusToasts_v1 = { v: 1 };
    show({ title: 'ok' });
    const s = win().__orpheusToasts_v1 as Record<string, unknown>;
    expect(Array.isArray(s.toasts)).toBe(true);
    expect(Array.isArray(s.listeners)).toBe(true);
    expect(typeof s.brandShown).toBe('object');
    expect(typeof s.nextId).toBe('number');
    expect(toastEls()).toHaveLength(1);
  });
});

describe('brand toast sharing', () => {
  it('passes dedupeKey orpheus.brand', () => {
    act(() => { showBrandToastOnce(); });
    expect(activeToasts()[0].dedupeKey).toBe('orpheus.brand');
  });

  it('is stopped by the shared per-page flag, not by storage or module state', () => {
    const b = isolated();
    act(() => { showBrandToastOnce(); });
    window.localStorage.clear(); // only the shared flag can stop B now
    let shown = true;
    act(() => { shown = b.showBrandToastOnce(); });
    expect(shown).toBe(false);
    expect(win().__orpheusToasts_v1?.brandShown[BRAND_TOAST_STORAGE_KEY]).toBe(true);
    expect(toastEls().filter(e => (e.textContent || '').includes(BRAND_TITLE))).toHaveLength(1);
  });
});

describe('stylesheet', () => {
  const css = (): string => (document.getElementById('orpheus-toast-styles-v1') as HTMLElement).textContent || '';

  it('stacks above SharePoint chrome', () => {
    show();
    const z = Number((/z-index:(\d+)/.exec(css()) || [])[1]);
    expect(z).toBeGreaterThanOrEqual(1000010);
  });

  it('uses a dark, high-contrast focus outline on every control', () => {
    show();
    const c = css();
    expect(c).toContain('.orpheus-toast-link:focus-visible');
    expect(c).toContain('.orpheus-toast-action:focus-visible');
    expect(c).toContain('.orpheus-toast-close:focus-visible');
    expect(c).toContain('outline:2px solid #1F2329');
    expect(c).not.toMatch(/focus-visible[^}]*E0A83A/);
  });
});
