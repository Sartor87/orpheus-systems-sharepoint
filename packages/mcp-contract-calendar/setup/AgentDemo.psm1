# Pure helpers and minimal REST helpers for Setup-AgentDemo.ps1. The planning functions make no
# SharePoint calls; Invoke-SpRest is the only function that talks to the connected site.

Set-StrictMode -Version 1.0

$script:VendorFieldId = '582b1c53-77a2-4a1b-918f-14e0b9eaff06'
$script:Invariant = [System.Globalization.CultureInfo]::InvariantCulture

function Get-VendorFieldState {
    <# Missing when $null; Present when Id and type match the shared Vendor column; otherwise Conflict. #>
    param($Field)
    if ($null -eq $Field) { return 'Missing' }
    $id = ([string] $Field.Id).Trim('{', '}').ToLowerInvariant()
    if ($id -eq $script:VendorFieldId -and [string] $Field.TypeAsString -ceq 'Text') { return 'Present' }
    return 'Conflict'
}

function Get-VendorFieldXml {
    '<Field ID="{582b1c53-77a2-4a1b-918f-14e0b9eaff06}" Name="Vendor" StaticName="Vendor" DisplayName="Vendor (service provider)" Type="Text" MaxLength="255" Group="Orpheus Systems" />'
}

function Test-DemoTitle {
    # Only the 002xxx demo series is ever managed; \z (not $) rejects a trailing newline.
    param([string] $Title)
    return $Title -cmatch '^002\d{3}_\d{4}\z'
}

function Get-DemoContractPlan {
    param([string[]] $Existing = @(), [Parameter(Mandatory)] $Data)
    $have = [System.Collections.Generic.HashSet[string]]::new([string[]] @($Existing), [System.StringComparer]::Ordinal)
    return @($Data.contracts | Where-Object { (Test-DemoTitle $_.title) -and -not $have.Contains([string] $_.title) })
}

function Get-DemoEntryPlan {
    # Existing: objects or hashtables with ContractTitle and Date (yyyy-MM-dd).
    param($Existing = @(), [Parameter(Mandatory)] $Data)
    $have = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($x in @($Existing)) { $null = $have.Add("$($x.ContractTitle)|$($x.Date)") }
    return @($Data.entries | Where-Object { (Test-DemoTitle $_.contractTitle) -and -not $have.Contains("$($_.contractTitle)|$($_.date)") })
}

function ConvertTo-DateKey {
    # Date-only value from SharePoint to yyyy-MM-dd: round to the nearest UTC midnight (+12h), because a
    # date-only value comes back as local midnight expressed in UTC.
    param($Value)
    if ($null -eq $Value) { return $null }
    if ($Value -is [datetime]) {
        $utc = switch ($Value.Kind) {
            ([System.DateTimeKind]::Local) { $Value.ToUniversalTime() }
            ([System.DateTimeKind]::Unspecified) { [datetime]::SpecifyKind($Value, [System.DateTimeKind]::Utc) }
            default { $Value }
        }
        return $utc.AddHours(12).ToString('yyyy-MM-dd', $script:Invariant)
    }
    $text = [string] $Value
    if ($text -match '^\d{4}-\d{2}-\d{2}$') { return $text }
    return ConvertTo-DateKey ([datetime]::Parse($text, $script:Invariant, [System.Globalization.DateTimeStyles]::RoundtripKind))
}

function ConvertTo-SpObject {
    param($Node)
    if ($null -eq $Node) { return $null }
    if ($Node -is [System.Collections.IDictionary]) {
        $chosen = [ordered]@{}
        foreach ($key in $Node.Keys) {
            if (-not $chosen.Contains($key) -or $key -ceq 'Id') { $chosen[$key] = $key }
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

function ConvertFrom-SpJson {
    # SharePoint items carry both "Id" and "ID"; parse case-sensitively and collapse such duplicates.
    param([Parameter(Mandatory)] [string] $Json)
    return ConvertTo-SpObject ($Json | ConvertFrom-Json -AsHashtable -NoEnumerate)
}

function Invoke-SpRest {
    param(
        [ValidateSet('Get', 'Post', 'Merge')] [string] $Method = 'Get',
        [Parameter(Mandatory)] [string] $Url,
        $Body
    )
    $params = @{ Method = $Method; Url = $Url; Raw = $true }
    if ($null -ne $Body) {
        [string] $json = $Body | ConvertTo-Json -Compress -Depth 5
        $params.Content = $json
        $params.ContentType = 'application/json;odata=nometadata'
    }
    $raw = Invoke-PnPSPRestMethod @params
    if ([string]::IsNullOrWhiteSpace([string] $raw)) { return $null }
    return ConvertFrom-SpJson ([string] $raw)
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

Export-ModuleMember -Function Get-VendorFieldState, Get-VendorFieldXml, Test-DemoTitle, Get-DemoContractPlan, Get-DemoEntryPlan, ConvertTo-DateKey, ConvertFrom-SpJson, Invoke-SpRest, Get-ListItemsRest
