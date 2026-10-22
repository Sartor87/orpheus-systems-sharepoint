#Requires -Version 7.4
#Requires -Modules @{ ModuleName = 'PnP.PowerShell'; ModuleVersion = '3.0.0' }

<#
.SYNOPSIS
    Prepares a provisioned Orpheus site for the contract agent demo: Vendor column, HR group and 002xxx demo data.

.DESCRIPTION
    Idempotent; running it again leaves a prepared site unchanged. In order it:
      1. Adds the shared site column "Vendor" (ID {582b1c53-77a2-4a1b-918f-14e0b9eaff06}, Text, 255,
         group "Orpheus Systems") unless it exists. The run stops (exit 1) before anything is changed
         if a site column named Vendor has another ID or type, the Vendor ID exists under another
         internal name, or the Contracts list has a Vendor field with another ID. Only a not-found
         response counts as missing; an authentication or permission error stops the run.
      2. Adds a FieldRef for Vendor to the content type "Orpheus Contract" (-UpdateChildren) if missing.
      3. Creates the HR site group (Read permission) if missing and adds the HR member (-EmiliaUpn).
      4. Ensures the five demo users on the site.
      5. Creates the 002xxx demo contracts and calendar entries from demo-data.json that do not exist yet.
      6. Sets Vendor on the demo contracts where it is empty.
      7. Recomputes OnSiteUsedDays / OffSiteUsedDays of the demo contracts (full day = 1, half day = 0.5).
    Only 002xxx items are ever written. 001xxx items are never touched.
    No entries are created in 2026-11-16..2026-11-30, so the overlap of 002102_2026 and 002103_2027 stays
    free for the live demo.

    With -WhatIf the script does not connect to SharePoint; it prints the planned actions from demo-data.json.

.PARAMETER SiteUrl
    Absolute URL of the target site, https://<tenant>.sharepoint.com/sites/<site>.

.PARAMETER ClientId
    Application (client) ID of your own Entra ID app registration for PnP PowerShell interactive login
    (see infra/provisioning/README.md).

.PARAMETER IvanUpn
    UPN of the contract manager (key "ivan" in demo-data.json).

.PARAMETER EmiliaUpn
    UPN of the HR member added to the HR group.

.PARAMETER AlexUpn
    UPN of the contractor with key "alex".

.PARAMETER IonnaUpn
    UPN of the contractor with key "ionna".

.PARAMETER BoyanUpn
    UPN of the contractor with key "boyan".

.PARAMETER HrGroup
    Name of the HR site group. Default: Orpheus HR.

.EXAMPLE
    ./Setup-AgentDemo.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <client-id> -IvanUpn <upn> -EmiliaUpn <upn> -AlexUpn <upn> -IonnaUpn <upn> -BoyanUpn <upn> -WhatIf

    Prints the plan without connecting.

.NOTES
    Requires PowerShell 7.4+ and PnP.PowerShell 3.0+. Writes go through the SharePoint REST API with
    date-only values sent as yyyy-MM-dd.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)] [ValidatePattern('^https://')] [string] $SiteUrl,
    [Parameter(Mandatory)] [ValidateNotNullOrEmpty()] [string] $ClientId,
    [Parameter(Mandatory)] [ValidateNotNullOrEmpty()] [string] $IvanUpn,
    [Parameter(Mandatory)] [ValidateNotNullOrEmpty()] [string] $EmiliaUpn,
    [Parameter(Mandatory)] [ValidateNotNullOrEmpty()] [string] $AlexUpn,
    [Parameter(Mandatory)] [ValidateNotNullOrEmpty()] [string] $IonnaUpn,
    [Parameter(Mandatory)] [ValidateNotNullOrEmpty()] [string] $BoyanUpn,
    [ValidateNotNullOrEmpty()] [string] $HrGroup = 'Orpheus HR'
)

Set-StrictMode -Version 1.0
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'AgentDemo.psm1') -Force
$Data = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'demo-data.json') -Raw | ConvertFrom-Json
foreach ($t in @($Data.contracts.title) + @($Data.entries.contractTitle)) {
    if (-not (Test-DemoTitle $t)) { throw "demo-data.json contains '$t', which is not a 002xxx demo title." }
}

$UpnByKey = @{ ivan = $IvanUpn; alex = $AlexUpn; ionna = $IonnaUpn; boyan = $BoyanUpn }
$ContractTypeName = 'Orpheus Contract'
$script:Summary = [ordered]@{}

function Write-Plan {
    Write-Host 'Plan (no connection made):' -ForegroundColor Cyan
    Write-Host "  Vendor column: add {582b1c53-77a2-4a1b-918f-14e0b9eaff06} if missing; FieldRef on '$ContractTypeName' (-UpdateChildren) if missing"
    Write-Host "  HR group: '$HrGroup' (Read) if missing; add the HR member if not yet a member"
    Write-Host "  Users ensured: $(($UpnByKey.Keys | Sort-Object) -join ', '), plus the HR member"
    Write-Host "  Contracts to create when missing: $(@($Data.contracts).Count)"
    foreach ($c in $Data.contracts) { Write-Host "    $($c.title)  $($c.contractCode)  $($c.startDate)..$($c.latestExecutionDate)  vendor '$($c.vendor)'" }
    Write-Host "  Calendar entries to create when missing: $(@($Data.entries).Count)"
    foreach ($g in ($Data.entries | Group-Object contractTitle)) {
        Write-Host "    $($g.Name): $(($g.Group | ForEach-Object { "$($_.date) $($_.type)" }) -join ', ')"
    }
    Write-Host '  Vendor set on demo contracts where empty; used days recomputed (full 1, half 0.5). 001xxx items are never touched.'
}

