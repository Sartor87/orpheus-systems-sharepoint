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

#region App Catalog

function Wait-OrpheusCondition {
    # Polls $Condition every $script:PollIntervalSeconds until it returns $true, or throws after
    # $TimeoutSeconds. The condition is always evaluated at least once.
    param(
        [Parameter(Mandatory)] [string] $Description,
        [Parameter(Mandatory)] [scriptblock] $Condition,
        [Parameter(Mandatory)] [int] $TimeoutSeconds
    )
    $clock = [System.Diagnostics.Stopwatch]::StartNew()
    while (-not (& $Condition)) {
        if ($clock.Elapsed.TotalSeconds -ge $TimeoutSeconds) {
            throw "Timed out after $TimeoutSeconds s waiting for $Description."
        }
        Start-Sleep -Seconds $script:PollIntervalSeconds
    }
}

function Get-OrpheusApp {
    # The site collection App Catalog entry for a solution id, or $null. Get-PnPApp -Identity throws
    # for a missing app, so list the catalog and filter.
    param([Parameter(Mandatory)] [string] $SolutionId)
    return @(Get-PnPApp -Scope Site) | Where-Object { $null -ne $_ -and (ConvertTo-NormalizedId ([string] $_.Id)) -eq $SolutionId } | Select-Object -First 1
}

function Test-AppInstalled {
    # True when the app is installed at the version in the catalog.
    param($App)
    return $null -ne $App -and -not [string]::IsNullOrEmpty([string] $App.InstalledVersion) -and
        ([string] $App.InstalledVersion) -eq ([string] $App.AppCatalogVersion)
}

function Install-OrpheusSolution {
    <#
    .SYNOPSIS
        Installs or updates one .sppkg in the site collection App Catalog and checks its manifests.
    .DESCRIPTION
        1. Uploads the package (Add-PnPApp -Scope Site -Publish -Overwrite). The upload always
           happens, because the catalog copy is the only way to compare versions.
        2. Installs it when it is not installed, updates it when the installed version differs from
           the catalog version, and otherwise does nothing.
        3. Waits until the installed version matches the catalog version.
        4. Checks the client-side manifests. When one is empty, it does a clean reinstall:
           uninstall, wait, remove from the catalog, upload, install, wait, and checks again. It
           throws with the component ids when a manifest is still empty.
        With -WhatIf it only reads the catalog and the manifests and returns the planned action.
    .OUTPUTS
        [pscustomobject] with Title, Version and Action ('Unchanged', 'Installed', 'Updated' or
        'Reinstalled').
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)] [string] $Path,
        [ValidateRange(1, 86400)] [int] $TimeoutSeconds = 300
    )

    $info = Read-SppkgInfo -Path $Path
    $id = $info.SolutionId
    $app = Get-OrpheusApp -SolutionId $id
    $title = if ($app) { [string] $app.Title } else { [System.IO.Path]::GetFileNameWithoutExtension($Path) }

    # The plan from the current state. The catalog copy is replaced by the upload, so an installed
    # app counts as current when its installed version equals the package version.
    $installed = $null -ne $app -and -not [string]::IsNullOrEmpty([string] $app.InstalledVersion)
    $action = if (-not $installed) { 'Installed' } elseif ([string] $app.InstalledVersion -ne $info.Version) { 'Updated' } else { 'Unchanged' }
    # Under -WhatIf the manifests are checked here (a read-only POST) so the plan shows a reinstall.
    # A real run checks them after the upload instead.
    if ($WhatIfPreference -and $action -eq 'Unchanged' -and @(Get-MissingManifests -ComponentIds $info.ComponentIds).Count) { $action = 'Reinstalled' }
    $result = [pscustomobject]@{ Title = $title; Version = $info.Version; Action = $action }

    $verb = @{ Installed = 'install'; Updated = 'update to'; Unchanged = 'keep'; Reinstalled = 'reinstall' }[$action]
    if (-not $PSCmdlet.ShouldProcess("$title $($info.Version) ($id)", "Upload to the site collection App Catalog and $verb")) {
        return $result
    }

    $waitInstalled = {
        Wait-OrpheusCondition -Description "$title to be installed at the catalog version" -TimeoutSeconds $TimeoutSeconds -Condition {
            Test-AppInstalled (Get-OrpheusApp -SolutionId $id)
        }
    }

    $null = Add-PnPApp -Path $Path -Scope Site -Publish -Overwrite
    $app = Get-OrpheusApp -SolutionId $id
    if (-not $app) { throw "$title ($id) is not in the site collection App Catalog after the upload." }
    if ($app.Title) { $result.Title = $title = [string] $app.Title }

    if ([string]::IsNullOrEmpty([string] $app.InstalledVersion)) {
        Install-PnPApp -Identity ([guid] $id) -Scope Site
        $result.Action = 'Installed'
    }
    elseif ([string] $app.InstalledVersion -ne [string] $app.AppCatalogVersion) {
        Update-PnPApp -Identity ([guid] $id) -Scope Site
        $result.Action = 'Updated'
    }
    else {
        $result.Action = 'Unchanged'
    }
    & $waitInstalled

    $missing = @(Get-MissingManifests -ComponentIds $info.ComponentIds)
    if ($missing.Count) {
        # The live failure: the app reports installed, but a component has no manifest. Only a clean
        # reinstall fixed it.
        Write-Warning "$title`: no active manifest for $($missing -join ', '); reinstalling cleanly."
        Uninstall-PnPApp -Identity ([guid] $id) -Scope Site
        Wait-OrpheusCondition -Description "$title to be uninstalled" -TimeoutSeconds $TimeoutSeconds -Condition {
            $current = Get-OrpheusApp -SolutionId $id
            $null -eq $current -or [string]::IsNullOrEmpty([string] $current.InstalledVersion)
        }
        Remove-PnPApp -Identity ([guid] $id) -Scope Site -Force
        $null = Add-PnPApp -Path $Path -Scope Site -Publish
        Install-PnPApp -Identity ([guid] $id) -Scope Site
        & $waitInstalled
        $result.Action = 'Reinstalled'

        $missing = @(Get-MissingManifests -ComponentIds $info.ComponentIds)
        if ($missing.Count) {
            throw "$title $($info.Version) ($id): no active manifest for component(s) $($missing -join ', ') even after a clean reinstall. Check the package and the App Catalog."
        }
    }
    return $result
}

#endregion

Export-ModuleMember -Function Read-SppkgInfo, Get-MissingManifests, Install-OrpheusSolution
