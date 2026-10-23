# Deploying to a SharePoint site

This guide installs the four SPFx solutions on one site collection through its own App Catalog and wires them to the lists. One run of `Provision-OrpheusSite.ps1 -InstallSolutions` does the work. Nothing here deploys tenant-wide.

Placeholders: `<tenant>` is the tenant name, `<site>` the site's URL name, `<app-client-id>` the Entra app used for PnP PowerShell sign-in (see [infra/provisioning](../infra/provisioning/README.md#prerequisites)). Never commit real values.

## Prerequisites

- PowerShell 7.4+ with PnP.PowerShell 3.x:

  ```powershell
  Install-Module PnP.PowerShell -Scope CurrentUser
  ```

- Your own Entra app registration for interactive sign-in, created once per tenant with `Register-PnPEntraIDAppForInteractiveLogin` ([details](../infra/provisioning/README.md#prerequisites)). Its client ID is `<app-client-id>`.
- Site owner on the target site.
- The Podman dev environment, to build the packages ([dev-environment.md](dev-environment.md)).
- **A site collection App Catalog on the target site.** Once per site, a SharePoint administrator connects to the SharePoint admin center (`<admin-center-url>`: the tenant's SharePoint host with `-admin` after the tenant name). A site collection App Catalog needs the tenant App Catalog, so check that one first:

  ```powershell
  Connect-PnPOnline -Url <admin-center-url> -ClientId <app-client-id> -Interactive
  Get-PnPTenantAppCatalogUrl   # empty: there is no tenant App Catalog yet
  # Only when it is empty:
  Register-PnPAppCatalogSite -Url https://<tenant>.sharepoint.com/sites/appcatalog -Owner <admin-upn> -TimeZoneId <time-zone-id>
  # Then, for the target site:
  Add-PnPSiteCollectionAppCatalog -Site https://<tenant>.sharepoint.com/sites/<site>
  ```

  Without the site collection App Catalog, `-InstallSolutions` stops before it installs anything, and the error names these commands.

## 1. Build the packages

```powershell
.\scripts\podman.ps1 package
```

This produces four files:

| Package | File |
|---|---|
| Web part | `packages/wp-contract-calendar/sharepoint/solution/wp-contract-calendar.sppkg` |
| Application customizer | `packages/ext-app-customizer/sharepoint/solution/ext-app-customizer.sppkg` |
| Field customizer | `packages/ext-field-customizer/sharepoint/solution/ext-field-customizer.sppkg` |
| Form customizer | `packages/ext-form-customizer/sharepoint/solution/ext-form-customizer.sppkg` |

A GitHub Release of a `v*` tag carries the same four files ([ci.md](ci.md)). To install from a Release, put the four files in one folder and pass it as `-SolutionsPath`.

## 2. Provision the lists and install the solutions

```powershell
cd infra/provisioning

# Preview: no sign-in, no changes. Prints the template, and the packages with their versions.
./Provision-OrpheusSite.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id> -InstallSolutions -WhatIf

# Lists, then the solutions and their wiring
./Provision-OrpheusSite.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id> -InstallSolutions

# Optional additions:
#   -SeedDemoData -Country BG                    demo contracts, entries and holidays
#   -SolutionsPath <folder>                      the .sppkg files of a Release instead of this checkout
#   -ApprovingOrgLabel '...' -ServiceProviderLabel '...'   calendar web part labels
```

The script checks the four `.sppkg` files before it signs in, so a missing package stops the run before anything is written. It then applies the list template ([what it creates](../infra/provisioning/README.md#what-gets-created)), seeds the demo data if asked, and with `-InstallSolutions` runs these steps in order:

1. Checks that the site has a site collection App Catalog. This step only reads.
2. Installs `wp-contract-calendar`, `ext-app-customizer`, `ext-field-customizer` and `ext-form-customizer` into the site collection App Catalog (`Add-PnPApp -Scope Site -Publish -Overwrite`, then install or update). It waits for each one to finish and then checks that every component's manifest is active (see [Troubleshooting](#a-component-has-no-active-manifest)).
3. Registers the header and footer: the web custom action `OrpheusChrome` for the application customizer `30930118-2d09-49f4-bdc4-fb2c9b4af49e`, with the properties `{"contractsListUrl":"Lists/Contracts","calendarPageUrl":"SitePages/ContractCalendar.aspx","showFooter":true}`.
4. Binds the field customizer `a7721b49-8c3e-48c7-ac67-69408fcc6a03` to `Contracts.RemainingDays`, and adds the column to the default view when it is missing.
5. Binds the form customizer `9ec4e23b-5adb-4be5-af3a-85f46fa4fc27` to the New, Edit and Display forms of the list's `Orpheus Contract` content type.
6. Creates `SitePages/ContractCalendar.aspx` with the calendar web part (`8e7c3d81-db98-46c9-993e-d4c26928926f`) and publishes it. The web part gets `useLocalData: false` and the ids of `Lists/Contracts`, `Lists/CalendarEntries` and `Lists/Holidays`. On a page that already exists, the script sets those four values on the existing web part and keeps every other setting.

At the end it prints a table with one row per package and step, and what happened: `Installed`, `Updated`, `Reinstalled`, `Added`, `Deduplicated`, `Created` or `Unchanged`. A run that stops partway still prints the rows that finished.

The script does not set the timesheet template URL or the form customizer's optional properties (`codePattern`, `defaultCountry`, `calendarPageUrl`). Set the template in the web part's property pane ([timesheet-templates.md](timesheet-templates.md)). The form properties go in the content type's `...FormClientSideComponentProperties` as JSON ([package README](../packages/ext-form-customizer/README.md#properties)).

The field customizer reads `OnSiteTargetDays`, `OnSiteUsedDays`, `OffSiteTargetDays` and `OffSiteUsedDays` from the row, so those columns must be in the view ([package README](../packages/ext-field-customizer/README.md)).

## 3. Check

- The site shows the Orpheus header and footer on every page.
- `Lists/Contracts` shows the remaining-days bars, and **New** opens the Orpheus contract form.
- The calendar page shows the signed-in user's contracts. A user who is neither contractor, manager nor site owner sees none.

## What is idempotent

Run `-InstallSolutions` as often as you like. On a fully provisioned site, a second run reports `Unchanged` for every row.

- **Packages.** Each package is uploaded on every run, because comparing the catalog copy is the only way to see its version. The app is then installed only when it is missing, and updated only when the installed version differs. A package older than the installed one is refused before the upload.
- **Header.** There is exactly one `OrpheusChrome` action. Duplicates are removed (the first one is kept), and outdated properties are updated in place. Properties count as equal when they parse to the same JSON, whatever the key order or spacing.
- **Field and form customizers.** They are written only when the component id differs.
- **Calendar page.** It is created only when it is missing. An existing web part is changed only when `useLocalData` or one of the three list ids is missing or wrong (or a label you passed differs). Its other settings, such as the timesheet template or a changed `monthsToShow`, stay as they are.

`-WhatIf` makes no write calls. The only request it sends besides reads is the read-only `GetClientSideComponentsById`. `-Confirm` asks before each write step, and asks again before a clean reinstall.

## Optional

- **Timesheet template columns:** `infra/provisioning/Add-TimesheetTemplateColumns.ps1` ([README](../infra/provisioning/README.md#optional-columns-for-timesheet-templates)), then the [authoring guide](timesheet-templates.md).
- **Copilot agent:** [packages/agent-contract-calendar/demo/demo-procedure.md](../packages/agent-contract-calendar/demo/demo-procedure.md).

## Upgrading

Build the new versions, then run the script with `-InstallSolutions` again. Each changed package is uploaded and updated (`Updated`), and the bindings stay. If a component's manifest is empty after the update, the script does a clean reinstall by itself (`Reinstalled`; see below).

## Troubleshooting

### "This site has no usable site collection App Catalog"

The site needs its own App Catalog, and that needs the tenant App Catalog. See [Prerequisites](#prerequisites) for `Register-PnPAppCatalogSite` and `Add-PnPSiteCollectionAppCatalog`. Both need a SharePoint administrator. The error also shows the underlying message, so a sign-in or permission problem shows up there too.

### "Solution package(s) not found"

Run `.\scripts\podman.ps1 package`, or pass `-SolutionsPath` with the folder that holds the four `.sppkg` files. The script looks for `packages/<name>/sharepoint/solution/<name>.sppkg` and for `<name>.sppkg` directly in that folder.

### A component has no active manifest

An app can report itself installed while one of its components is not active. This happened after an upgrade that dropped a package's `features` block: the extension stopped appearing, and only a clean reinstall fixed it ([background](dev-environment.md#when-an-extension-does-not-appear-after-an-upgrade)). The script therefore checks every component after the install or update:

```powershell
Invoke-PnPSPRestMethod -Method Post -Url '/_api/web/GetClientSideComponentsById' `
  -ContentType 'application/json;odata=nometadata' `
  -Content '{"componentIds":["30930118-2d09-49f4-bdc4-fb2c9b4af49e"]}'
```

A component is active when its entry in `value` has a non-empty `Manifest`. An empty `Manifest`, or no entry at all, means it is not active. The script polls for up to 60 s, because activation can lag the install. If the manifest stays empty, the script prints a warning and does a clean reinstall: uninstall, wait, `Remove-PnPApp`, `Add-PnPApp`, install. It then checks again.

- **"... even after a clean reinstall"**: the package itself is the problem. Check its `package-solution.json` and the component ids, rebuild it, and look at the app in the site's App Catalog.
- **"clean reinstall declined"**: you answered No to the reinstall prompt under `-Confirm`. Nothing was uninstalled.
- `Remove-PnPApp` removes the package from the site collection App Catalog, so a clean reinstall also affects any other web in the site collection where the app is installed.

### Two headers, or a header that does not change

Read the custom actions through REST, not with `Get-PnPCustomAction`. PnP.PowerShell 3.4.1 does not reliably return `ClientSideComponentId` there, which once led to a second registration:

```powershell
(Invoke-PnPSPRestMethod -Url '/_api/web/UserCustomActions').value |
  Select-Object Id, Name, Location, ClientSideComponentId, ClientSideComponentProperties
```

The script reads them the same way. It keeps one action with the application customizer's id and removes the rest. It only checks web-scoped actions. An action registered at site scope (`/_api/site/UserCustomActions`) renders a second header, and you have to remove it by hand.

### "Timed out after N s waiting for ..."

An install, update or uninstall did not finish within 300 s. Open the site's App Catalog (*Site contents → Apps for SharePoint*) and the site's *Site contents* to see the app's state, then run the script again.

### The calendar shows demo data or no lists

`Set-OrpheusCalendarPage` sets `useLocalData: false` and the three list ids on the first contract calendar web part on `ContractCalendar.aspx`. If the page has several of these web parts, the script warns that it checks only the first. Remove the others.

## Removing

Remove the `OrpheusChrome` custom action (`Remove-PnPCustomAction -Identity <id> -Scope Web`, with the id from the REST call above). Clear the field's and the content type's `ClientSideComponentId` values. Uninstall and remove the four apps (`Uninstall-PnPApp`, `Remove-PnPApp -Scope Site`). Then remove the lists as described in [infra/provisioning](../infra/provisioning/README.md#removing).