if (-not $PSCmdlet.ShouldProcess($SiteUrl, 'Add the Vendor column, HR group and 002xxx demo data')) {
    Write-Plan
    return
}

function Get-ContractTypeId {
    $r = Invoke-SpRest -Url "/_api/web/contenttypes?`$filter=Name eq '$ContractTypeName'&`$select=StringId,Name"
    $ct = @($r.value) | Select-Object -First 1
    if (-not $ct) { throw "Content type '$ContractTypeName' not found. Run infra/provisioning/Provision-OrpheusSite.ps1 first." }
    return [string] $ct.StringId
}

function Get-DemoContracts {
    # Server-side filter: 001xxx items are never fetched. Test-DemoTitle is a second guard.
    return @(Get-ListItemsRest -List 'Contracts' -Select 'Id,Title,Vendor,OnSiteUsedDays,OffSiteUsedDays' -Filter "startswith(Title,'002')" | Where-Object { Test-DemoTitle ([string] $_.Title) })
}

function Get-DemoEntries {
    # Entries of the managed contracts only, one server-side query per contract id.
    param([string] $Select, [int[]] $ContractIds)
    $all = [System.Collections.Generic.List[object]]::new()
    foreach ($id in $ContractIds) {
        foreach ($e in @(Get-ListItemsRest -List 'CalendarEntries' -Select $Select -Filter "ContractId eq $id")) { $all.Add($e) }
    }
    return $all.ToArray()
}

