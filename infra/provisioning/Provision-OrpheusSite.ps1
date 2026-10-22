#Requires -Version 7.4
#Requires -Modules @{ ModuleName = 'PnP.PowerShell'; ModuleVersion = '3.0.0' }

<#
.SYNOPSIS
    Provisions the Orpheus Systems content types and lists on a SharePoint site, and optionally seeds demo data.

.DESCRIPTION
    Applies template.xml (PnP Provisioning Schema 2022-09) with Invoke-PnPSiteTemplate. It creates
    the site columns and the content types "Orpheus Contract", "Orpheus Calendar Entry" and
    "Orpheus Holiday" (group "Orpheus Systems"), and the lists Contracts, CalendarEntries and
    Holidays with their indexes. After the template it makes sure every column the web part
    filters on is indexed.

    The script is idempotent: running it again leaves an already provisioned site unchanged.
    Before the template is applied, a pre-flight check stops the run if a column the template
    would create already exists on the site with a different ID (a clash of internal names).

    -SeedDemoData upserts the demo data from packages/shared-core/src/data/fixtures (the same data
    the web part shows in local mode). The keys are ContractCode for contracts, Contract + EntryDate
    for calendar entries and HolidayDate + Country for holidays. The signed-in user becomes Contractor
    and ContractManager on every seeded contract. Afterwards OnSiteUsedDays / OffSiteUsedDays of each
    seeded contract are recomputed from its calendar entries (full day = 1, half day = 0.5).

    With -WhatIf the script does not connect to SharePoint. It prints what the template contains and,
    with -SeedDemoData, what would be seeded.

.PARAMETER SiteUrl
    Absolute URL of the target site, for example https://<tenant>.sharepoint.com/sites/<site>.

.PARAMETER ClientId
    Application (client) ID of your own Entra ID app registration for PnP PowerShell interactive
    login (see README.md, Register-PnPEntraIDAppForInteractiveLogin). PnP PowerShell no longer
    offers a shared multi-tenant app.

.PARAMETER Country
    ISO 3166-1 alpha-2 country code of the holidays to seed. Default: BG. Holidays with Country "*"
    (all countries) are always seeded. The fixtures only contain BG holidays; for any other country
    only the "*" holidays are seeded.

.PARAMETER SeedDemoData
    Also upsert the demo contracts, calendar entries and holidays from the fixtures.

.EXAMPLE
    ./Provision-OrpheusSite.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id> -WhatIf

    Prints the template summary without connecting or changing anything.

.EXAMPLE
    ./Provision-OrpheusSite.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id>

    Signs in interactively and applies the template.

.EXAMPLE
    ./Provision-OrpheusSite.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id> -SeedDemoData -Country BG

    Applies the template and seeds the demo contracts, entries and BG + "*" holidays.

.NOTES
    Requires PowerShell 7.4+ and PnP.PowerShell 3.0+. Writes go through the SharePoint REST API with
    date-only values sent as yyyy-MM-dd, the same way the web part writes them.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^https://')]
    [string] $SiteUrl,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $ClientId,

    [ValidatePattern('^[A-Za-z]{2}$')]
    [string] $Country = 'BG',

    [switch] $SeedDemoData
)

Set-StrictMode -Version 1.0
$ErrorActionPreference = 'Stop'

$Country = $Country.ToUpperInvariant()
$TemplatePath = Join-Path $PSScriptRoot 'template.xml'
$FixturesPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..' '..' 'packages' 'shared-core' 'src' 'data' 'fixtures'))
$PnpNamespace = 'http://schemas.dev.office.com/PnP/2022/09/ProvisioningSchema'
$Invariant = [System.Globalization.CultureInfo]::InvariantCulture

# Built-in "Start Date" site column, reused by the Orpheus Contract content type (see template.xml).
$BuiltInFields = @{ StartDate = '64cd368d-2f95-4bfc-a1f9-8d4324ecb007' }

