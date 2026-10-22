#Requires -Version 7.4

<#
.SYNOPSIS
    Self-contained mock runner for Add-TimesheetTemplateColumns.ps1 (no Pester, no tenant).

.DESCRIPTION
    Defines fake PnP cmdlets as functions backed by an in-memory fake site, runs the script against
    it and checks the result. Functions take precedence over cmdlets, so the script talks to the fakes
    even though PnP.PowerShell is loaded for its #Requires check. Every other PnP.PowerShell cmdlet is
    shadowed by a function that throws, so nothing can reach a real tenant.

    Run from anywhere:
        pwsh -NoProfile -File infra/provisioning/tests/Add-TimesheetTemplateColumns.Tests.ps1

    Exits 0 when every check passes, 1 otherwise.
#>

Set-StrictMode -Version 1.0
$ErrorActionPreference = 'Stop'

$ScriptPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..' 'Add-TimesheetTemplateColumns.ps1'))
$SiteUrl = 'https://example.invalid/sites/test'
$ClientId = '00000000-0000-0000-0000-000000000000'
$ContractCtId = '0x0100514116295A2F4DD1A93519F365EB8AAF'

# The fixed column IDs. A change here means the script regenerated an ID, which must never happen.
$Expected = [ordered]@{
    ConsultantPosition = @{ Id = '9dc317e5-f253-4598-a2e5-b0c441316be2'; Type = 'Text'; MaxLength = '255' }
    Vendor             = @{ Id = '582b1c53-77a2-4a1b-918f-14e0b9eaff06'; Type = 'Text'; MaxLength = '255'; DisplayName = 'Vendor (service provider)' }
    Lot                = @{ Id = 'f57d74d6-2fce-468e-a179-27f3ade23cbe'; Type = 'Text'; MaxLength = '64' }
    ApproverName       = @{ Id = 'e32b291e-a522-43d3-a5b5-eb3dd79ca7bf'; Type = 'Text'; MaxLength = '255' }
    TemplateFields     = @{ Id = '9d3bc986-d343-43b2-8146-aafa0cf08868'; Type = 'Note'; NumLines = '6'; RichText = 'FALSE' }
}

#region Safety net: shadow every real PnP cmdlet

Import-Module PnP.PowerShell -ErrorAction Stop
foreach ($cmd in (Get-Command -Module PnP.PowerShell -CommandType Cmdlet)) {
    $name = $cmd.Name
    Set-Item -Path "function:script:$name" -Value ([scriptblock]::Create("throw 'Unexpected call to real PnP cmdlet $name (not faked by the test runner).'"))
}

#endregion

#region Fake site