$completed = $false
try {
    Write-Host "Connecting to $SiteUrl ..." -ForegroundColor Cyan
    Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive

    # 0. Pre-flight, read only: every prerequisite must exist before anything is written.
    foreach ($listTitle in 'Contracts', 'CalendarEntries') {
        $null = Invoke-SpRest -Url "/_api/web/lists/getbytitle('$listTitle')?`$select=Id"
    }
    $ctId = Get-ContractTypeId
    $refs = @((Invoke-SpRest -Url "/_api/web/contenttypes('$ctId')/fields?`$select=InternalName").value | ForEach-Object { $_.InternalName })

    # Vendor lookups: only a not-found response counts as missing; auth and other errors stop the run.
    $fieldSelect = "`$select=Id,InternalName,TypeAsString"
    $preflight = Get-VendorPreflightState `
        -SiteField (Get-SpFieldOrNull -Url "/_api/web/fields/getbyinternalnameortitle('Vendor')?$fieldSelect") `
        -SiteFieldById (Get-SpFieldOrNull -Url "/_api/web/fields/getbyid('582b1c53-77a2-4a1b-918f-14e0b9eaff06')?$fieldSelect") `
        -ListField (Get-SpFieldOrNull -Url "/_api/web/lists/getbytitle('Contracts')/fields/getbyinternalnameortitle('Vendor')?$fieldSelect")
    if ($preflight.State -eq 'Conflict') {
        Write-Host "$($preflight.Reason) Nothing was changed." -ForegroundColor Red
        exit 1
    }

    # 1. Vendor column.
    $state = $preflight.State
    if ($state -eq 'Missing') {
        $null = Add-PnPFieldFromXml (Get-VendorFieldXml)
        $script:Summary['Vendor column'] = 'created'
    }
    else { $script:Summary['Vendor column'] = 'unchanged' }

    # 2. FieldRef on the content type.
    if ($refs -contains 'Vendor') { $script:Summary['Content type FieldRef'] = 'unchanged' }
    else {
        Add-PnPFieldToContentType -Field Vendor -ContentType $ContractTypeName -UpdateChildren
        $script:Summary['Content type FieldRef'] = 'added'
    }

    # 3. HR group and member.
    $group = Get-PnPGroup -Identity $HrGroup -ErrorAction SilentlyContinue
    if ($group) { $script:Summary['HR group'] = 'unchanged' }
    else {
        $null = New-PnPSiteGroup -Name $HrGroup -PermissionLevels Read
        $script:Summary['HR group'] = 'created'
    }
    $members = @(Get-PnPGroupMember -Group $HrGroup -ErrorAction SilentlyContinue | ForEach-Object { [string] $_.LoginName })
    if (@($members | Where-Object { $_ -like "*$EmiliaUpn*" }).Count) { $script:Summary['HR member'] = 'unchanged' }
    else {
        $null = New-PnPUser -LoginName $EmiliaUpn
        Add-PnPGroupMember -LoginName $EmiliaUpn -Group $HrGroup
        $script:Summary['HR member'] = 'added'
    }

    # 4. Users.
    $userId = @{}
    foreach ($k in $UpnByKey.Keys) { $userId[$k] = [int] (New-PnPUser -LoginName $UpnByKey[$k]).Id }

    # 5. Contracts (002xxx only).
    $d = $Data.contractDefaults
    $existing = Get-DemoContracts
    $created = 0
    foreach ($c in @(Get-DemoContractPlan -Existing @($existing | ForEach-Object { [string] $_.Title }) -Data $Data)) {
        $body = [ordered]@{
            Title               = [string] $c.title
            ContractCode        = [string] $c.contractCode
            FrameworkContract   = [string] $d.frameworkContract
            Modality            = [string] $d.modality
            ContractorId        = [int] $userId[[string] $c.contractor]
            ContractManagerId   = [int] $userId[[string] $c.manager]
            StartDate           = [string] $c.startDate
            LatestExecutionDate = [string] $c.latestExecutionDate
            OnSiteTargetDays    = [double] $d.onSiteTargetDays
            OffSiteTargetDays   = [double] $d.offSiteTargetDays
            HoursPerDay         = [double] $d.hoursPerDay
            Country             = [string] $d.country
            Status              = [string] $d.status
        }
        $null = Invoke-SpRest -Method Post -Url "/_api/web/lists/getbytitle('Contracts')/items" -Body $body
        $created++
    }
    $script:Summary['Contracts'] = "created $created / unchanged $(@($Data.contracts).Count - $created)"

    # Re-read the managed contracts (new ones now have ids).
    $managed = @{}
    foreach ($i in (Get-DemoContracts)) { $managed[[string] $i.Title] = $i }

    # 6. Entries on demo contracts.
    $titleById = @{}
    foreach ($t in $managed.Keys) { $titleById[[int] $managed[$t].Id] = $t }
    $allEntries = @(Get-DemoEntries -Select 'Id,ContractId,EntryDate,EntryType' -ContractIds @($titleById.Keys))
    $existingPairs = @($allEntries | Where-Object { $titleById.ContainsKey([int] $_.ContractId) } | ForEach-Object {
            @{ ContractTitle = $titleById[[int] $_.ContractId]; Date = ConvertTo-DateKey $_.EntryDate }
        })
    $entryCreated = 0
    foreach ($e in @(Get-DemoEntryPlan -Existing $existingPairs -Data $Data)) {
        $code = ($Data.contracts | Where-Object { $_.title -ceq $e.contractTitle }).contractCode
        $body = [ordered]@{
            Title      = "$code $($e.date)"
            ContractId = [int] $managed[[string] $e.contractTitle].Id
            EntryDate  = [string] $e.date
            EntryType  = [string] $e.type
        }
        $null = Invoke-SpRest -Method Post -Url "/_api/web/lists/getbytitle('CalendarEntries')/items" -Body $body
        $entryCreated++
    }
    $script:Summary['Entries'] = "created $entryCreated / unchanged $(@($Data.entries).Count - $entryCreated)"

    # 7. Vendor where empty.
    $vendorSet = 0; $vendorSame = 0
    foreach ($c in $Data.contracts) {
        $item = $managed[[string] $c.title]
        if ([string]::IsNullOrWhiteSpace([string] $item.Vendor)) {
            $null = Invoke-SpRest -Method Merge -Url "/_api/web/lists/getbytitle('Contracts')/items($($item.Id))" -Body ([ordered]@{ Vendor = [string] $c.vendor })
            $vendorSet++
        }
        else { $vendorSame++ }
    }
    $script:Summary['Vendor values'] = "set $vendorSet / unchanged $vendorSame"

    # 8. Used days of the managed contracts, from all their entries now in the list.
    $entriesNow = @(Get-DemoEntries -Select 'Id,ContractId,EntryType' -ContractIds @($titleById.Keys))
    $usedChanged = 0
    foreach ($t in $managed.Keys) {
        $item = $managed[$t]
        $on = 0.0; $off = 0.0
        foreach ($x in @($entriesNow | Where-Object { [int] $_.ContractId -eq [int] $item.Id })) {
            $v = if ($x.EntryType -like '*Full') { 1.0 } else { 0.5 }
            if ($x.EntryType -like 'OnSite*') { $on += $v } else { $off += $v }
        }
        if ([double] $item.OnSiteUsedDays -ne $on -or [double] $item.OffSiteUsedDays -ne $off) {
            $null = Invoke-SpRest -Method Merge -Url "/_api/web/lists/getbytitle('Contracts')/items($($item.Id))" -Body ([ordered]@{ OnSiteUsedDays = $on; OffSiteUsedDays = $off })
            $usedChanged++
        }
    }
    $script:Summary['Used days'] = "updated $usedChanged / unchanged $($managed.Count - $usedChanged)"
    $completed = $true
}
finally {
    Write-Host ''
    if ($completed) { Write-Host "Done: $SiteUrl" -ForegroundColor Green }
    else { Write-Host "Stopped before completion: $SiteUrl. Changes made so far:" -ForegroundColor Yellow }
    foreach ($k in $script:Summary.Keys) { Write-Host ("  {0}: {1}" -f $k, $script:Summary[$k]) }
}
