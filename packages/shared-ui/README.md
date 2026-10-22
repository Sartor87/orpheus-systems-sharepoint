# @orpheussystems/shared-ui

Shared UI helpers for the Orpheus Systems SPFx solutions. Import the sub-paths (`/tokens`, `/brand`, `/toast`, `/pdf`, `/timesheet`), never the package root: the root pulls in pdfmake.

## Toasts

SharePoint-style notifications that any web part or extension on the page can raise. All of them share one stack (kept on `window.__orpheusToasts_v1`), mounted on first use, so no React wiring is needed. React and react-dom are peer dependencies; the toast has no other UI dependency, and its styles are scoped under `#orpheus-toast-host-v1`.

```ts
import { showToast } from '@orpheussystems/shared-ui/toast';

showToast({ kind: 'success', title: 'Saved 3 days', text: 'Contract 001185_2026' });
```

Options: `kind` (`success`, `error`, `info`, `brand`), `title`, `text`, `link`, one `action`, and `durationMs` (default 15 s; paused while hovered or focused). Up to 3 toasts are shown, newest on top. `showBrandToastOnce({ title })` raises the Orpheus Systems toast once per page and once per 7 days (site-wide key `BRAND_TOAST_STORAGE_KEY`), however many components ask. `dedupeKey` refreshes a visible toast instead of stacking. `unmountToastHost()` is for tests only.
