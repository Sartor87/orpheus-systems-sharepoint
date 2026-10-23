# wp-contract-calendar

Orpheus Systems contract calendar web part for SharePoint Online (SPFx 1.23.2, React 17, Fluent UI 8).

![The contract calendar](../../docs/screenshots/01-calendar-month-view.png)

## What it does

- Shows the selected contract's period as month grids, with on-site, off-site and half days in their own colours, blocked weekends and the public holidays of the contract's country.
- Records days by clicking one day or dragging across a range; the selection type picker chooses full or half, on-site or off-site. Clearing a day removes its entry.
- Keeps one entry per contractor per date across all of the contractor's contracts. A day that falls in two overlapping contracts opens a "Which contract?" dialog.
- Recomputes the contract's used on-site and off-site days after every write and shows them, with the remaining days, in the stats panel.
- Generates a timesheet PDF for a chosen period in the browser, in the built-in layout or from an HTML template stored on the site ([authoring guide](../../docs/timesheet-templates.md)). The PDF code loads lazily in its own chunk (`orpheus-timesheet-pdf`).
- Filters by role: a contractor sees own contracts, a contract manager the contracts they manage, a site owner all of them. Roles come from the contract's `Contractor` and `ContractManager` fields and from the web's owners group.
- Opens a given contract when the page URL has `?contractId=<id>`; the contract form's **Open calendar** link uses this.
- Reports results through the shared toast stack (`@orpheussystems/shared-ui/toast`).

Runs in SharePoint pages, full-page apps and Microsoft Teams (personal app and tab).

## Properties

| Group | Property | Default | Meaning |
|---|---|---|---|
| Data | `useLocalData` | on in debug builds, off in production | Use `LocalDataService` and its demo data instead of SharePoint |
| Data | `demoUserId` | `1` | With local data: which demo user to act as (contractor, manager, admin) |
| Data | `contractsListId`, `entriesListId`, `holidaysListId` | none | With SharePoint: the three lists. The pickers show only lists with the matching Orpheus content type |
| Display | `monthsToShow` | `0` | Months to show; `0` shows the whole contract period, capped at 12 |
| Display | `blockWeekends` | on | Block Saturdays and Sundays |
| Timesheet | `approvingOrgLabel` | `Client approval` | Label of the approving organisation on the PDF |
| Timesheet | `serviceProviderLabel` | `Service provider` | Label of the service provider on the PDF |
| Timesheet | `timesheetTemplateUrl` | empty | Site-relative or server-relative path to an `.html` template on this site; empty uses the built-in layout |

The property pane's **About** group shows the version, the Orpheus Systems links and the license.

## Data

With local data nothing on the site is needed. With SharePoint the web part reads and writes the Contracts, CalendarEntries and Holidays lists created by [`infra/provisioning`](../../infra/provisioning/README.md). All reads and writes go through `IDataService` in [`shared-core`](../shared-core); the rules are not duplicated here. Background: [ADR 0003](../../architecture/adr/0003-idataservice-local-and-sharepoint.md), [ADR 0005](../../architecture/adr/0005-web-part-filtering-over-item-level-permissions.md), [ADR 0008](../../architecture/adr/0008-one-calendar-entry-per-contractor-per-date.md), [ADR 0010](../../architecture/adr/0010-html-template-timesheet.md).

## Develop

From the repository root (container setup: [docs/dev-environment.md](../../docs/dev-environment.md)):

```powershell
podman compose run --rm shell bash -c "npm test -w @orpheussystems/wp-contract-calendar"
podman compose run --rm shell bash -c "npm run package -w @orpheussystems/wp-contract-calendar"
.\scripts\podman.ps1 serve wp-contract-calendar
```

`serve` opens nothing by itself (`--nobrowser`). Open `https://{tenantDomain}/_layouts/15/workbench.aspx` and add **ContractCalendar**; a debug build starts on local demo data. The tests need the Heft-generated `*.module.scss` typings, so build or package the package once on a fresh clone before running them.

Output: `sharepoint/solution/wp-contract-calendar.sppkg`. Deployment: [docs/deployment.md](../../docs/deployment.md).

## License

Apache-2.0. See the repository's [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