function New-FakeField {
    param([string] $Name, [string] $Id, [string] $Type = 'Text')
    [pscustomobject]@{ Id = $Id.ToLowerInvariant(); InternalName = $Name; TypeAsString = $Type; SchemaXml = "<Field Name=`"$Name`" Type=`"$Type`" />" }
}

function New-FakeSite {
    param([switch] $NoContentType, [switch] $NoList)
    $web = [System.Collections.Generic.List[object]]::new()
    $web.Add((New-FakeField 'Title' 'fa564e0f-0c70-4ab9-b863-0177e6ddd247'))
    $web.Add((New-FakeField 'StartDate' '64cd368d-2f95-4bfc-a1f9-8d4324ecb007' 'DateTime'))
    $web.Add((New-FakeField 'ContractCode' 'c51765ad-9252-4b91-a3c5-dd1a83d782c9'))
    $web.Add((New-FakeField 'HolidayDate' '335e22c3-b8a4-4234-9790-7a03eeb7b0d4'))

    $listFields = [System.Collections.Generic.List[object]]::new()
    $listFields.Add((New-FakeField 'Title' 'fa564e0f-0c70-4ab9-b863-0177e6ddd247'))
    $listFields.Add((New-FakeField 'ContractCode' 'c51765ad-9252-4b91-a3c5-dd1a83d782c9'))
    $listFields.Add((New-FakeField 'Status' 'd99f4591-4a0f-47c4-87c4-161bb319f1a9' 'Choice'))

    $cts = [System.Collections.Generic.List[object]]::new()
    $cts.Add([pscustomobject]@{ StringId = '0x01'; Name = 'Item'; FieldLinks = [System.Collections.Generic.List[object]]::new() })
    if (-not $NoContentType) {
        $links = [System.Collections.Generic.List[object]]::new()
        $links.Add([pscustomobject]@{ Id = 'c51765ad-9252-4b91-a3c5-dd1a83d782c9'; Name = 'ContractCode' })
        $cts.Add([pscustomobject]@{ StringId = $ContractCtId; Name = 'Orpheus Contract'; FieldLinks = $links })
    }

    $items = [System.Collections.Generic.List[object]]::new()
    $items.Add([ordered]@{ Id = 3; ContractCode = '1100-Jane-Doe' })
    $items.Add([ordered]@{ Id = 7; ContractCode = '1185-Jane-Doe' })

    [pscustomobject]@{
        WebFields    = $web
        ListExists   = -not $NoList
        ListFields   = $listFields
        ContentTypes = $cts
        Items        = $items
        FieldXml     = @{}
    }
}

# The fakes run in the target script's scope, where $script: means that script, so the state is global.
$global:TsFake = @{}
$global:TsFake.Site = $null
$global:TsFake.Writes = [System.Collections.Generic.List[string]]::new()
$global:TsFake.Bodies = [System.Collections.Generic.List[object]]::new()
$global:TsFake.Connects = 0

function Connect-PnPOnline {
    [CmdletBinding()]
    param([string] $Url, [string] $ClientId, [switch] $Interactive)
    $global:TsFake.Connects++
}

function Get-PnPList {
    [CmdletBinding()]
    param([Parameter(Position = 0)] $Identity)
    if ($global:TsFake.Site.ListExists -and [string] $Identity -eq 'Contracts') { return [pscustomobject]@{ Title = 'Contracts' } }
    return $null
}

function Add-PnPFieldFromXml {
    [CmdletBinding()]
    param([Parameter(Mandatory, Position = 0)] [string] $FieldXml, $List)
    if ($null -ne $List) { throw 'Fake: the script must create site columns, not list columns.' }
    [xml] $doc = $FieldXml
    $f = $doc.DocumentElement
    $name = $f.GetAttribute('Name')
    if ($global:TsFake.Site.WebFields | Where-Object { $_.InternalName -ceq $name }) { throw "Fake: site column '$name' already exists." }
    $global:TsFake.Site.WebFields.Add((New-FakeField $name $f.GetAttribute('ID').Trim('{', '}') $f.GetAttribute('Type')))
    $global:TsFake.Site.FieldXml[$name] = $f
    $global:TsFake.Writes.Add("ADD FIELD $name")
}

function Add-PnPFieldToContentType {
    [CmdletBinding()]
    param([Parameter(Mandatory)] [string] $Field, [Parameter(Mandatory)] [string] $ContentType, [bool] $UpdateChildren = $true, [switch] $Required, [switch] $Hidden)
    $ct = $global:TsFake.Site.ContentTypes | Where-Object { $_.Name -ceq $ContentType }
    if (-not $ct) { throw "Fake: content type '$ContentType' not found." }
    # PnP resolves a GUID by ID and anything else by internal name or title.
    $key = $Field.Trim('{', '}').ToLowerInvariant()
    $webField = $global:TsFake.Site.WebFields | Where-Object { $_.Id -eq $key -or $_.InternalName -ceq $Field }
    if (-not $webField) { throw "Fake: site column '$Field' not found." }
    $name = $webField.InternalName
    $ct.FieldLinks.Add([pscustomobject]@{ Id = $webField.Id; Name = $name })
    if ($UpdateChildren -and $global:TsFake.Site.ListExists -and -not ($global:TsFake.Site.ListFields | Where-Object { $_.InternalName -ceq $name })) {
        $global:TsFake.Site.ListFields.Add((New-FakeField $name $webField.Id $webField.TypeAsString))
    }
    $global:TsFake.Writes.Add("ADD FIELDREF $name -> $ContentType UpdateChildren=$UpdateChildren")
}

function ConvertTo-FakeJson {
    param($Value)
    return [string] (ConvertTo-Json -InputObject $Value -Depth 6 -Compress)
}

function Invoke-PnPSPRestMethod {
    [CmdletBinding()]
    param([string] $Method = 'Get', [Parameter(Mandatory)] [string] $Url, [switch] $Raw, $Content, [string] $ContentType)
    $s = $global:TsFake.Site
    if ($Method -eq 'Get') {
        if ($Url -match "^/_api/web/availablefields\?") { return ConvertTo-FakeJson @{ value = @($s.WebFields) } }
        if ($Url -match "^/_api/web/lists/getbytitle\('Contracts'\)/fields\?") {
            if (-not $s.ListExists) { throw 'Fake: list Contracts does not exist.' }
            return ConvertTo-FakeJson @{ value = @($s.ListFields) }
        }
        if ($Url -match "^/_api/web/contenttypes\('([^']+)'\)/fieldlinks\?") {
            $ct = $s.ContentTypes | Where-Object { $_.StringId -eq $Matches[1] }
            if (-not $ct) { throw "Fake: content type $($Matches[1]) not found." }
            return ConvertTo-FakeJson @{ value = @($ct.FieldLinks) }
        }
        if ($Url -match "^/_api/web/contenttypes\?") {
            return ConvertTo-FakeJson @{ value = @($s.ContentTypes | ForEach-Object { [ordered]@{ StringId = $_.StringId; Name = $_.Name } }) }
        }
        if ($Url -match "^/_api/web/lists/getbytitle\('Contracts'\)/items\?") {
            # SharePoint list items carry both "Id" and "ID"; ConvertTo-Json cannot write that, so inject it.
            $parts = foreach ($i in $s.Items) { (ConvertTo-FakeJson $i) -replace '^\{', ('{"ID":' + $i.Id + ',') }
            return '{"value":[' + ($parts -join ',') + ']}'
        }
        throw "Fake REST: unexpected GET $Url"
    }
    if ($Method -eq 'Merge' -and $Url -match "^/_api/web/lists/getbytitle\('Contracts'\)/items\((\d+)\)$") {
        $id = [int] $Matches[1]
        if ($Content -isnot [string]) { throw "Fake REST: body must be a [string], got $($Content.GetType().FullName)." }
        if ($ContentType -ne 'application/json;odata=nometadata') { throw "Fake REST: unexpected content type '$ContentType'." }
        $item = $s.Items | Where-Object { $_.Id -eq $id }
        if (-not $item) { throw "Fake REST: item $id not found." }
        $body = $Content | ConvertFrom-Json -AsHashtable
        foreach ($k in $body.Keys) {
            if (-not ($s.ListFields | Where-Object { $_.InternalName -ceq $k })) { throw "Fake REST: list Contracts has no column '$k'." }
            $item[$k] = $body[$k]
        }
        $global:TsFake.Bodies.Add($body)
        $global:TsFake.Writes.Add("MERGE items($id)")
        return ''
    }
    throw "Fake REST: unexpected $Method $Url"
}

#endregion

#region Runner

$script:Failures = [System.Collections.Generic.List[string]]::new()
$script:Passed = 0
$script:Case = ''

function Assert-That {
    param([bool] $Condition, [string] $Message)
    if ($Condition) { $script:Passed++ }
    else { $script:Failures.Add("[$script:Case] $Message"); Write-Host "    FAIL: $Message" -ForegroundColor Red }
}

function Invoke-Target {
    param([hashtable] $Params = @{})
    $global:TsFake.Writes.Clear()
    $global:TsFake.Bodies.Clear()
    $global:TsFake.Connects = 0
    $log = [System.Collections.Generic.List[string]]::new()
    $err = $null
    try {
        & $ScriptPath -SiteUrl $SiteUrl -ClientId $ClientId @Params *>&1 | ForEach-Object { $log.Add([string] $_) }
    }
    catch { $err = $_ }
    [pscustomobject]@{
        Output   = $log -join "`n"
        Error    = if ($err) { [string] $err.Exception.Message } else { $null }
        Writes   = @($global:TsFake.Writes)
        Bodies   = @($global:TsFake.Bodies)
        Connects = $global:TsFake.Connects
    }
}

function Start-Case { param([string] $Name) $script:Case = $Name; Write-Host "- $Name" -ForegroundColor Cyan }

function Show-Run {
    param($Run)
    Write-Host ($Run.Output -split "`n" | ForEach-Object { "      | $_" } | Out-String).TrimEnd() -ForegroundColor DarkGray
    if ($Run.Error) { Write-Host "      ! $($Run.Error)" -ForegroundColor DarkGray }
}

if (-not (Test-Path -LiteralPath $ScriptPath)) {
    Write-Host "Script not found: $ScriptPath" -ForegroundColor Red
    exit 1
}

# 1. Clean site
Start-Case 'clean site: five site columns and five FieldRefs created'
$global:TsFake.Site = New-FakeSite
$run = Invoke-Target
Show-Run $run
Assert-That ($null -eq $run.Error) "no error expected, got: $($run.Error)"
Assert-That ($run.Connects -eq 1) "Connect-PnPOnline called once (was $($run.Connects))"
Assert-That ($run.Writes.Count -eq 10) "10 writes expected, got $($run.Writes.Count): $($run.Writes -join '; ')"
foreach ($name in $Expected.Keys) {
    Assert-That ($run.Writes -contains "ADD FIELD $name") "site column $name created"
    Assert-That ($run.Writes -contains "ADD FIELDREF $name -> Orpheus Contract UpdateChildren=True") "FieldRef $name added with -UpdateChildren"
    $x = $global:TsFake.Site.FieldXml[$name]
    if (-not $x) { continue }
    $e = $Expected[$name]
    Assert-That ($x.GetAttribute('ID').Trim('{', '}').ToLowerInvariant() -eq $e.Id) "$name has ID $($e.Id) (was $($x.GetAttribute('ID')))"
    Assert-That ($x.GetAttribute('ID') -match '^\{.+\}$') "$name ID is braced"
    Assert-That ($x.GetAttribute('Type') -ceq $e.Type) "$name has type $($e.Type)"
    Assert-That ($x.GetAttribute('StaticName') -ceq $name) "$name StaticName equals Name"
    Assert-That ($x.GetAttribute('Group') -ceq 'Orpheus Systems') "$name is in group Orpheus Systems"
    foreach ($attr in @('MaxLength', 'NumLines', 'RichText', 'DisplayName')) {
        if ($e.ContainsKey($attr)) { Assert-That ($x.GetAttribute($attr) -ceq $e[$attr]) "$name $attr = $($e[$attr]) (was '$($x.GetAttribute($attr))')" }
    }
}
$fieldIdx = @($run.Writes | ForEach-Object { $_ -like 'ADD FIELD *' })
Assert-That ([array]::LastIndexOf($fieldIdx, $true) -lt [array]::IndexOf($fieldIdx, $false)) 'all site columns are created before the first FieldRef'
Assert-That ($run.Output -match 'Site columns created: 5') 'summary: Site columns created: 5'
Assert-That ($run.Output -match 'Content type FieldRefs added: 5') 'summary: Content type FieldRefs added: 5'
Assert-That ($run.Output -match 'Done:') 'summary reports Done'

# 2. Second run on the resulting state
Start-Case 'second run: 0 writes, everything unchanged'
$run = Invoke-Target
Show-Run $run
Assert-That ($null -eq $run.Error) "no error expected, got: $($run.Error)"
Assert-That ($run.Writes.Count -eq 0) "0 writes expected, got: $($run.Writes -join '; ')"
Assert-That ($run.Output -match 'Site columns unchanged: 5') 'summary: Site columns unchanged: 5'
Assert-That ($run.Output -match 'Content type FieldRefs unchanged: 5') 'summary: Content type FieldRefs unchanged: 5'
Assert-That ($run.Output -notmatch 'created: [1-9]|added: [1-9]|updated: [1-9]') 'summary has no created/added/updated counts'

# 3. Clash
Start-Case 'clash: two names with the wrong type or ID stop the run before any write'
$global:TsFake.Site = New-FakeSite
$global:TsFake.Site.WebFields.Add((New-FakeField 'Lot' '11111111-1111-1111-1111-111111111111' 'Number'))
$global:TsFake.Site.ListFields.Add((New-FakeField 'ApproverName' '22222222-2222-2222-2222-222222222222' 'Text'))
$run = Invoke-Target
Show-Run $run
Assert-That ($null -ne $run.Error) 'the run stops with an error'
Assert-That ($run.Writes.Count -eq 0) "0 writes expected, got: $($run.Writes -join '; ')"
Assert-That ($run.Error -match 'Lot') 'message names Lot'
Assert-That ($run.Error -match 'ApproverName') 'message names ApproverName'
Assert-That ($run.Error -match 'nothing was changed') 'message says nothing was changed'
Assert-That ($run.Output -match 'Stopped before completion') 'summary reports the stop'

Start-Case 'clash: Vendor with the shared ID but the wrong type stops the run'
$global:TsFake.Site = New-FakeSite
$global:TsFake.Site.WebFields.Add((New-FakeField 'Vendor' $Expected.Vendor.Id 'Note'))
$run = Invoke-Target
Show-Run $run
Assert-That ($null -ne $run.Error -and $run.Error -match 'Vendor') "the run stops naming Vendor (error: $($run.Error))"
Assert-That ($run.Writes.Count -eq 0) "0 writes expected, got: $($run.Writes -join '; ')"

Start-Case 'clash: Vendor with another ID stops the run'
$global:TsFake.Site = New-FakeSite
$global:TsFake.Site.WebFields.Add((New-FakeField 'Vendor' '33333333-3333-3333-3333-333333333333' 'Text'))
$run = Invoke-Target
Show-Run $run
Assert-That ($null -ne $run.Error -and $run.Error -match 'Vendor') "the run stops naming Vendor (error: $($run.Error))"
Assert-That ($run.Writes.Count -eq 0) "0 writes expected, got: $($run.Writes -join '; ')"

# 4. Vendor existing with the shared ID
Start-Case 'Vendor already exists with the shared ID: unchanged'
$global:TsFake.Site = New-FakeSite
$global:TsFake.Site.WebFields.Add((New-FakeField 'Vendor' $Expected.Vendor.Id.ToUpperInvariant() 'Text'))
$run = Invoke-Target
Show-Run $run
Assert-That ($null -eq $run.Error) "no error expected, got: $($run.Error)"
Assert-That ($run.Writes -notcontains 'ADD FIELD Vendor') 'Vendor site column is not created again'
Assert-That ($run.Writes -contains 'ADD FIELDREF Vendor -> Orpheus Contract UpdateChildren=True') 'Vendor FieldRef is still added'
Assert-That ($run.Output -match 'Site columns created: 4') 'summary: Site columns created: 4'
Assert-That ($run.Output -match 'Site columns unchanged: 1') 'summary: Site columns unchanged: 1'

# 5. Missing content type or list
Start-Case 'missing Orpheus Contract content type: stops with the hint'
$global:TsFake.Site = New-FakeSite -NoContentType
$run = Invoke-Target
Show-Run $run
Assert-That ($run.Error -match 'run Provision-OrpheusSite\.ps1 first') "message has the hint (error: $($run.Error))"
Assert-That ($run.Error -match 'Orpheus Contract') 'message names the content type'
Assert-That ($run.Writes.Count -eq 0) "0 writes expected, got: $($run.Writes -join '; ')"

Start-Case 'missing Contracts list: stops with the hint'
$global:TsFake.Site = New-FakeSite -NoList
$run = Invoke-Target
Show-Run $run
Assert-That ($run.Error -match 'run Provision-OrpheusSite\.ps1 first') "message has the hint (error: $($run.Error))"
Assert-That ($run.Error -match 'Contracts') 'message names the list'
Assert-That ($run.Writes.Count -eq 0) "0 writes expected, got: $($run.Writes -join '; ')"

# 6. -WhatIf
Start-Case '-WhatIf: no Connect-PnPOnline, plan printed'
$global:TsFake.Site = New-FakeSite
$run = Invoke-Target @{ WhatIf = $true; SeedDemoData = $true }
Show-Run $run
Assert-That ($null -eq $run.Error) "no error expected, got: $($run.Error)"
Assert-That ($run.Connects -eq 0) "Connect-PnPOnline not called (was $($run.Connects))"
Assert-That ($run.Writes.Count -eq 0) "0 writes expected, got: $($run.Writes -join '; ')"
foreach ($name in $Expected.Keys) {
    Assert-That ($run.Output -match "$name\b.*$($Expected[$name].Id)") "plan lists $name with its ID"
}
Assert-That ($run.Output -match 'Orpheus Contract') 'plan names the content type'
Assert-That ($run.Output -match '1185-Jane-Doe') 'plan names the seed contract'
Assert-That ($run.Output -match 'Senior Solution Architect') 'plan shows the seed values'

# 7. Seed
Start-Case 'seed: differing values give one update'
$global:TsFake.Site = New-FakeSite
$null = Invoke-Target
$global:TsFake.Site.Items[1]['Lot'] = 'Lot 9'
$run = Invoke-Target @{ SeedDemoData = $true }
Show-Run $run
Assert-That ($null -eq $run.Error) "no error expected, got: $($run.Error)"
Assert-That ($run.Writes.Count -eq 1 -and $run.Writes[0] -eq 'MERGE items(7)') "one MERGE of item 7 expected, got: $($run.Writes -join '; ')"
if ($run.Bodies.Count) {
    $b = $run.Bodies[0]
    Assert-That ($b.ConsultantPosition -ceq 'Senior Solution Architect') 'ConsultantPosition from the fixture'
    Assert-That ($b.Vendor -ceq 'Example Services Ltd') 'Vendor from the fixture'
    Assert-That ($b.Lot -ceq 'Lot 1') 'Lot from the fixture'
    Assert-That ($b.ApproverName -ceq 'Jane Example') 'ApproverName from the fixture'
    $wantedFields = "footnote1: 1 day equals 8 hours. Blue: on-site hours. Yellow: off-site hours.`nfootnote2: Hours are recorded in the contract calendar."
    Assert-That ($b.TemplateFields -ceq $wantedFields) "TemplateFields as key: value lines joined by LF (was '$($b.TemplateFields)')"
}
Assert-That ($run.Output -match 'Contract template values updated: 1') 'summary: Contract template values updated: 1'
Assert-That ($global:TsFake.Site.Items[0].Keys.Count -eq 2) 'the other contract is not touched'

Start-Case 'seed: equal values give no write (response has Id and ID)'
$run = Invoke-Target @{ SeedDemoData = $true }
Show-Run $run
Assert-That ($null -eq $run.Error) "no error expected, got: $($run.Error)"
Assert-That ($run.Writes.Count -eq 0) "0 writes expected, got: $($run.Writes -join '; ')"
Assert-That ($run.Output -match 'Contract template values unchanged: 1') 'summary: Contract template values unchanged: 1'
$raw = Invoke-PnPSPRestMethod -Url "/_api/web/lists/getbytitle('Contracts')/items?`$select=Id"
Assert-That ($raw -cmatch '"ID":7' -and $raw -cmatch '"Id":7') 'the fake item response really carries both Id and ID'
$plainFails = $false
try { $null = $raw | ConvertFrom-Json } catch { $plainFails = $true }
Assert-That $plainFails 'plain ConvertFrom-Json rejects that response (so the script must merge the keys)'

Start-Case 'seed: CRLF line breaks in TemplateFields count as equal'
$global:TsFake.Site.Items[1]['TemplateFields'] = ([string] $global:TsFake.Site.Items[1]['TemplateFields']) -replace "`n", "`r`n"
$run = Invoke-Target @{ SeedDemoData = $true }
Assert-That ($null -eq $run.Error -and $run.Writes.Count -eq 0) "0 writes expected, got: $($run.Writes -join '; ') $($run.Error)"

Start-Case 'seed: missing seed contract stops the run'
$global:TsFake.Site.Items.RemoveAt(1)
$run = Invoke-Target @{ SeedDemoData = $true }
Show-Run $run
Assert-That ($run.Error -match '1185-Jane-Doe') "message names the seed contract (error: $($run.Error))"
Assert-That ($run.Writes.Count -eq 0) "0 writes expected, got: $($run.Writes -join '; ')"

#endregion

Write-Host ''
if ($script:Failures.Count) {
    Write-Host "FAILED: $($script:Failures.Count) check(s) failed, $script:Passed passed." -ForegroundColor Red
    $script:Failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
Write-Host "PASSED: all $script:Passed checks." -ForegroundColor Green
exit 0
