# @orpheussystems/shared-ui

Shared UI helpers for the Orpheus Systems SPFx solutions. Import the sub-paths (`/tokens`, `/brand`, `/toast`, `/pdf`, `/timesheet`), never the package root: the root pulls in pdfmake.

## Toasts

SharePoint-style notifications that any web part or extension on the page can raise. All of them share one stack (kept on `window.__orpheusToasts`), mounted on first use, so no React wiring is needed. React, react-dom and `@fluentui/react` are peer dependencies.

```ts
import { showToast } from '@orpheussystems/shared-ui/toast';

showToast({ kind: 'success', title: 'Saved 3 days', text: 'Contract 001185_2026' });
```

Options: `kind` (`success`, `error`, `info`, `brand`), `title`, `text`, `link`, one `action`, and `durationMs` (default 15 s; paused while hovered or focused). Up to 3 toasts are shown, newest on top. `showBrandToastOnce(storageKey, intervalDays = 7)` raises the Orpheus Systems toast at most once per browser per interval.
