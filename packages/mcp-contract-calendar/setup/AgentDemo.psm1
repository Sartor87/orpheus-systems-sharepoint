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

function Get-VendorPreflightState {
    <#
        Classifies the three read-only Vendor lookups made before any write:
          SiteField      web field found by internal name or title 'Vendor' ($null if not found)
          SiteFieldById  web field found by the Vendor Id ($null if not found)
          ListField      Contracts list field found by internal name or title 'Vendor' ($null if not found)
        Returns State Missing | Present | Conflict and a Reason for a conflict.
    #>
    param($SiteField, $SiteFieldById, $ListField)
    $norm = { param($f) ([string] $f.Id).Trim('{', '}').ToLowerInvariant() }
    if ($null -ne $SiteFieldById -and [string] $SiteFieldById.InternalName -cne 'Vendor') {
        return [pscustomobject]@{ State = 'Conflict'; Reason = "The Vendor Id $script:VendorFieldId already exists as site column '$($SiteFieldById.InternalName)'." }
    }
    $site = Get-VendorFieldState -Field $SiteField
    if ($site -eq 'Conflict') {
        return [pscustomobject]@{ State = 'Conflict'; Reason = "A site column named 'Vendor' already exists with Id $($SiteField.Id) and type $($SiteField.TypeAsString); expected Id $script:VendorFieldId and type Text." }
    }
    if ($null -ne $ListField -and (& $norm $ListField) -ne $script:VendorFieldId) {
        return [pscustomobject]@{ State = 'Conflict'; Reason = "The Contracts list already has a field named 'Vendor' with Id $($ListField.Id); expected Id $script:VendorFieldId." }
    }
    return [pscustomobject]@{ State = $site; Reason = $null }
}

function Test-SpNotFound {
    <# True only for a not-found response. Auth, permission and other errors are not "missing". #>
    param($Exception)
    $messages = [System.Collections.Generic.List[string]]::new()
    for ($e = $Exception; $null -ne $e; $e = $e.InnerException) {
        $code = $e.PSObject.Properties['StatusCode']
        if ($code -and $null -ne $code.Value) { return [int] $code.Value -eq 404 }
        $messages.Add([string] $e.Message)
    }
    $text = $messages -join ' | '
    if ($text -match 'Access denied|Unauthori[sz]ed|Forbidden|AADSTS|40[13]') { return $false }
    return $text -match '404|does not exist|Invalid field name'
}

function Get-SpFieldOrNull {
    <# GET a field via REST. Not found returns $null; any other error is rethrown. #>
    param([Parameter(Mandatory)] [string] $Url)
    try { return Invoke-SpRest -Url $Url }
    catch {
        if (Test-SpNotFound -Exception $_.Exception) { return $null }
        throw
    }
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
    # -Filter is an OData $filter evaluated by SharePoint, so callers fetch only the items they manage.
    # A response without "value" is an error, never "no items".
    param([string] $List, [string] $Select, [string] $Filter)
    $items = [System.Collections.Generic.List[object]]::new()
    $url = "/_api/web/lists/getbytitle('$List')/items?`$select=$Select&`$top=5000"
    if ($Filter) { $url += "&`$filter=" + [uri]::EscapeDataString($Filter) }
    while ($url) {
        $page = Invoke-SpRest -Url $url
        if ($null -eq $page -or -not $page.PSObject.Properties['value']) {
            throw "Unexpected response reading list '$List': no 'value' property."
        }
        foreach ($i in @($page.value)) { $items.Add($i) }
        $next = $page.PSObject.Properties['odata.nextLink']
        $url = if ($next) { [string] $next.Value } else { $null }
    }
    return $items.ToArray()
}

Export-ModuleMember -Function Get-VendorFieldState, Get-VendorPreflightState, Test-SpNotFound, Get-SpFieldOrNull, Get-VendorFieldXml, Test-DemoTitle, Get-DemoContractPlan, Get-DemoEntryPlan, ConvertTo-DateKey, ConvertFrom-SpJson, Invoke-SpRest, Get-ListItemsRest
