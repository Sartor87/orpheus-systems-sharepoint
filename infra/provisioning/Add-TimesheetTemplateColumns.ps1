#Requires -Version 7.4
#Requires -Modules @{ ModuleName = 'PnP.PowerShell'; ModuleVersion = '3.0.0' }

<#
.SYNOPSIS
    Adds the optional timesheet-template columns to the Orpheus Contract content type, and optionally seeds demo values.

.DESCRIPTION
    Creates five site columns (group "Orpheus Systems") that an HTML timesheet template can show,
    and adds them to the "Orpheus Contract" content type with -UpdateChildren, so the Contracts list
    gets them too:

        ConsultantPosition  Text (255)
        Vendor              Text (255), display name "Vendor (service provider)", shared fixed ID
        Lot                 Text (64)
        ApproverName        Text (255)
        TemplateFields      Note (6 lines, plain text), one "key: value" per line

    Run Provision-OrpheusSite.ps1 first: this script needs the Orpheus Contract content type and the
    Contracts list. It does not change template.xml, views, indexes, other columns or the content type
    otherwise.

    The script is idempotent. A site column is created only when it is missing, and a FieldRef is
    added only when the content type does not have it yet. A second run writes nothing and reports
    everything as unchanged.

    Before any change, a pre-flight check stops the run if one of the five internal names already
    exists as a site column or as a Contracts list column with another ID or type, or if one of the
    fixed IDs is in use under another internal name. It lists all clashes at once. Vendor uses an ID
    shared with other Orpheus tooling; when it already exists with that ID and type, it is reported
    as unchanged.

    -SeedDemoData sets the five values on the demo contract with ContractCode 1185-Jane-Doe from
    packages/shared-core/src/data/fixtures/templateData.json, but only when they differ. The custom
    fixture values become TemplateFields as "key: value" lines joined by a line feed.

    With -WhatIf the script does not connect to SharePoint. It prints the plan and, with
    -SeedDemoData, the values that would be seeded.

.PARAMETER SiteUrl
    Absolute URL of the target site, for example https://<tenant>.sharepoint.com/sites/<site>.

.PARAMETER ClientId
    Application (client) ID of your own Entra ID app registration for PnP PowerShell interactive
    login (see README.md).

.PARAMETER SeedDemoData
    Also set the template values on the demo contract 1185-Jane-Doe.

.EXAMPLE
    ./Add-TimesheetTemplateColumns.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id> -WhatIf

    Prints the plan without connecting or changing anything.

.EXAMPLE
    ./Add-TimesheetTemplateColumns.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <app-client-id> -SeedDemoData

    Signs in interactively, adds the columns and seeds the demo contract's template values.

.NOTES
    Requires PowerShell 7.4+ and PnP.PowerShell 3.0+. Item writes go through the SharePoint REST API.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^https://')]
    [string] $SiteUrl,

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $ClientId,

    [switch] $SeedDemoData
)

Set-StrictMode -Version 1.0
$ErrorActionPreference = 'Stop'

$FixturesPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..' '..' 'packages' 'shared-core' 'src' 'data' 'fixtures'))
$ContentTypeName = 'Orpheus Contract'
$ListTitle = 'Contracts'
$SeedContractCode = '1185-Jane-Doe'
$Group = 'Orpheus Systems'

# Fixed IDs. Never regenerate them: a new ID creates a second column. The Vendor ID is shared with
# other Orpheus tooling that uses the same column.
$Columns = @(
    [pscustomobject]@{ Name = 'ConsultantPosition'; Id = '9dc317e5-f253-4598-a2e5-b0c441316be2'; Type = 'Text'; DisplayName = 'Consultant position'; Attributes = 'MaxLength="255"' }
    [pscustomobject]@{ Name = 'Vendor'; Id = '582b1c53-77a2-4a1b-918f-14e0b9eaff06'; Type = 'Text'; DisplayName = 'Vendor (service provider)'; Attributes = 'MaxLength="255"' }
    [pscustomobject]@{ Name = 'Lot'; Id = 'f57d74d6-2fce-468e-a179-27f3ade23cbe'; Type = 'Text'; DisplayName = 'Lot'; Attributes = 'MaxLength="64"' }
    [pscustomobject]@{ Name = 'ApproverName'; Id = 'e32b291e-a522-43d3-a5b5-eb3dd79ca7bf'; Type = 'Text'; DisplayName = 'Approver name'; Attributes = 'MaxLength="255"' }
    [pscustomobject]@{ Name = 'TemplateFields'; Id = '9d3bc986-d343-43b2-8146-aafa0cf08868'; Type = 'Note'; DisplayName = 'Template fields'; Attributes = 'NumLines="6" RichText="FALSE"' }
)

