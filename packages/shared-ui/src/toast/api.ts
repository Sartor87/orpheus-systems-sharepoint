import * as React from 'react';
import * as ReactDom from 'react-dom';
import { ToastHost } from './ToastHost';
import { orpheusBrand } from '../brand/brand';
import { ToastOptions, addToast, getStore, removeToast } from './toastStore';




const HOST_ID = 'orpheus-toast-host';

function ensureHost(): void {
  const store = getStore();
  if (store.host && document.body.contains(store.host)) { return; }
  const existing = document.getElementById(HOST_ID);
  if (existing) { store.host = existing; return; }
  const el = document.createElement('div');
  el.id = HOST_ID;
  document.body.appendChild(el);
  store.host = el;
  ReactDom.render(React.createElement(ToastHost), el);
}

/** Shows a toast (mounting the shared host on first use) and returns its id. */
export function showToast(options: ToastOptions): string {
  ensureHost();
  return addToast(options);
}

export function dismissToast(id: string): void {
  removeToast(id);
}

/** Removes the host and every toast; for tests and component dispose. */
export function unmountToastHost(): void {
  const store = getStore();
  if (store.host) {
    ReactDom.unmountComponentAtNode(store.host);
    store.host.remove();
    store.host = undefined;
  }
  store.toasts = [];
  store.listeners = [];
}


const DAY_MS = 24 * 60 * 60 * 1000;
let brandShownThisPageLoad = false;

/** Test seam: forget the per-page-load fallback used when storage is unavailable. */
export function resetBrandToastForTests(): void { brandShownThisPageLoad = false; }

/**
 * The Orpheus Systems toast, at most once per browser per `intervalDays` (default 7). The time is kept in
 * localStorage under `storageKey`; without storage it shows once per page load. Returns whether it was shown.
 */
export function showBrandToastOnce(storageKey: string, intervalDays: number = 7, productName: string = 'Contract Calendar'): boolean {
  const now = Date.now();
  let stored: number | undefined;
  let storageOk = true;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const n = raw === null ? NaN : Number(raw);
    stored = isNaN(n) ? undefined : n;
  } catch {
    storageOk = false;
  }
  if (storageOk && stored !== undefined && now - stored >= 0 && now - stored < intervalDays * DAY_MS) { return false; }
  if (!storageOk && brandShownThisPageLoad) { return false; }
  brandShownThisPageLoad = true;
  try { window.localStorage.setItem(storageKey, String(now)); } catch { /* storage unavailable */ }
  showToast({
    kind: 'brand',
    title: `${productName} by ${orpheusBrand.name}`,
    link: { href: orpheusBrand.url, label: orpheusBrand.url.replace(/^https?:\/\//, '').replace(/\/$/, '') }
  });
  return true;
}