# Columns the web part filters on; enforced as indexed after the template is applied.
$IndexedColumns = [ordered]@{
    Contracts       = @('ContractCode', 'Contractor', 'ContractManager', 'Status')
    CalendarEntries = @('Contract', 'EntryDate')
    Holidays        = @('HolidayDate')
}

#region Template inspection

function Read-OrpheusTemplate {
    param([string] $Path)
    [xml] $doc = Get-Content -LiteralPath $Path -Raw
    $ns = [System.Xml.XmlNamespaceManager]::new($doc.NameTable)
    $ns.AddNamespace('pnp', $PnpNamespace)
    $template = $doc.SelectSingleNode('//pnp:ProvisioningTemplate', $ns)
    if (-not $template) { throw "No pnp:ProvisioningTemplate with namespace $PnpNamespace in $Path." }

    $siteFields = @($template.SelectNodes('pnp:SiteFields/Field', $ns) | ForEach-Object {
            [pscustomobject]@{ Name = $_.GetAttribute('Name'); Type = $_.GetAttribute('Type'); Id = $_.GetAttribute('ID').Trim('{', '}').ToLowerInvariant(); Indexed = $_.GetAttribute('Indexed') -eq 'TRUE' }
        })
    $contentTypes = @($template.SelectNodes('pnp:ContentTypes/pnp:ContentType', $ns) | ForEach-Object {
            [pscustomobject]@{
                Name   = $_.GetAttribute('Name')
                Id     = $_.GetAttribute('ID')
                Group  = $_.GetAttribute('Group')
                Fields = @($_.SelectNodes('pnp:FieldRefs/pnp:FieldRef', $ns) | ForEach-Object { $_.GetAttribute('Name') })
            }
        })
    $lists = @($template.SelectNodes('pnp:Lists/pnp:ListInstance', $ns) | ForEach-Object {
            $listNode = $_
            $ctIds = @($listNode.SelectNodes('pnp:ContentTypeBindings/pnp:ContentTypeBinding', $ns) | ForEach-Object { $_.GetAttribute('ContentTypeID') })
            [pscustomobject]@{
                Title        = $listNode.GetAttribute('Title')
                Url          = $listNode.GetAttribute('Url')
                TemplateType = $listNode.GetAttribute('TemplateType')
                ContentTypes = @($contentTypes | Where-Object { $ctIds -contains $_.Id } | ForEach-Object { $_.Name })
                ListFields   = @($listNode.SelectNodes('pnp:Fields/Field', $ns) | ForEach-Object {
                        [pscustomobject]@{ Name = $_.GetAttribute('Name'); Type = $_.GetAttribute('Type'); Id = $_.GetAttribute('ID').Trim('{', '}').ToLowerInvariant(); Indexed = $_.GetAttribute('Indexed') -eq 'TRUE' }
                    })
                ViewFields   = @($listNode.SelectNodes('pnp:Views/View/ViewFields/FieldRef', $ns) | ForEach-Object { $_.GetAttribute('Name') })
            }
        })
    [pscustomobject]@{
        Id           = $template.GetAttribute('ID')
        Version      = $template.GetAttribute('Version')
        SiteFields   = $siteFields
        ContentTypes = $contentTypes
        Lists        = $lists
    }
}

function Show-TemplateSummary {
    param($Template)
    Write-Host "Template $($Template.Id) v$($Template.Version) ($TemplatePath)" -ForegroundColor Cyan
    Write-Host "  Site columns ($($Template.SiteFields.Count)), group 'Orpheus Systems':"
    foreach ($f in $Template.SiteFields) {
        Write-Host ("    {0,-20} {1,-9}{2}" -f $f.Name, $f.Type, $(if ($f.Indexed) { ' indexed' } else { '' }))
    }
    Write-Host "  Reused built-in site columns: $(($BuiltInFields.Keys | Sort-Object) -join ', ')"
    Write-Host "  Content types ($($Template.ContentTypes.Count)):"
    foreach ($ct in $Template.ContentTypes) {
        Write-Host "    $($ct.Name) [$($ct.Id)]: $($ct.Fields -join ', ')"
    }
    Write-Host "  Lists ($($Template.Lists.Count)):"
    foreach ($l in $Template.Lists) {
        $listFields = if ($l.ListFields.Count) { '; list columns: ' + (($l.ListFields | ForEach-Object { "$($_.Name) ($($_.Type))" }) -join ', ') } else { '' }
        Write-Host "    $($l.Title) -> $($l.Url) (template $($l.TemplateType)); content type: $($l.ContentTypes -join ', ')$listFields"
        Write-Host "      indexed: $($IndexedColumns[$l.Title] -join ', ')"
        Write-Host "      default view: $($l.ViewFields -join ', ')"
    }
}

