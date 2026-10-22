# Orpheus site provisioning

`Provision-OrpheusSite.ps1` applies `template.xml` (PnP Provisioning Schema
[2022-09](https://github.com/pnp/PnP-Provisioning-Schema/blob/master/ProvisioningSchema-2022-09.md))
to a SharePoint Online site. The template creates the columns, content types and lists
that the contract calendar web part reads and writes. With `-SeedDemoData` the script
also loads the same demo data the web part shows in local mode.

## Prerequisites

- PowerShell 7.4 or later. PnP PowerShell needs at least 7.4.0
  ([installation](https://pnp.github.io/powershell/articles/installation.html)).
- PnP.PowerShell 3.0 or later:

  ```powershell
  Install-Module PnP.PowerShell -Scope CurrentUser
  ```

- Your own Entra ID app registration for interactive login. Since 9 September 2024,
  PnP PowerShell no longer provides a shared multi-tenant app, so you need your own
  ([registering an application](https://pnp.github.io/powershell/articles/registerapplication.html)).
  You only do this once per tenant, and you need rights to create app registrations:

  ```powershell
  Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "Orpheus SPFx Provisioning" `
      -Tenant <tenant>.onmicrosoft.com -SharePointDelegatePermissions "AllSites.FullControl"
  ```

  See the [cmdlet reference](https://pnp.github.io/powershell/cmdlets/Register-PnPEntraIDAppForInteractiveLogin.html).
  The cmdlet has no `-Interactive` switch because interactive login is already its default;
  use `-DeviceLogin` for device-code sign-in. If you leave out the permission parameters, the
  app requests AllSites.FullControl, Group.ReadWrite.All, User.ReadWrite.All and
  TermStore.ReadWrite.All. This script only needs delegated SharePoint
  **AllSites.FullControl**. A tenant admin must grant consent. Note the
  **Application (client) ID** the cmdlet prints, because the script takes it as `-ClientId`.
- Site owner (or site collection admin) on the target site.
- Run the script from a checkout of this repository. `-SeedDemoData` reads
  `packages/shared-core/src/data/fixtures/*.json`.

## Usage

```powershell
cd infra/provisioning

# Preview: no sign-in, no changes. Prints the columns, content types and lists in the template.
./Provision-OrpheusSite.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id> -WhatIf

# Provision the lists
./Provision-OrpheusSite.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id>

# Provision and seed demo data (BG holidays plus the "*" ones)
./Provision-OrpheusSite.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id> -SeedDemoData -Country BG
```

`Get-Help ./Provision-OrpheusSite.ps1 -Full` describes every parameter.

## What gets created

Site columns are in the group **Orpheus Systems**. Their IDs are fixed in `template.xml`
and must never be regenerated.

| List (`Lists/…`) | Content type (default; Item removed) | Columns | Indexed |
|---|---|---|---|
| `Contracts` | `Orpheus Contract` | Title, ContractCode, FrameworkContract, Modality (On-site/Off-site/Hybrid), Contractor, ContractManager, StartDate, LatestExecutionDate, OnSiteTargetDays, OffSiteTargetDays, HoursPerDay (default 8), Country, Status (Draft/Active/Closed, default Active), OnSiteUsedDays, OffSiteUsedDays (default 0), RemainingDays | ContractCode, Contractor, ContractManager, Status |
| `CalendarEntries` | `Orpheus Calendar Entry` | Title, Contract (lookup to Contracts.Title), EntryDate, EntryType (OnSiteFull/OnSiteHalf/OffSiteFull/OffSiteHalf), Note | Contract, EntryDate |
| `Holidays` | `Orpheus Holiday` | Title, HolidayDate, Country (`*` means all countries), Source (Manual/Agent, default Manual) | HolidayDate |

The Contracts list validates every item with `=[LatestExecutionDate]>=[StartDate]`:
"Latest execution date must be on or after the start date."

Three columns are not Orpheus site columns:

- **StartDate** reuses SharePoint's built-in *Start Date* site column
  (`64cd368d-2f95-4bfc-a1f9-8d4324ecb007`), which already has that internal name.
- **Status** is a list column on Contracts. The built-in *Task Status* site column
  already uses the internal name `Status`, with different choices.
- **Contract** is a list column on CalendarEntries because it is a lookup to the
  Contracts list.

Before the template is applied, the script checks every site column it would create. If one
already exists on the site with the same internal name but a different ID, the script stops
without changing anything. After the template it makes sure the columns in the "Indexed"
column above really are indexed.

## Idempotency

You can re-run the script as often as you like. `Invoke-PnPSiteTemplate` updates what
already exists and creates only what is missing. The index check adds only missing indexes.
Seeding is an upsert keyed by:

- contracts: `ContractCode`
- calendar entries: `Contract` + `EntryDate`
- holidays: `HolidayDate` + `Country`

An item is updated only when its values differ from the fixture. The summary at the end
counts created, updated and unchanged items, so a second run should report only
"unchanged" and "already present". The summary is also printed when a run stops partway,
so you can see what was already written.

Two things are not left as they are on a re-run:

- **The default "All Items" view of each list is rebuilt on every run** from the template
  (columns, sort order, row limit). Any changes you made to that view by hand are lost.
  Put your own changes in a separate view.
- `RemoveExistingContentTypes` only takes effect **when a list is first created**. On later
  runs, content types someone added to the lists by hand stay.

When the script reads a date-only value back, it rounds it to the nearest UTC midnight.
SharePoint returns 6 Feb on a UTC+2 site as `2026-02-05T22:00:00Z`, and rounding maps
that back to 6 Feb. This works for any site time zone within ±12 h of UTC.

## Demo data (`-SeedDemoData`)

**Before the first `-SeedDemoData` run**

- Check the site's time zone in *Site settings → Regional settings*. The script writes
  dates as `yyyy-MM-dd`, the same way the web part does. After the first date-bearing
  item is written, the script reads it back and stops with "Date-only round-trip mismatch
  (sent X, read Y)" if the date did not survive. In that case fix the regional settings
  and run again.
- Re-seeding restores the fixture contract for every fixture day. Suppose you moved a
  seeded day to another contract in the web part (the overlap dialog). The next seed
  run recreates that day on its original contract, so the date then has two entries.
  Delete one of them by hand, or don't re-seed once the demo data is in use.


- Contracts: the four fixture contracts with their titles, dates and targets as in the
  fixtures. **You, the signed-in user, become Contractor and ContractManager on all of them.**
- Calendar entries: the fixture entries, titled `<ContractCode> <yyyy-MM-dd>`.
- Used days: after the entries are seeded, `OnSiteUsedDays` / `OffSiteUsedDays` of each
  seeded contract are recomputed from all its entries (full day = 1, half day = 0.5), the
  same way the web part does it.
- Holidays: the fixture holidays for `-Country` plus the `*` ones. The fixtures only contain
  BG holidays, so for any other country only the `*` holidays are seeded and the script
  prints a note.

Date-only values are written through the SharePoint REST API as `yyyy-MM-dd`, the same way the
web part writes them.

## Removing

The script never deletes anything. To remove everything by hand, delete in this order:

1. List `CalendarEntries` (its `Contract` lookup points to Contracts)
2. Lists `Contracts` and `Holidays`
3. If you deleted the lists in the browser, empty them from both recycle bin stages.
   Until you do, the content types still count as in use. `Remove-PnPList` without
   `-Recycle` deletes permanently.
4. Content types `Orpheus Calendar Entry`, `Orpheus Contract`, `Orpheus Holiday`
   (Site settings → Site content types, group Orpheus Systems)
5. The site columns in the group **Orpheus Systems** (leave the built-in Start Date alone)

```powershell
Remove-PnPList -Identity CalendarEntries -Force
Remove-PnPList -Identity Contracts -Force
Remove-PnPList -Identity Holidays -Force
```
