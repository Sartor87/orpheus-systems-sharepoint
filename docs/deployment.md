# Deploying to a SharePoint site

This guide installs the four SPFx solutions on one site collection through its own App Catalog and wires them to the lists. Nothing here deploys tenant-wide.

Placeholders: `<tenant>` is the tenant name, `<site>` the site's URL name, `<app-client-id>` the Entra app used for PnP PowerShell sign-in (see [infra/provisioning](../infra/provisioning/README.md#prerequisites)). Never commit real values.

> The provisioning script creates the columns, content types and lists. It does **not** yet create the calendar page or bind the extensions; steps 4 and 5 below do that by hand.

## Prerequisites

- PowerShell 7.4+ with PnP.PowerShell 3.x, and your own Entra app registration for interactive sign-in ([details](../infra/provisioning/README.md#prerequisites)).
- Site owner on the target site. Creating a site collection App Catalog needs a SharePoint administrator once.
- The Podman dev environment, to build the packages ([dev-environment.md](dev-environment.md)).

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

A GitHub Release of a `v*` tag carries the same four files ([ci.md](ci.md)).

## 2. Create the lists

```powershell
cd infra/provisioning
./Provision-OrpheusSite.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id> -WhatIf
./Provision-OrpheusSite.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id>
# add -SeedDemoData -Country BG for the demo contracts, entries and holidays
```

The script is idempotent; its [README](../infra/provisioning/README.md) lists what it creates and what a re-run changes.

## 3. Add the apps to the site collection App Catalog

Once per site, as a SharePoint administrator, connected to the SharePoint admin center (`<admin-center-url>`: the tenant's SharePoint host with `-admin` after the tenant name):

```powershell
Connect-PnPOnline -Url <admin-center-url> -ClientId <app-client-id> -Interactive
Add-PnPSiteCollectionAppCatalog -Site https://<tenant>.sharepoint.com/sites/<site>
```

Then, as site owner, add, publish and install each package:

```powershell
Connect-PnPOnline -Url https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id> -Interactive
foreach ($pkg in 'wp-contract-calendar', 'ext-app-customizer', 'ext-field-customizer', 'ext-form-customizer') {
    $app = Add-PnPApp -Path "packages/$pkg/sharepoint/solution/$pkg.sppkg" -Scope Site -Publish -Overwrite
    Install-PnPApp -Identity $app.Id -Scope Site
}
```

The extension packages deploy code only (`skipFeatureDeployment: true`, no features), so installing them registers nothing on the site. Steps 4 and 5 do.

## 4. The calendar page

Create the page and add the web part:

```powershell
Add-PnPPage -Name 'ContractCalendar' -LayoutType Article
Add-PnPPageWebPart -Page 'ContractCalendar' -Component '8e7c3d81-db98-46c9-993e-d4c26928926f'
Set-PnPPage -Identity 'ContractCalendar' -Publish
```

Open `SitePages/ContractCalendar.aspx`, edit the web part, turn **Use local demo data** off and pick the **Contracts**, **Calendar entries** and **Holidays** lists (the pickers show only lists with the Orpheus content types). Optionally set **Timesheet template** ([timesheet-templates.md](timesheet-templates.md)). Publish the page.

## 5. Bind the extensions

**Application customizer** (header and footer), once per site:

```powershell
Add-PnPCustomAction -Name 'OrpheusChrome' -Title 'Orpheus chrome' -Location 'ClientSideExtension.ApplicationCustomizer' `
  -ClientSideComponentId '30930118-2d09-49f4-bdc4-fb2c9b4af49e' `
  -ClientSideComponentProperties '{"contractsListUrl":"Lists/Contracts","calendarPageUrl":"SitePages/ContractCalendar.aspx","showFooter":true}'
```

Check first that it is not registered already. Read the custom actions through REST, because `Get-PnPCustomAction` does not reliably return `ClientSideComponentId` ([details](dev-environment.md#when-an-extension-does-not-appear-after-an-upgrade)):

```powershell
Invoke-PnPSPRestMethod -Url "/_api/web/UserCustomActions?`$select=Id,Name,ClientSideComponentId"
```

**Field customizer** (remaining-days bars) on the Contracts list's `RemainingDays` column:

```powershell
$field = Get-PnPField -List 'Contracts' -Identity 'RemainingDays'
$field.ClientSideComponentId = 'a7721b49-8c3e-48c7-ac67-69408fcc6a03'
$field.Update()
Invoke-PnPQuery
```

The bars read `OnSiteTargetDays`, `OnSiteUsedDays`, `OffSiteTargetDays` and `OffSiteUsedDays` from the row, so those columns must be in the view ([package README](../packages/ext-field-customizer/README.md)).

**Form customizer** (contract New / Edit / Display) on the list's `Orpheus Contract` content type:

```powershell
$ct = Get-PnPContentType -Identity 'Orpheus Contract' -List 'Contracts'
$ct.NewFormClientSideComponentId = '9ec4e23b-5adb-4be5-af3a-85f46fa4fc27'
$ct.EditFormClientSideComponentId = '9ec4e23b-5adb-4be5-af3a-85f46fa4fc27'
$ct.DisplayFormClientSideComponentId = '9ec4e23b-5adb-4be5-af3a-85f46fa4fc27'
$ct.Update($false)
Invoke-PnPQuery
```

Optional properties (`codePattern`, `defaultCountry`, `calendarPageUrl`) go in the matching `...FormClientSideComponentProperties` as JSON ([package README](../packages/ext-form-customizer/README.md#properties)).

## 6. Check

- The site shows the Orpheus header and footer on every page.
- `Lists/Contracts` shows the remaining-days bars, and **New** opens the Orpheus contract form.
- The calendar page shows the signed-in user's contracts. A user who is neither contractor, manager nor site owner sees none.

## Optional

- **Timesheet template columns:** `infra/provisioning/Add-TimesheetTemplateColumns.ps1` ([README](../infra/provisioning/README.md#optional-columns-for-timesheet-templates)), then the [authoring guide](timesheet-templates.md).
- **Copilot agent:** [packages/agent-contract-calendar/demo/demo-procedure.md](../packages/agent-contract-calendar/demo/demo-procedure.md).

## Upgrading

Build the new versions and run step 3 again (`-Overwrite` replaces the package), then **Update** the app on the site (`Update-PnPApp -Identity <app id> -Scope Site`). Bindings from steps 4 and 5 stay. If an extension disappears after an upgrade, see [When an extension does not appear after an upgrade](dev-environment.md#when-an-extension-does-not-appear-after-an-upgrade): an upgrade that changes a package's feature layout needs a clean reinstall.

## Removing

Remove the custom action, clear the field's and content type's `ClientSideComponentId` values, uninstall and remove the four apps (`Uninstall-PnPApp`, `Remove-PnPApp -Scope Site`), then remove the lists as described in [infra/provisioning](../infra/provisioning/README.md#removing).