#endregion

#region Fixtures

function ConvertTo-DateKey {
    # Date-only values are compared as yyyy-MM-dd; a value parsed into local time is taken back to UTC first.
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [datetime]) {
        $d = if ($Value.Kind -eq [System.DateTimeKind]::Local) { $Value.ToUniversalTime() } else { $Value }
        return $d.ToString('yyyy-MM-dd', $Invariant)
    }
    return ([string] $Value).Substring(0, 10)
}

function Read-Fixtures {
    $read = { param($name) Get-Content -LiteralPath (Join-Path $FixturesPath $name) -Raw | ConvertFrom-Json }
    $contracts = @(& $read 'contracts.json')
    $entries = @(& $read 'entries.json')
    $allHolidays = @(& $read 'holidays.json')
    $holidays = @($allHolidays | Where-Object { $_.country -eq $Country -or $_.country -eq '*' })
    $countryHolidays = @($allHolidays | Where-Object { $_.country -eq $Country })
    [pscustomobject]@{
        Contracts           = $contracts
        Entries             = $entries
        Holidays            = $holidays
        HasCountryHolidays  = $countryHolidays.Count -gt 0
        FixtureCountries    = @($allHolidays | ForEach-Object { $_.country } | Where-Object { $_ -ne '*' } | Sort-Object -Unique)
    }
}

function Show-SeedSummary {
    param($Fixtures)
    Write-Host "Demo data from $FixturesPath" -ForegroundColor Cyan
    Write-Host "  Contracts: $($Fixtures.Contracts.Count) ($(($Fixtures.Contracts | ForEach-Object { $_.contractCode }) -join ', ')), current user as Contractor and ContractManager"
    Write-Host "  Calendar entries: $($Fixtures.Entries.Count)"
    Write-Host "  Holidays for '$Country' and '*': $($Fixtures.Holidays.Count)"
    if (-not $Fixtures.HasCountryHolidays) {
        Write-Host "  Note: the fixtures have no holidays for '$Country' (only $($Fixtures.FixtureCountries -join ', ')); only the '*' holidays are seeded." -ForegroundColor Yellow
    }
}

#endregion

#region SharePoint REST helpers

function Invoke-SpRest {
    param(
        [ValidateSet('Get', 'Post', 'Merge')] [string] $Method = 'Get',
        [Parameter(Mandatory)] [string] $Url,
        $Body
    )
    $params = @{ Method = $Method; Url = $Url; Raw = $true }
    if ($null -ne $Body) {
        $params.Content = $Body | ConvertTo-Json -Compress -Depth 5
        $params.ContentType = 'application/json;odata=nometadata'
    }
    $raw = Invoke-PnPSPRestMethod @params
    if ([string]::IsNullOrWhiteSpace([string] $raw)) { return $null }
    return $raw | ConvertFrom-Json
}

function Get-ListItemsRest {
    param([string] $List, [string] $Select)
    $items = [System.Collections.Generic.List[object]]::new()
    $url = "/_api/web/lists/getbytitle('$List')/items?`$select=$Select&`$top=5000"
    while ($url) {
        $page = Invoke-SpRest -Url $url
        foreach ($i in @($page.value)) { $items.Add($i) }
        $next = $page.PSObject.Properties['odata.nextLink']
        $url = if ($next) { [string] $next.Value } else { $null }
    }
    return , $items.ToArray()
}

