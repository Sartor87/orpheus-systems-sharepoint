import * as React from 'react';
import * as ReactDom from 'react-dom';
import { ToastHost } from './ToastHost';
import { orpheusBrand } from '../brand/brand';
import { HOST_ID, ToastOptions, addToast, getStore, removeToast } from './toastStore';

/** One site-wide key: all components on a page, and all pages of a site, share a single 7-day brand toast. */
export const BRAND_TOAST_STORAGE_KEY = 'orpheus.site.brandToastShownAt';
export const BRAND_TOAST_DEDUPE_KEY = 'orpheus.brand';

function ensureHost(): void {
  const store = getStore();
  const existing = document.getElementById(HOST_ID);
  // A mounted host is live from the moment ReactDOM.render returned (below), before its effects have run,
  // so another bundle must not render into that container with its own ReactDOM.
  if (existing && store.unmount && store.host === existing) { return; }
  const el = existing || document.createElement('div');
  if (!existing) {
    el.id = HOST_ID;
    document.body.appendChild(el);
  }
  // The host reads store.toasts when it mounts and subscribes afterwards, so toasts added in between are kept.
  ReactDom.render(React.createElement(ToastHost), el);
  store.host = el;
  store.unmount = () => {
    ReactDom.unmountComponentAtNode(el);
    el.remove();
  };
}

/** Shows a toast (mounting the shared host on first use) and returns its id. */
export function showToast(options: ToastOptions): string {
  ensureHost();
  return addToast(options);
}

export function dismissToast(id: string): void {
  removeToast(id);
}

/**
 * Removes the shared host and every toast on the page, whichever bundle mounted it.
 * For tests only: components must NOT call this on dispose, because it also removes other components' toasts.
 */
export function unmountToastHost(): void {
  const store = getStore();
  if (store.unmount) {
    store.unmount();
  } else if (store.host) {
    store.host.remove();
  }
  store.unmount = undefined;
  store.host = undefined;
  store.toasts = [];
  store.listeners = [];
  store.brandShown = {};
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BrandToastOptions {
  /** Defaults to BRAND_TOAST_STORAGE_KEY, shared by every Orpheus component. */
  storageKey?: string;
  intervalDays?: number;
}

/**
 * The Orpheus Systems toast, titled with the brand name whichever component asks first, at most once per browser per interval (default 7 days) and once per page, however
 * many components ask. Without usable storage it shows once per page. Returns whether it was shown.
 */
export function showBrandToastOnce(options: BrandToastOptions = {}): boolean {
  const store = getStore();
  const key = options.storageKey || BRAND_TOAST_STORAGE_KEY;
  const intervalMs = (options.intervalDays === undefined ? 7 : options.intervalDays) * DAY_MS;
  if (store.brandShown[key]) { return false; }
  const now = Date.now();
  let stored: number | undefined;
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    stored = isNaN(n) ? undefined : n;
  } catch {
    stored = undefined;
  }
  if (stored !== undefined && now - stored >= 0 && now - stored < intervalMs) {
    store.brandShown[key] = true;
    return false;
  }
  store.brandShown[key] = true;
  try { window.localStorage.setItem(key, String(now)); } catch { /* storage unavailable */ }
  showToast({
    kind: 'brand',
    title: orpheusBrand.name,
    link: { href: orpheusBrand.url, label: orpheusBrand.url.replace(/^https?:\/\//, '').replace(/\/$/, '') },
    dedupeKey: BRAND_TOAST_DEDUPE_KEY
  });
  return true;
}
