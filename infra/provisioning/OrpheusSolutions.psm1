#Requires -Version 7.4
#Requires -Modules @{ ModuleName = 'PnP.PowerShell'; ModuleVersion = '3.0.0' }

<#
.SYNOPSIS
    Installs the four Orpheus SPFx solutions into a site collection App Catalog and wires them up.

.DESCRIPTION
    Small functions, one tenant concern each, all against the current PnP connection
    (Connect-PnPOnline first):

        Read-SppkgInfo              solution id, version and component ids of a .sppkg
        Get-MissingManifests        component ids whose client-side manifest is not active
        Install-OrpheusSolution     upload, install or update, and reinstall when a manifest is missing
        Set-OrpheusAppCustomizer    the OrpheusChrome header custom action, exactly once
        Set-OrpheusFieldCustomizer  the RemainingDays field customizer and its default view column
        Set-OrpheusFormCustomizer   the Orpheus Contract form customizer on the Contracts list
        Set-OrpheusCalendarPage     the ContractCalendar page with the web part pointed at the lists

    Site collection App Catalog only (-Scope Site). Every write goes through ShouldProcess, so -WhatIf
    makes no write call; the only POST it may send is the read-only GetClientSideComponentsById.
    Each function is idempotent: on a fully provisioned site it reads and reports 'Unchanged'.

    Custom actions are read through GET /_api/web/UserCustomActions, because PnP.PowerShell 3.4.1
    Get-PnPCustomAction does not return ClientSideComponentId reliably.
#>

Set-StrictMode -Version 1.0
$ErrorActionPreference = 'Stop'

#region Constants

# Seconds between two polls of an asynchronous App Catalog operation. Tests set it to 0.
$script:PollIntervalSeconds = 5

#endregion

#region SharePoint REST helper

function Invoke-OrpheusRest {
    # Thin wrapper over Invoke-PnPSPRestMethod. The body is sent as a JSON string: the cmdlet only
    # sends a raw System.String verbatim, and the [string] cast unwraps a PSObject-wrapped value.
    param(
        [ValidateSet('Get', 'Post', 'Merge')] [string] $Method = 'Get',
        [Parameter(Mandatory)] [string] $Url,
        $Body
    )
    $params = @{ Method = $Method; Url = $Url }
    if ($null -ne $Body) {
        [string] $json = $Body | ConvertTo-Json -Compress -Depth 10
        $params.Content = $json
        $params.ContentType = 'application/json;odata=nometadata'
    }
    return Invoke-PnPSPRestMethod @params
}

function ConvertTo-NormalizedId {
    # A GUID as SharePoint may spell it ('{8C05...}', '8c05...') to lowercase, no braces.
    param([string] $Id)
    return $Id.Trim().Trim('{', '}').ToLowerInvariant()
}

#endregion

#region Packages and manifests

function Read-SppkgInfo {
    <#
    .SYNOPSIS
        Reads the solution id, the version and the component ids from a .sppkg file.
    .DESCRIPTION
        The solution id and version come from the App element of AppManifest.xml. A component id
        comes from each entry named <folder>/WebPart_<id>.xml or <folder>/Extension_<id>.xml. The
        folder is the feature id for a web part, so the id is taken from the file name only.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param([Parameter(Mandatory)] [string] $Path)

    $fullPath = (Resolve-Path -LiteralPath $Path).ProviderPath
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($fullPath)
    try {
        $manifestEntry = $zip.GetEntry('AppManifest.xml')
        if (-not $manifestEntry) { throw "$Path has no AppManifest.xml; it is not an SPFx solution package." }
        $reader = [System.IO.StreamReader]::new($manifestEntry.Open())
        try { [xml] $manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $app = $manifest.DocumentElement
        $productId = $app.GetAttribute('ProductID')
        $version = $app.GetAttribute('Version')
        if (-not $productId -or -not $version) { throw "AppManifest.xml in $Path has no ProductID or Version." }

        $pattern = '^[^/]+/(?:WebPart|Extension)_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.xml$'
        $componentIds = @($zip.Entries | ForEach-Object {
                $match = [regex]::Match($_.FullName, $pattern)
                if ($match.Success) { ConvertTo-NormalizedId $match.Groups[1].Value }
            } | Sort-Object -Unique)
    }
    finally {
        $zip.Dispose()
    }

    return [pscustomobject]@{
        SolutionId   = ConvertTo-NormalizedId $productId
        Version      = $version
        ComponentIds = [string[]] $componentIds
    }
}

function Get-MissingManifests {
    <#
    .SYNOPSIS
        Returns the component ids that are not active on the current web.
    .DESCRIPTION
        A component is active when POST /_api/web/GetClientSideComponentsById returns it with a
        non-empty Manifest. An id that is absent from the response, or present with an empty
        Manifest, is returned (lowercase, no braces). This POST is read-only.
    #>
    [CmdletBinding()]
    [OutputType([string[]])]
    param([Parameter(Mandatory)] [string[]] $ComponentIds)

    $ids = [string[]] @($ComponentIds | ForEach-Object { ConvertTo-NormalizedId $_ })
    $response = Invoke-OrpheusRest -Method Post -Url '/_api/web/GetClientSideComponentsById' -Body @{ componentIds = $ids }
    $active = @{}
    foreach ($component in @($response.value)) {
        if ($null -ne $component -and -not [string]::IsNullOrWhiteSpace([string] $component.Manifest)) {
            $active[(ConvertTo-NormalizedId ([string] $component.Id))] = $true
        }
    }
    return [string[]] @($ids | Where-Object { -not $active.ContainsKey($_) })
}

#endregion

Export-ModuleMember -Function Read-SppkgInfo, Get-MissingManifests