function Test-SameValues {
    # True when every value in $Body already matches the SharePoint item.
    param($Item, [System.Collections.IDictionary] $Body, [string[]] $DateFields = @())
    foreach ($key in $Body.Keys) {
        $prop = $Item.PSObject.Properties[$key]
        if (-not $prop) { return $false }
        $current = $prop.Value
        $wanted = $Body[$key]
        if ($DateFields -contains $key) {
            if ((ConvertTo-DateKey $current) -cne $wanted) { return $false }
        }
        elseif ($wanted -is [double] -or $wanted -is [int]) {
            if ($null -eq $current -or [double] $current -ne [double] $wanted) { return $false }
        }
        elseif ([string] $current -cne [string] $wanted) { return $false }
    }
    return $true
}

$script:Counts = [ordered]@{}
function Add-Count { param([string] $Key) $script:Counts[$Key] = 1 + [int] $script:Counts[$Key] }

function Set-ListItemRest {
    # Creates the item when $ExistingItem is null, updates it when values differ, otherwise leaves it alone.
    param([string] $List, $ExistingItem, [System.Collections.IDictionary] $Body, [string[]] $DateFields = @(), [string] $Label)
    if ($null -eq $ExistingItem) {
        $created = Invoke-SpRest -Method Post -Url "/_api/web/lists/getbytitle('$List')/items" -Body $Body
        Add-Count "$Label created"
        return [int] $created.Id
    }
    if (Test-SameValues -Item $ExistingItem -Body $Body -DateFields $DateFields) {
        Add-Count "$Label unchanged"
    }
    else {
        $null = Invoke-SpRest -Method Merge -Url "/_api/web/lists/getbytitle('$List')/items($($ExistingItem.Id))" -Body $Body
        Add-Count "$Label updated"
    }
    return [int] $ExistingItem.Id
}

#endregion

#region Provisioning steps

function Assert-NoFieldConflicts {
    param($Template)
    $available = @((Invoke-SpRest -Url '/_api/web/availablefields?$select=Id,InternalName').value)
    $conflicts = [System.Collections.Generic.List[string]]::new()
    foreach ($f in $Template.SiteFields) {
        $clash = $available | Where-Object { $_.InternalName -ceq $f.Name -and ([string] $_.Id).ToLowerInvariant() -ne $f.Id }
        foreach ($c in @($clash)) { $conflicts.Add("site column '$($f.Name)' already exists with ID $($c.Id) (template ID $($f.Id))") }
    }
    foreach ($name in $BuiltInFields.Keys) {
        $builtIn = $available | Where-Object { ([string] $_.Id).ToLowerInvariant() -eq $BuiltInFields[$name] }
        if (-not $builtIn) { $conflicts.Add("built-in site column '$name' ($($BuiltInFields[$name])) was not found") }
        elseif ($builtIn.InternalName -cne $name) { $conflicts.Add("built-in site column $($BuiltInFields[$name]) has internal name '$($builtIn.InternalName)', expected '$name'") }
    }
    foreach ($l in $Template.Lists) {
        if (-not $l.ListFields.Count) { continue }
        $list = Get-PnPList -Identity $l.Title -ErrorAction SilentlyContinue
        if (-not $list) { continue }
        $listFields = @((Invoke-SpRest -Url "/_api/web/lists/getbytitle('$($l.Title)')/fields?`$select=Id,InternalName").value)
        foreach ($f in $l.ListFields) {
            $clash = $listFields | Where-Object { $_.InternalName -ceq $f.Name -and ([string] $_.Id).ToLowerInvariant() -ne $f.Id }
            foreach ($c in @($clash)) { $conflicts.Add("list '$($l.Title)' already has a column '$($f.Name)' with ID $($c.Id) (template ID $($f.Id))") }
        }
    }
    if ($conflicts.Count) {
        throw "Pre-flight check failed; nothing was changed:`n  - " + ($conflicts -join "`n  - ")
    }
    Write-Host 'Pre-flight check passed: no column name clashes.' -ForegroundColor Green
}

