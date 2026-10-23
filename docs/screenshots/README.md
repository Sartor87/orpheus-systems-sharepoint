# Screenshots

The root [README](../../README.md) and the package READMEs show the images below. They are taken by hand on a test tenant with the demo data, and the README links to these file names already: a link shows as a broken image until its file is added here.

## How to take them

- **Data:** the demo data only (the `001xxx` seed from `Provision-OrpheusSite.ps1 -SeedDemoData` and the `002xxx` agent demo series). The demo people are Jane Doe (contractor), Ivan Petrov (contract manager), Maria Georgieva and Site Admin. No real person, client or employer may appear.
- **Browser:** Microsoft Edge or Chrome, window 1600 × 1000, zoom 100 %, light theme. Close the developer tools.
- **Format:** PNG, file names exactly as listed. Keep each file under 500 KB (`pngquant` or the Windows Snipping Tool's PNG is fine).
- **Crop:** to the part named in "Frame". Keep the browser's address bar only where the frame says so.

### Redaction (mandatory)

- **Blur the tenant name** wherever it shows: in the address bar (`<tenant>.sharepoint.com` → blur the `<tenant>` part), in the site header, in the App Catalog URL and in Copilot. Use a solid blur or a filled box, not a light blur that can be reversed.
- Blur the signed-in account's name, photo and email in the top-right corner if it is a real account.
- Blur any GUID that identifies the tenant (tenant id, app registration client id) if one shows, for example in the App Catalog details pane.
- Check every image at 200 % before committing. `npm run hygiene` cannot see text inside images.

## Shot list

| # | File | Component | Frame | What must be visible |
|---|---|---|---|---|
| 1 | `01-calendar-month-view.png` | Web part | The web part only | A full contract period as Jane Doe: the contract header, several months with on-site, off-site and half days, a holiday and the stats panel with used and remaining days |
| 2 | `02-calendar-range-drag.png` | Web part | The month being dragged | A range drag in progress across a week, with the selection type picker showing the chosen type; weekends inside the range stay unselected |
| 3 | `03-overlap-dialog.png` | Web part | Dialog with the calendar behind it | The "Which contract?" dialog for days that fall in two overlapping contracts (for example `001185_2026` and `001186_2027`) |
| 4 | `04-timesheet-dialog.png` | Web part | Dialog with the calendar behind it | The timesheet dialog with a period chosen, before **Generate** |
| 5 | `05-timesheet-pdf.png` | PDF | First page of the PDF, in the browser's PDF viewer, no address bar | The built-in layout: the contract header, the colour-coded grid, totals, signature boxes and the Orpheus footer line. A template-rendered page may follow as `05b-timesheet-template-pdf.png` |
| 6 | `06-header-footer.png` | Application customizer | Full page, address bar included and blurred | The Orpheus header with the role-aware menu (Manager view) and the footer at the bottom of the same page; scroll or stitch if needed |
| 7 | `07-header-compact-menu.png` | Application customizer | Header only, window narrowed below 640 px | The collapsed menu button with its dropdown open |
| 8 | `08-remaining-days-bars.png` | Field customizer | The Contracts list view | The `RemainingDays` column with on-site and off-site bars for several contracts, at least one of them "over" |
| 9 | `09-form-new.png` | Form customizer | Form panel | New contract, two-column layout, one field showing a validation error, **Save** disabled |
| 10 | `10-form-edit.png` | Form customizer | Form panel | Edit of an existing contract with the overlap warning (**Save anyway** / **Cancel**) shown |
| 11 | `11-form-display.png` | Form customizer | Form panel | Display form, read-only fields and the **Open calendar** link |
| 12 | `12-form-not-allowed.png` | Form customizer | Form panel | Edit opened as Jane Doe (not the contract's manager, not an admin): the notice "Only the contract manager or a site admin can edit contracts." |
| 13 | `13-toasts.png` | Toasts | Bottom-right corner of the page | Two or three stacked toasts, for example "Saved 3 days" (success) above an error toast |
| 14 | `14-app-catalog.png` | App Catalog | The site collection App Catalog list, address bar included and blurred | The four apps (`wp-contract-calendar`, `ext-app-customizer`, `ext-field-customizer`, `ext-form-customizer`) with their versions, all deployed |
| 15 | `15-agent-copilot.png` | Contract agent | Copilot Chat conversation | A booking conversation as Jane Doe: the request, the agent restating dates, type and contract, the confirmation and the per-day result |

## After adding the files

1. Commit the PNGs in this folder. Nothing else needs to change: the README already links to these names.
2. Optional: the web part's `config/package-solution.json` has an empty `screenshotPaths`. Adding `01-calendar-month-view.png` there shows it in the App Catalog; that is a code change for the package owner.
