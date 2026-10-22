import * as React from 'react';
import { orpheusMarkFrame, orpheusMarkPoints, orpheusMarkStrokeWidth, orpheusMarkViewBox } from '../brand/brand';
import { orpheusTokens } from '../theme/tokens';
import { DEFAULT_TOAST_DURATION_MS, HOST_ID, ToastEntry, activeToasts, removeToast, subscribe } from './toastStore';

const ACCENT: Record<ToastEntry['kind'], string> = {
  success: '#107C10',
  error: '#A4262C',
  info: orpheusTokens.amber,
  brand: orpheusTokens.amber
};

const GLYPH: Record<ToastEntry['kind'], string> = { success: '✓', error: '!', info: 'i', brand: 'i' };

export const TOAST_STYLE_ID = 'orpheus-toast-styles-v1';

const S = `#${HOST_ID}`;
const CSS = `
${S} .orpheus-toast-stack{position:fixed;top:64px;right:16px;z-index:1000010;display:flex;flex-direction:column;gap:8px;width:min(360px,calc(100vw - 32px));pointer-events:none}
${S} .orpheus-toast{box-sizing:border-box;pointer-events:auto;display:flex;align-items:flex-start;gap:10px;padding:12px 8px 12px 12px;background:#fff;color:#201f1e;border-left:4px solid ${orpheusTokens.amber};border-radius:2px;box-shadow:0 6.4px 14.4px rgba(0,0,0,.132),0 1.2px 3.6px rgba(0,0,0,.108);font-family:"Segoe UI",Arial,sans-serif;font-size:14px;line-height:20px}
@media (prefers-reduced-motion:no-preference){${S} .orpheus-toast{animation:orpheus-toast-in-v1 .2s ease-out}}
@keyframes orpheus-toast-in-v1{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}
${S} .orpheus-toast-icon{flex:0 0 auto;display:inline-flex;padding-top:1px}
${S} .orpheus-toast-glyph{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;color:#fff;font-size:12px;font-weight:700;line-height:1}
${S} .orpheus-toast-body{flex:1 1 auto;min-width:0}
${S} .orpheus-toast-title{font-weight:600}
${S} .orpheus-toast-text{color:#605e5c;overflow-wrap:anywhere}
${S} .orpheus-toast-link{color:#0F6CBD;text-decoration:none}
${S} .orpheus-toast-link:hover{text-decoration:underline}
${S} .orpheus-toast-action{margin-top:6px;padding:2px 12px;min-height:28px;background:transparent;color:#201f1e;border:1px solid #8a8886;border-radius:2px;font:inherit;font-weight:600;cursor:pointer}
${S} .orpheus-toast-action:hover{background:#f3f2f1}
${S} .orpheus-toast-action:focus-visible,${S} .orpheus-toast-close:focus-visible,${S} .orpheus-toast-link:focus-visible{outline:2px solid #1F2329;outline-offset:2px}
${S} .orpheus-toast-close{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;background:transparent;color:#605e5c;border:0;border-radius:2px;cursor:pointer}
${S} .orpheus-toast-close:hover{background:#f3f2f1}
`;

/** Injects the stylesheet once per page. */
export function ensureToastStyles(): void {
  if (document.getElementById(TOAST_STYLE_ID)) { return; }
  const el = document.createElement('style');
  el.id = TOAST_STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

const BrandMark: React.FC = () => (
  <svg
    width={18}
    height={18}
    viewBox={orpheusMarkViewBox}
    fill="none"
    stroke={orpheusTokens.amber}
    strokeWidth={orpheusMarkStrokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect {...orpheusMarkFrame} />
    <polyline points={orpheusMarkPoints} />
  </svg>
);

function durationOf(toast: ToastEntry): number | undefined {
  const d = toast.durationMs === undefined ? DEFAULT_TOAST_DURATION_MS : toast.durationMs;
  return isFinite(d) && d > 0 ? d : undefined; // undefined = sticky
}

const ToastItem: React.FC<{ toast: ToastEntry }> = ({ toast }) => {
  const sticky = durationOf(toast) === undefined;
  const remaining = React.useRef(durationOf(toast) || 0);
  const startedAt = React.useRef(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hovered = React.useRef(false);
  const focused = React.useRef(false);

  const stop = (): void => {
    if (timer.current === undefined) { return; }
    clearTimeout(timer.current);
    timer.current = undefined;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
  };
  const start = (): void => {
    if (sticky || timer.current !== undefined || hovered.current || focused.current) { return; }
    startedAt.current = Date.now();
    timer.current = setTimeout(() => { timer.current = undefined; removeToast(toast.id); }, remaining.current);
  };

  // Mount, and again whenever a duplicate refreshes this toast: start over with the full time.
  React.useEffect(() => {
    stop();
    remaining.current = durationOf(toast) || 0;
    start();
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.rev]);

  const isError = toast.kind === 'error';
  return (
    <div
      className="orpheus-toast"
      style={{ borderLeftColor: ACCENT[toast.kind] }}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      onMouseEnter={() => { hovered.current = true; stop(); }}
      onMouseLeave={() => { hovered.current = false; start(); }}
      onFocus={() => { focused.current = true; stop(); }}
      onBlur={e => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) { return; }
        focused.current = false;
        start();
      }}
    >
      <span className="orpheus-toast-icon" aria-hidden="true">
        {toast.kind === 'brand'
          ? <BrandMark />
          : <span className="orpheus-toast-glyph" style={{ background: ACCENT[toast.kind] }}>{GLYPH[toast.kind]}</span>}
      </span>
      <div className="orpheus-toast-body">
        <div className="orpheus-toast-title">{toast.title}</div>
        {toast.text && <div className="orpheus-toast-text">{toast.text}</div>}
        {toast.link && (
          <a className="orpheus-toast-link" href={toast.link.href} target="_blank" rel="noopener noreferrer">{toast.link.label}</a>
        )}
        {toast.action && (
          <button
            type="button"
            className="orpheus-toast-action"
            onClick={() => { const a = toast.action; removeToast(toast.id); if (a) { a.onClick(); } }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button type="button" className="orpheus-toast-close" aria-label="Dismiss notification" title="Dismiss" onClick={() => removeToast(toast.id)}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
    </div>
  );
};

/** Fixed top-right stack below the SharePoint suite bar; newest on top. */
export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = React.useState<ToastEntry[]>(activeToasts());
  React.useEffect(() => {
    ensureToastStyles();
    const sync = (): void => setToasts(activeToasts());
    const off = subscribe(sync);
    sync();
    return off;
  }, []);
  if (toasts.length === 0) { return null; }
  return (
    <div className="orpheus-toast-stack">
      {toasts.map(t => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
};

export default ToastHost;