function Set-RequiredIndexes {
    foreach ($listTitle in $IndexedColumns.Keys) {
        foreach ($name in $IndexedColumns[$listTitle]) {
            $field = Invoke-SpRest -Url "/_api/web/lists/getbytitle('$listTitle')/fields/getbyinternalnameortitle('$name')?`$select=Indexed"
            if ($field.Indexed) {
                Add-Count 'Indexes already present'
            }
            else {
                $null = Set-PnPField -List $listTitle -Identity $name -Values @{ Indexed = $true }
                Write-Host "  Indexed $listTitle.$name"
                Add-Count 'Indexes added'
            }
        }
    }
}

function Invoke-DemoSeed {
    param($Fixtures)
    $me = Invoke-SpRest -Url '/_api/web/currentuser?$select=Id,Title,Email'
    Write-Host "Seeding demo data as $($me.Title) <$($me.Email)> (user ID $($me.Id))" -ForegroundColor Cyan

    # Contracts, keyed by ContractCode.
    $contractDates = @('StartDate', 'LatestExecutionDate')
    $existingContracts = @{}
    foreach ($i in (Get-ListItemsRest -List 'Contracts' -Select 'Id,Title,ContractCode,FrameworkContract,Modality,ContractorId,ContractManagerId,StartDate,LatestExecutionDate,OnSiteTargetDays,OffSiteTargetDays,HoursPerDay,Country,Status,OnSiteUsedDays,OffSiteUsedDays')) {
        if ($i.ContractCode -and -not $existingContracts.ContainsKey($i.ContractCode)) { $existingContracts[$i.ContractCode] = $i }
    }
    $spIdByFixtureId = @{}
    $codeByFixtureId = @{}
    foreach ($c in $Fixtures.Contracts) {
        $body = [ordered]@{
            Title               = [string] $c.title
            ContractCode        = [string] $c.contractCode
            FrameworkContract   = [string] $c.frameworkContract
            Modality            = [string] $c.modality
            ContractorId        = [int] $me.Id
            ContractManagerId   = [int] $me.Id
            StartDate           = ConvertTo-DateKey $c.startDate
            LatestExecutionDate = ConvertTo-DateKey $c.latestExecutionDate
            OnSiteTargetDays    = [double] $c.onSiteTargetDays
            OffSiteTargetDays   = [double] $c.offSiteTargetDays
            HoursPerDay         = [double] $c.hoursPerDay
            Country             = [string] $c.country
            Status              = [string] $c.status
        }
        $spId = Set-ListItemRest -List 'Contracts' -ExistingItem $existingContracts[$body.ContractCode] -Body $body -DateFields $contractDates -Label 'Contracts'
        $spIdByFixtureId[[int] $c.id] = $spId
        $codeByFixtureId[[int] $c.id] = $body.ContractCode
    }

    # Calendar entries, keyed by Contract + EntryDate.
    $existingEntries = @{}
    foreach ($i in (Get-ListItemsRest -List 'CalendarEntries' -Select 'Id,Title,ContractId,EntryDate,EntryType,Note')) {
        $key = "$($i.ContractId)|$(ConvertTo-DateKey $i.EntryDate)"
        if (-not $existingEntries.ContainsKey($key)) { $existingEntries[$key] = $i }
    }
    foreach ($e in $Fixtures.Entries) {
        $fixtureContractId = [int] $e.contractId
        if (-not $spIdByFixtureId.ContainsKey($fixtureContractId)) { throw "Fixture entry $($e.id) references unknown contract $fixtureContractId." }
        $date = ConvertTo-DateKey $e.date
        $body = [ordered]@{
            Title      = "$($codeByFixtureId[$fixtureContractId]) $date"
            ContractId = [int] $spIdByFixtureId[$fixtureContractId]
            EntryDate  = $date
            EntryType  = [string] $e.type
        }
        $note = $e.PSObject.Properties['note']
        if ($note -and $note.Value) { $body.Note = [string] $note.Value }
        $null = Set-ListItemRest -List 'CalendarEntries' -ExistingItem $existingEntries["$($body.ContractId)|$date"] -Body $body -DateFields @('EntryDate') -Label 'CalendarEntries'
    }

    # Used days of every seeded contract, from all its entries now in the list (full = 1, half = 0.5).
    $allEntries = Get-ListItemsRest -List 'CalendarEntries' -Select 'Id,ContractId,EntryType'
    $contractsNow = @{}
    foreach ($i in (Get-ListItemsRest -List 'Contracts' -Select 'Id,OnSiteUsedDays,OffSiteUsedDays')) { $contractsNow[[int] $i.Id] = $i }
    foreach ($spId in ($spIdByFixtureId.Values | Sort-Object -Unique)) {
        $onSite = 0.0; $offSite = 0.0
        foreach ($x in @($allEntries | Where-Object { [int] $_.ContractId -eq $spId })) {
            $value = if ($x.EntryType -like '*Full') { 1.0 } else { 0.5 }
            if ($x.EntryType -like 'OnSite*') { $onSite += $value } else { $offSite += $value }
        }
        $body = [ordered]@{ OnSiteUsedDays = $onSite; OffSiteUsedDays = $offSite }
        $null = Set-ListItemRest -List 'Contracts' -ExistingItem $contractsNow[$spId] -Body $body -Label 'Contract used-days'
    }

    # Holidays, keyed by HolidayDate + Country.
    $existingHolidays = @{}
    foreach ($i in (Get-ListItemsRest -List 'Holidays' -Select 'Id,Title,HolidayDate,Country,Source')) {
        $key = "$(ConvertTo-DateKey $i.HolidayDate)|$($i.Country)"
        if (-not $existingHolidays.ContainsKey($key)) { $existingHolidays[$key] = $i }
    }
    foreach ($h in $Fixtures.Holidays) {
        $body = [ordered]@{
            Title       = [string] $h.title
            HolidayDate = ConvertTo-DateKey $h.date
            Country     = [string] $h.country
            Source      = [string] $h.source
        }
        $null = Set-ListItemRest -List 'Holidays' -ExistingItem $existingHolidays["$($body.HolidayDate)|$($body.Country)"] -Body $body -DateFields @('HolidayDate') -Label 'Holidays'
    }
    if (-not $Fixtures.HasCountryHolidays) {
        Write-Host "Note: the fixtures have no holidays for '$Country'; only the '*' holidays were seeded. Add the $Country holidays to the Holidays list by hand." -ForegroundColor Yellow
    }
}