function Get-FieldXml {
    param($Column)
    $display = [System.Security.SecurityElement]::Escape($Column.DisplayName)
    return "<Field ID=`"{$($Column.Id)}`" Name=`"$($Column.Name)`" StaticName=`"$($Column.Name)`" DisplayName=`"$display`" Type=`"$($Column.Type)`" $($Column.Attributes) Group=`"$Group`" />"
}

#region Seed values

function Read-SeedValues {
    # The template values of the fixture contract whose contractCode is $SeedContractCode, as the body to write.
    $contracts = @(Get-Content -LiteralPath (Join-Path $FixturesPath 'contracts.json') -Raw | ConvertFrom-Json)
    $contract = @($contracts | Where-Object { $_.contractCode -ceq $SeedContractCode })
    if (-not $contract.Count) { throw "Fixture contract $SeedContractCode not found in $FixturesPath/contracts.json." }
    $templateData = Get-Content -LiteralPath (Join-Path $FixturesPath 'templateData.json') -Raw | ConvertFrom-Json
    $entry = $templateData.PSObject.Properties[[string] $contract[0].id]
    if (-not $entry) { throw "templateData.json has no entry for fixture contract $($contract[0].id) ($SeedContractCode)." }
    $data = $entry.Value
    $custom = $data.PSObject.Properties['custom']
    $lines = if ($custom -and $custom.Value) { @($custom.Value.PSObject.Properties | ForEach-Object { "$($_.Name): $($_.Value)" }) } else { @() }
    return [ordered]@{
        ConsultantPosition = [string] $data.position
        Vendor             = [string] $data.vendor
        Lot                = [string] $data.lot
        ApproverName       = [string] $data.approverName
        TemplateFields     = $lines -join "`n"
    }
}

function Show-Plan {
    param($SeedValues)
    Write-Host "Optional timesheet-template columns for content type '$ContentTypeName' (list $ListTitle)" -ForegroundColor Cyan
    Write-Host "  Site columns, group '$Group' (created only when missing):"
    foreach ($c in $Columns) {
        Write-Host ("    {0,-19} {1,-5} {2,-29} {{{3}}} '{4}'" -f $c.Name, $c.Type, $c.Attributes, $c.Id, $c.DisplayName)
    }
    Write-Host "  FieldRefs on '$ContentTypeName' with -UpdateChildren (added only when missing)."
    Write-Host "  Pre-flight: stops if a name exists with another ID or type, or the content type or list is missing."
    if ($SeedValues) {
        Write-Host "  Seed contract $SeedContractCode (written only when a value differs):"
        foreach ($key in $SeedValues.Keys) {
            Write-Host ("    {0,-19} {1}" -f $key, ($SeedValues[$key] -replace "`n", ' | '))
        }
    }
}

#endregion

#region SharePoint REST helpers (same conventions as Provision-OrpheusSite.ps1)

function Invoke-SpRest {
    param(
        [ValidateSet('Get', 'Post', 'Merge')] [string] $Method = 'Get',
        [Parameter(Mandatory)] [string] $Url,
        $Body
    )
    $params = @{ Method = $Method; Url = $Url; Raw = $true }
    if ($null -ne $Body) {
        # The cmdlet only sends a raw System.String verbatim; the [string] cast unwraps the PSObject.
        [string] $json = $Body | ConvertTo-Json -Compress -Depth 5
        $params.Content = $json
        $params.ContentType = 'application/json;odata=nometadata'
    }
    $raw = Invoke-PnPSPRestMethod @params
    if ([string]::IsNullOrWhiteSpace([string] $raw)) { return $null }
    return ConvertFrom-SpJson ([string] $raw)
}

# Spelling kept when a SharePoint response has keys that differ only in case (the script uses .Id).
$SpPreferredKeys = @('Id')