#endregion

$template = Read-OrpheusTemplate -Path $TemplatePath
$fixtures = if ($SeedDemoData) { Read-Fixtures } else { $null }

$action = 'Apply the Orpheus site template (site columns, content types, lists, indexes)' + $(if ($SeedDemoData) { " and seed demo data (holidays: $Country and *)" } else { '' })
if (-not $PSCmdlet.ShouldProcess($SiteUrl, $action)) {
    Show-TemplateSummary -Template $template
    if ($SeedDemoData) { Show-SeedSummary -Fixtures $fixtures }
    return
}

Write-Host "Connecting to $SiteUrl ..." -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive

Assert-NoFieldConflicts -Template $template

Write-Host "Applying $TemplatePath ..." -ForegroundColor Cyan
Invoke-PnPSiteTemplate -Path $TemplatePath

Write-Host 'Checking indexes ...' -ForegroundColor Cyan
Set-RequiredIndexes

if ($SeedDemoData) { Invoke-DemoSeed -Fixtures $fixtures }

Write-Host ''
Write-Host "Done: $SiteUrl" -ForegroundColor Green
Write-Host "  Template: $($template.SiteFields.Count) site columns, $($template.ContentTypes.Count) content types, lists $(($template.Lists | ForEach-Object { $_.Title }) -join ', ')"
foreach ($key in $script:Counts.Keys) { Write-Host ("  {0}: {1}" -f $key, $script:Counts[$key]) }