function ConvertFrom-SpJson {
    # SharePoint list items carry both "Id" and "ID". Plain ConvertFrom-Json rejects that, so parse
    # case-sensitively (-AsHashtable) and collapse each case-only duplicate into one property.
    param([Parameter(Mandatory)] [string] $Json)
    return ConvertTo-SpObject ($Json | ConvertFrom-Json -AsHashtable -NoEnumerate)
}

function ConvertTo-SpObject {
    param($Node)
    if ($null -eq $Node) { return $null }
    if ($Node -is [System.Collections.IDictionary]) {
        $chosen = [ordered]@{}
        foreach ($key in $Node.Keys) {
            if (-not $chosen.Contains($key) -or $key -cin $SpPreferredKeys) { $chosen[$key] = $key }
        }
        $props = [ordered]@{}
        foreach ($key in $chosen.Values) { $props[$key] = ConvertTo-SpObject $Node[$key] }
        return [pscustomobject] $props
    }
    if ($Node -is [System.Collections.IList]) {
        return , [object[]] @(foreach ($x in $Node) { , (ConvertTo-SpObject $x) })
    }
    return $Node
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

function ConvertTo-GuidKey { param($Value) return ([string] $Value).Trim('{', '}').ToLowerInvariant() }

$script:Counts = [ordered]@{}
function Add-Count { param([string] $Key) $script:Counts[$Key] = 1 + [int] $script:Counts[$Key] }

#endregion

#region Steps

function Assert-Prerequisites {
    # Reads only. Collects every problem and reports them together; returns what already exists.
    $missing = [System.Collections.Generic.List[string]]::new()
    $conflicts = [System.Collections.Generic.List[string]]::new()

    $ct = @((Invoke-SpRest -Url '/_api/web/contenttypes?$select=StringId,Name').value | Where-Object { $_.Name -ceq $ContentTypeName })
    if (-not $ct.Count) { $missing.Add("content type '$ContentTypeName' was not found") }
    $list = Get-PnPList -Identity $ListTitle -ErrorAction SilentlyContinue
    if (-not $list) { $missing.Add("list '$ListTitle' was not found") }

    $available = @((Invoke-SpRest -Url '/_api/web/availablefields?$select=Id,InternalName,TypeAsString').value)
    $listFields = if ($list) { @((Invoke-SpRest -Url "/_api/web/lists/getbytitle('$ListTitle')/fields?`$select=Id,InternalName,TypeAsString").value) } else { @() }

    $existing = @{}
    foreach ($c in $Columns) {
        foreach ($f in @($available | Where-Object { $_.InternalName -ceq $c.Name })) {
            if ((ConvertTo-GuidKey $f.Id) -ne $c.Id -or $f.TypeAsString -cne $c.Type) {
                $conflicts.Add("site column '$($c.Name)' already exists as $($f.TypeAsString) with ID $($f.Id) (expected $($c.Type), ID $($c.Id))")
            }
            else { $existing[$c.Name] = $true }
        }
        foreach ($f in @($available | Where-Object { (ConvertTo-GuidKey $_.Id) -eq $c.Id -and $_.InternalName -cne $c.Name })) {
            $conflicts.Add("ID $($c.Id) of '$($c.Name)' is already used by site column '$($f.InternalName)'")
        }
        foreach ($f in @($listFields | Where-Object { $_.InternalName -ceq $c.Name })) {
            if ((ConvertTo-GuidKey $f.Id) -ne $c.Id -or $f.TypeAsString -cne $c.Type) {
                $conflicts.Add("list '$ListTitle' already has a column '$($c.Name)' of type $($f.TypeAsString) with ID $($f.Id) (expected $($c.Type), ID $($c.Id))")
            }
        }
    }

    if ($missing.Count -or $conflicts.Count) {
        $lines = @($missing) + @($conflicts)
        $hint = if ($missing.Count) { "`nThe Orpheus lists are not provisioned: run Provision-OrpheusSite.ps1 first." } else { '' }
        throw "Pre-flight check failed; nothing was changed:`n  - " + ($lines -join "`n  - ") + $hint
    }
    Write-Host 'Pre-flight check passed: content type and list found, no column clashes.' -ForegroundColor Green
    return [pscustomobject]@{ ContentTypeId = [string] $ct[0].StringId; ExistingSiteColumns = $existing }
}

function Add-SiteColumns {
    param($State)
    foreach ($c in $Columns) {
        if ($State.ExistingSiteColumns.ContainsKey($c.Name)) { Add-Count 'Site columns unchanged'; continue }
        try { $null = Add-PnPFieldFromXml -FieldXml (Get-FieldXml $c) }
        catch { Add-Count 'Site columns failed'; throw }
        Write-Host "  Created site column $($c.Name) ($($c.Type))"
        Add-Count 'Site columns created'
    }
}

function Add-ContentTypeFieldRefs {
    param($State)
    $links = @((Invoke-SpRest -Url "/_api/web/contenttypes('$($State.ContentTypeId)')/fieldlinks?`$select=Id,Name").value)
    foreach ($c in $Columns) {
        if ($links | Where-Object { (ConvertTo-GuidKey $_.Id) -eq $c.Id }) { Add-Count 'Content type FieldRefs unchanged'; continue }
        # By ID, so a column whose title happens to be the same name cannot be picked instead.
        try { $null = Add-PnPFieldToContentType -Field $c.Id -ContentType $ContentTypeName -UpdateChildren $true }
        catch { Add-Count 'Content type FieldRefs failed'; throw }
        Write-Host "  Added $($c.Name) to '$ContentTypeName'"
        Add-Count 'Content type FieldRefs added'
    }
}

function Set-SeedValues {
    param([System.Collections.IDictionary] $Body)
    $select = 'Id,ContractCode,' + ($Body.Keys -join ',')
    # Get-ListItemsRest returns one array object; assign it first so the pipeline enumerates the items.
    $items = Get-ListItemsRest -List $ListTitle -Select $select
    $item = $items | Where-Object { $_.ContractCode -ceq $SeedContractCode } | Select-Object -First 1
    if (-not $item) { throw "Contract $SeedContractCode was not found in the $ListTitle list. Seed it with Provision-OrpheusSite.ps1 -SeedDemoData first." }
    $same = $true
    foreach ($key in $Body.Keys) {
        $prop = $item.PSObject.Properties[$key]
        $current = if ($prop -and $null -ne $prop.Value) { ([string] $prop.Value) -replace "`r`n", "`n" } else { '' }
        if ($current -cne [string] $Body[$key]) { $same = $false; break }
    }
    if ($same) { Add-Count 'Contract template values unchanged'; return }
    try { $null = Invoke-SpRest -Method Merge -Url "/_api/web/lists/getbytitle('$ListTitle')/items($([int] $item.Id))" -Body $Body }
    catch { Add-Count 'Contract template values failed'; throw }
    Write-Host "  Set the template values on $SeedContractCode (item $($item.Id))"
    Add-Count 'Contract template values updated'
}

#endregion

$seedValues = if ($SeedDemoData) { Read-SeedValues } else { $null }

$action = "Add the optional timesheet-template columns to '$ContentTypeName'" + $(if ($SeedDemoData) { " and seed $SeedContractCode" } else { '' })
if (-not $PSCmdlet.ShouldProcess($SiteUrl, $action)) {
    Show-Plan -SeedValues $seedValues
    return
}

$completed = $false
try {
    Write-Host "Connecting to $SiteUrl ..." -ForegroundColor Cyan
    Connect-PnPOnline -Url $SiteUrl -ClientId $ClientId -Interactive

    $state = Assert-Prerequisites

    Write-Host 'Checking site columns ...' -ForegroundColor Cyan
    Add-SiteColumns -State $state

    Write-Host "Checking FieldRefs on '$ContentTypeName' ..." -ForegroundColor Cyan
    Add-ContentTypeFieldRefs -State $state

    if ($SeedDemoData) {
        Write-Host "Seeding template values on $SeedContractCode ..." -ForegroundColor Cyan
        Set-SeedValues -Body $seedValues
    }
    $completed = $true
}
finally {
    Write-Host ''
    if ($completed) { Write-Host "Done: $SiteUrl" -ForegroundColor Green }
    else { Write-Host "Stopped before completion: $SiteUrl. Changes made so far:" -ForegroundColor Yellow }
    if ($script:Counts.Count -eq 0) { Write-Host '  Nothing was written or checked.' }
    foreach ($key in $script:Counts.Keys) { Write-Host ("  {0}: {1}" -f $key, $script:Counts[$key]) }
}
