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
        Set-OrpheusContractManagersGroup  the Orpheus Contract Managers group (Contribute), created once
        Set-OrpheusCalendarPage     the ContractCalendar page with the web part pointed at the lists
        Get-OrpheusPackagePaths     the four .sppkg files, checked before anything touches the site
        Invoke-OrpheusSolutionInstall  all of the above in order (Provision-OrpheusSite.ps1 -InstallSolutions)

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

# Seconds to keep polling an empty component manifest before treating it as broken. Activation can
# lag the install, so a single empty answer is not enough. Tests set it to 1.
$script:ManifestSettleSeconds = 60

# Fixed component ids from the SPFx manifests. Never change them: SharePoint binds by id.
$script:AppCustomizerId = '30930118-2d09-49f4-bdc4-fb2c9b4af49e'
$script:FieldCustomizerId = 'a7721b49-8c3e-48c7-ac67-69408fcc6a03'
$script:FormCustomizerId = '9ec4e23b-5adb-4be5-af3a-85f46fa4fc27'
$script:WebPartId = '8e7c3d81-db98-46c9-993e-d4c26928926f'

# The Orpheus Contract site content type. The Contracts list copy has an id that starts with it.
$script:ContractContentTypeId = '0x0100514116295A2F4DD1A93519F365EB8AAF'

$script:ChromeName = 'OrpheusChrome'
$script:ChromeTitle = 'Orpheus header and footer'
$script:ChromeLocation = 'ClientSideExtension.ApplicationCustomizer'
$script:ChromeProperties = '{"contractsListUrl":"Lists/Contracts","calendarPageUrl":"SitePages/ContractCalendar.aspx","showFooter":true}'

$script:ContractsListTitle = 'Contracts'
$script:RemainingDaysField = 'RemainingDays'

# The repository root (this file is infra/provisioning/OrpheusSolutions.psm1), and the packages in
# install order: the web part first, then the header, field and form extensions.
$script:RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..' '..'))
$script:PackageNames = @('wp-contract-calendar', 'ext-app-customizer', 'ext-field-customizer', 'ext-form-customizer')

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

function Test-SameId {
    # True when two GUID strings name the same id, whatever the case or braces. Empty never matches.
    param([string] $Actual, [string] $Expected)
    return -not [string]::IsNullOrWhiteSpace($Actual) -and (ConvertTo-NormalizedId $Actual) -eq (ConvertTo-NormalizedId $Expected)
}

function Test-EmptyId {
    # True for a missing id: null, empty or the all-zero GUID.
    param([string] $Id)
    return [string]::IsNullOrWhiteSpace($Id) -or (ConvertTo-NormalizedId $Id) -eq [guid]::Empty.ToString()
}

function ConvertTo-CanonicalJson {
    # JSON text with object keys sorted at every level and no whitespace, so two documents that differ
    # only in key order or spacing give the same string. Invalid or empty JSON gives $null.
    param([string] $Json)
    if ([string]::IsNullOrWhiteSpace($Json)) { return $null }
    try { $value = $Json | ConvertFrom-Json -AsHashtable -NoEnumerate } catch { return $null }
    return ConvertTo-SortedValue $value | ConvertTo-Json -Compress -Depth 20
}

function ConvertTo-SortedValue {
    param($Value)
    if ($Value -is [System.Collections.IDictionary]) {
        $sorted = [ordered]@{}
        foreach ($key in ($Value.Keys | Sort-Object -CaseSensitive)) { $sorted[$key] = ConvertTo-SortedValue $Value[$key] }
        return $sorted
    }
    if ($Value -is [System.Collections.IList]) {
        return , @($Value | ForEach-Object { ConvertTo-SortedValue $_ })
    }
    return $Value
}

#endregion

#region Packages and manifests

function Read-SppkgInfo {
    <#
    .SYNOPSIS
        Reads the solution id, name, version and component ids from a .sppkg file.
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
        $name = $app.GetAttribute('Name')
        $version = $app.GetAttribute('Version')
        if (-not $productId -or -not $version -or -not $name) { throw "AppManifest.xml in $Path has no ProductID, Name or Version." }

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
        Name         = $name
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
    param([Parameter(Mandatory)] [AllowEmptyCollection()] [string[]] $ComponentIds)

    if (-not $ComponentIds.Count) { return [string[]] @() }
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

function Wait-OrpheusManifests {
    # Polls Get-MissingManifests every $script:PollIntervalSeconds until nothing is missing or
    # $TimeoutSeconds pass, and returns the ids still missing then. It does not throw: the caller
    # decides. A healthy package returns on the first call.
    param(
        [Parameter(Mandatory)] [string[]] $ComponentIds,
        [Parameter(Mandatory)] [int] $TimeoutSeconds
    )
    $clock = [System.Diagnostics.Stopwatch]::StartNew()
    while ($true) {
        $missing = @(Get-MissingManifests -ComponentIds $ComponentIds)
        if (-not $missing.Count -or $clock.Elapsed.TotalSeconds -ge $TimeoutSeconds) { return [string[]] $missing }
        Start-Sleep -Seconds $script:PollIntervalSeconds
    }
}

function Test-OrpheusShouldProcess {
    # $Cmdlet.ShouldProcess behind a function, so the tests can decline one step.
    param([Parameter(Mandatory)] $Cmdlet, [Parameter(Mandatory)] [string] $Target, [Parameter(Mandatory)] [string] $Action)
    return $Cmdlet.ShouldProcess($Target, $Action)
}

function Resolve-StepResult {
    # 'Skipped' when a needed write was declined under -Confirm, otherwise the result.
    param([Parameter(Mandatory)] [string] $Result, [bool] $Declined)
    if ($Declined) { return 'Skipped' }
    return $Result
}

function Get-OrpheusApp {
    # The site collection App Catalog entry for a solution, or $null. Get-PnPApp's Id is the catalog
    # list item's id, not the package ProductID (found live), so match on the solution name, which the
    # catalog shows as Title. Every later Install/Update/Uninstall/Remove uses the entry's own Id.
    # Get-PnPApp -Identity throws for a missing app, so list the catalog and filter.
    param([Parameter(Mandatory)] [string] $Name)
    return @(Get-PnPApp -Scope Site) | Where-Object { $null -ne $_ -and [string] $_.Title -eq $Name } | Select-Object -First 1
}

function Test-AppInstalled {
    # True when the app is installed at the version in the catalog.
    param($App)
    return $null -ne $App -and -not [string]::IsNullOrEmpty([string] $App.InstalledVersion) -and
        ([string] $App.InstalledVersion) -eq ([string] $App.AppCatalogVersion)
}

function Test-SameVersion {
    # True when two version strings name the same version ('1.0.1.0' and '1.0.1' included). Empty never matches.
    param([string] $Left, [string] $Right)
    if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) { return $false }
    return ([version] $Left) -eq ([version] $Right)
}

function Install-OrpheusSolution {
    <#
    .SYNOPSIS
        Installs or updates one .sppkg in the site collection App Catalog and checks its manifests.
    .DESCRIPTION
        The installed and catalog versions are read with Get-PnPApp and the package version from the
        file, before anything is written.
        1. When the installed and catalog versions both equal the package version, nothing is
           uploaded (unless -ForceUpload, for a same-version rebuild whose content changed). Otherwise
           the package is uploaded (Add-PnPApp -Scope Site -Publish -Overwrite), then installed when
           it is not installed, or updated when the installed version differs from the catalog one.
        2. After an install or update it waits until the installed version matches the catalog one.
        3. It checks the client-side manifests, polling for up to $script:ManifestSettleSeconds (60 s)
           because activation can lag the install. When one stays empty, it does a clean reinstall
           behind its own ShouldProcess: uninstall, wait, remove from the catalog, upload, install,
           wait, and polls again. It throws with the component ids when a manifest is still empty,
           or when the reinstall is declined.
        It throws before any write when the package has no component entries, or when the installed
        or catalog version is newer than the package (a downgrade).
        Remove-PnPApp removes the package from the site collection App Catalog, so a clean reinstall
        also breaks the app on any other web of the site collection where it is installed.
        With -WhatIf it only reads the catalog and the manifests and returns the planned action. When
        the upload is declined under -Confirm, it writes nothing and returns 'Skipped'.
    .PARAMETER ForceUpload
        Upload and publish the package even when the site already has this version.
    .OUTPUTS
        [pscustomobject] with Title, Version and Action ('Unchanged', 'Installed', 'Updated',
        'Uploaded', 'Reinstalled' or 'Skipped').
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)] [string] $Path,
        [ValidateRange(1, 86400)] [int] $TimeoutSeconds = 300,
        [switch] $ForceUpload
    )

    $info = Read-SppkgInfo -Path $Path
    if (-not $info.ComponentIds.Count) { throw "$Path`: no WebPart_/Extension_ component entries found, so the manifests cannot be checked." }
    $id = $info.SolutionId
    $app = Get-OrpheusApp -Name $info.Name
    $title = if ($app) { [string] $app.Title } else { [System.IO.Path]::GetFileNameWithoutExtension($Path) }
    if ($app) {
        foreach ($existing in @([string] $app.InstalledVersion, [string] $app.AppCatalogVersion)) {
            if ($existing -and [version] $existing -gt [version] $info.Version) {
                throw "$title ($id): version $existing in the site is newer than the package $($info.Version). Refusing to downgrade; build the current package."
            }
        }
    }

    # The plan, from versions read before any write.
    $installed = $null -ne $app -and -not [string]::IsNullOrEmpty([string] $app.InstalledVersion)
    $upToDate = $installed -and (Test-SameVersion ([string] $app.InstalledVersion) $info.Version) -and
        (Test-SameVersion ([string] $app.AppCatalogVersion) $info.Version)
    $upload = -not $upToDate -or $ForceUpload
    $action = if (-not $installed) { 'Installed' }
    elseif (-not (Test-SameVersion ([string] $app.InstalledVersion) $info.Version)) { 'Updated' }
    elseif ($ForceUpload) { 'Uploaded' }
    else { 'Unchanged' }
    # Under -WhatIf the manifests are checked once here (a read-only POST), so the plan shows a reinstall.
    if ($WhatIfPreference -and $installed -and $action -in 'Unchanged', 'Uploaded' -and @(Get-MissingManifests -ComponentIds $info.ComponentIds).Count) { $action = 'Reinstalled' }
    $result = [pscustomobject]@{ Title = $title; Version = $info.Version; Action = $action }

    $waitInstalled = {
        Wait-OrpheusCondition -Description "$title to be installed at the catalog version" -TimeoutSeconds $TimeoutSeconds -Condition {
            Test-AppInstalled (Get-OrpheusApp -Name $info.Name)
        }
    }

    if ($upload) {
        $verb = @{ Installed = 'install'; Updated = 'update to'; Uploaded = 'keep (same version)'; Unchanged = 'keep'; Reinstalled = 'reinstall' }[$action]
        if (-not (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "$title $($info.Version) ($id)" -Action "Upload to the site collection App Catalog and $verb")) {
            if (-not $WhatIfPreference) { $result.Action = 'Skipped' }
            return $result
        }

        $null = Add-PnPApp -Path $Path -Scope Site -Publish -Overwrite
        $app = Get-OrpheusApp -Name $info.Name
        if (-not $app) { throw "$title ($id) is not in the site collection App Catalog after the upload." }
        if ($app.Title) { $result.Title = $title = [string] $app.Title }

        if ([string]::IsNullOrEmpty([string] $app.InstalledVersion)) {
            $null = Install-PnPApp -Identity ([guid] $app.Id) -Scope Site
            $result.Action = 'Installed'
        }
        elseif ([string] $app.InstalledVersion -ne [string] $app.AppCatalogVersion) {
            $null = Update-PnPApp -Identity ([guid] $app.Id) -Scope Site
            $result.Action = 'Updated'
        }
        else {
            $result.Action = 'Uploaded'
        }
        & $waitInstalled
    }
    elseif ($WhatIfPreference) {
        # Nothing to upload: the plan is complete, and the reinstall gate below would only repeat it.
        return $result
    }
    else {
        $result.Action = 'Unchanged'
    }

    $missing = @(Wait-OrpheusManifests -ComponentIds $info.ComponentIds -TimeoutSeconds $script:ManifestSettleSeconds)
    if ($missing.Count) {
        # The live failure: the app reports installed, but a component has no manifest. Only a clean
        # reinstall fixed it. It is the most destructive step, so it asks on its own.
        $reinstallTarget = "$title $($info.Version) ($id)"
        $reinstallAction = "Clean reinstall (no active manifest for $($missing -join ', ')): uninstall, remove from the site collection App Catalog, upload and install"
        if (-not (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target $reinstallTarget -Action $reinstallAction)) {
            throw "$reinstallTarget`: Component manifest missing for $($missing -join ', '); clean reinstall declined."
        }
        Write-Warning "$title`: no active manifest for $($missing -join ', '); reinstalling cleanly."
        $catalogItemId = [guid] (Get-OrpheusApp -Name $info.Name).Id
        $null = Uninstall-PnPApp -Identity $catalogItemId -Scope Site
        Wait-OrpheusCondition -Description "$title to be uninstalled" -TimeoutSeconds $TimeoutSeconds -Condition {
            $current = Get-OrpheusApp -Name $info.Name
            $null -eq $current -or [string]::IsNullOrEmpty([string] $current.InstalledVersion)
        }
        $null = Remove-PnPApp -Identity $catalogItemId -Scope Site -Force
        $null = Add-PnPApp -Path $Path -Scope Site -Publish
        $reuploaded = Get-OrpheusApp -Name $info.Name
        if (-not $reuploaded) { throw "$title ($id) is not in the site collection App Catalog after the re-upload." }
        $null = Install-PnPApp -Identity ([guid] $reuploaded.Id) -Scope Site
        & $waitInstalled
        $result.Action = 'Reinstalled'

        $missing = @(Wait-OrpheusManifests -ComponentIds $info.ComponentIds -TimeoutSeconds $script:ManifestSettleSeconds)
        if ($missing.Count) {
            throw "$title $($info.Version) ($id): no active manifest for component(s) $($missing -join ', ') even after a clean reinstall. Check the package and the App Catalog."
        }
    }
    return $result
}

#endregion

#region Bindings

function Set-OrpheusAppCustomizer {
    <#
    .SYNOPSIS
        Registers the OrpheusChrome header and footer custom action on the web, exactly once.
    .DESCRIPTION
        Reads the web's custom actions through GET /_api/web/UserCustomActions and keeps those whose
        ClientSideComponentId is the app customizer. With none it adds one. With more than one it keeps
        the first and removes the rest. When the kept action's properties differ from -PropertiesJson
        (compared as parsed JSON) it updates them in place with a REST MERGE.
    .OUTPUTS
        'Unchanged', 'Added', 'Updated' or 'Deduplicated' (duplicates removed, and the kept action
        updated when needed). 'Skipped' when a needed write was declined under -Confirm.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([string])]
    param([ValidateNotNullOrEmpty()] [string] $PropertiesJson = $script:ChromeProperties)

    if ($null -eq (ConvertTo-CanonicalJson $PropertiesJson)) { throw "-PropertiesJson is not valid JSON: $PropertiesJson" }

    $actions = @(@((Invoke-OrpheusRest -Url '/_api/web/UserCustomActions').value) |
            Where-Object { $null -ne $_ -and (Test-SameId ([string] $_.ClientSideComponentId) $script:AppCustomizerId) })

    $declined = $false
    if ($actions.Count -eq 0) {
        if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "web custom action $script:ChromeName" -Action 'Add the header and footer application customizer') {
            $null = Add-PnPCustomAction -Name $script:ChromeName -Title $script:ChromeTitle -Location $script:ChromeLocation `
                -ClientSideComponentId ([guid] $script:AppCustomizerId) -ClientSideComponentProperties $PropertiesJson -Scope Web
        }
        elseif (-not $WhatIfPreference) { $declined = $true }
        return (Resolve-StepResult -Result 'Added' -Declined $declined)
    }

    $result = 'Unchanged'
    $kept = $actions[0]
    foreach ($duplicate in @($actions | Select-Object -Skip 1)) {
        if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "web custom action $($duplicate.Name) ($($duplicate.Id))" -Action "Remove the duplicate (keeping $($kept.Id))") {
            $null = Remove-PnPCustomAction -Identity ([guid] $duplicate.Id) -Scope Web -Force
        }
        elseif (-not $WhatIfPreference) { $declined = $true }
        $result = 'Deduplicated'
    }

    if ((ConvertTo-CanonicalJson ([string] $kept.ClientSideComponentProperties)) -ne (ConvertTo-CanonicalJson $PropertiesJson)) {
        if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "web custom action $($kept.Name) ($($kept.Id))" -Action "Set ClientSideComponentProperties to $PropertiesJson") {
            # Invoke-PnPSPRestMethod -Method Merge sends the MERGE that SharePoint REST expects for an update.
            $null = Invoke-OrpheusRest -Method Merge -Url "/_api/web/UserCustomActions('$($kept.Id)')" -Body @{ ClientSideComponentProperties = $PropertiesJson }
        }
        elseif (-not $WhatIfPreference) { $declined = $true }
        if ($result -eq 'Unchanged') { $result = 'Updated' }
    }
    return (Resolve-StepResult -Result $result -Declined $declined)
}

function Set-OrpheusFieldCustomizer {
    <#
    .SYNOPSIS
        Binds the field customizer to Contracts.RemainingDays and shows the column in the default view.
    .OUTPUTS
        'Added' when the field had no customizer, 'Updated' when it had another one or the default view
        lacked the column, otherwise 'Unchanged'.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([string])]
    param()

    $list = "/_api/web/lists/getbytitle('$script:ContractsListTitle')"
    # Read through PnP: live, the REST $select of ClientSideComponentId on the list field came back empty
    # although the field was bound, so every run re-bound it.
    $field = Get-PnPField -List $script:ContractsListTitle -Identity $script:RemainingDaysField
    if (-not $field) { throw "$script:ContractsListTitle has no $script:RemainingDaysField column; run the list provisioning first." }
    $current = [string] $field.ClientSideComponentId
    $result = 'Unchanged'
    $declined = $false

    if (-not (Test-SameId $current $script:FieldCustomizerId)) {
        $result = if (Test-EmptyId $current) { 'Added' } else { 'Updated' }
        if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "$script:ContractsListTitle.$script:RemainingDaysField" -Action "Set ClientSideComponentId to $script:FieldCustomizerId") {
            $null = Set-PnPField -List $script:ContractsListTitle -Identity $script:RemainingDaysField -Values @{ ClientSideComponentId = [guid] $script:FieldCustomizerId }
        }
        elseif (-not $WhatIfPreference) { $declined = $true }
    }

    $viewFields = @((Invoke-OrpheusRest -Url "$list/DefaultView/ViewFields").Items)
    if ($viewFields -notcontains $script:RemainingDaysField) {
        if ($result -eq 'Unchanged') { $result = 'Updated' }
        if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "$script:ContractsListTitle default view" -Action "Add the $script:RemainingDaysField column") {
            $null = Invoke-OrpheusRest -Method Post -Url "$list/DefaultView/ViewFields/addviewfield('$script:RemainingDaysField')"
        }
        elseif (-not $WhatIfPreference) { $declined = $true }
    }
    return (Resolve-StepResult -Result $result -Declined $declined)
}

function Set-OrpheusFormCustomizer {
    <#
    .SYNOPSIS
        Binds the form customizer to the New, Edit and Display forms of the Contracts list's
        Orpheus Contract content type.
    .DESCRIPTION
        Reads the three form ids through REST, and writes through CSOM ($ct.Update($false) and
        Invoke-PnPQuery) only when one of them differs.
    .OUTPUTS
        'Added' when none of the three was set, 'Updated' when some differed, otherwise 'Unchanged'.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([string])]
    param()

    $forms = 'NewFormClientSideComponentId', 'EditFormClientSideComponentId', 'DisplayFormClientSideComponentId'
    $url = "/_api/web/lists/getbytitle('$script:ContractsListTitle')/contenttypes?`$select=Name,StringId,$($forms -join ',')"
    $listCt = @(@((Invoke-OrpheusRest -Url $url).value) |
            Where-Object { $null -ne $_ -and ([string] $_.StringId).StartsWith($script:ContractContentTypeId, [System.StringComparison]::OrdinalIgnoreCase) }) |
        Select-Object -First 1
    if (-not $listCt) { throw "The $script:ContractsListTitle list has no Orpheus Contract content type ($script:ContractContentTypeId...): run list provisioning first." }

    $differ = @($forms | Where-Object { -not (Test-SameId ([string] $listCt.$_) $script:FormCustomizerId) })
    if (-not $differ.Count) { return 'Unchanged' }
    $result = if (@($forms | Where-Object { -not (Test-EmptyId ([string] $listCt.$_)) }).Count -eq 0) { 'Added' } else { 'Updated' }

    if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "$script:ContractsListTitle content type $($listCt.Name) ($($listCt.StringId))" -Action "Set $($differ -join ', ') to $script:FormCustomizerId") {
        $ct = Get-PnPContentType -List $script:ContractsListTitle -Identity ([string] $listCt.StringId)
        if (-not $ct) { throw "Content type $($listCt.StringId) not found on the $script:ContractsListTitle list." }
        foreach ($form in $differ) { $ct.$form = $script:FormCustomizerId }
        $null = $ct.Update($false)
        $null = Invoke-PnPQuery
    }
    elseif (-not $WhatIfPreference) { return 'Skipped' }
    return $result
}

#endregion

#region Contract managers group

function Set-OrpheusContractManagersGroup {
    <#
    .SYNOPSIS
        Creates the SharePoint group "Orpheus Contract Managers" with the Contribute permission level.
    .DESCRIPTION
        A group that already exists is left alone. Members are never added or removed: the site owner
        manages membership. Get-PnPGroup may throw for a missing group; a message containing "not found"
        or "does not exist" counts as missing, any other error is rethrown.
    .OUTPUTS
        'Added', 'Unchanged' or 'Skipped'.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([string])]
    param()

    $groupName = 'Orpheus Contract Managers'
    $existing = $null
    try { $existing = Get-PnPGroup -Identity $groupName -ErrorAction Stop }
    catch {
        if ($_.Exception.Message -notmatch 'cannot be found|not found|does not exist') { throw }
    }
    if ($existing) { return 'Unchanged' }

    if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "SharePoint group $groupName" -Action 'Create the group with the Contribute permission level') {
        $null = New-PnPSiteGroup -Name $groupName -PermissionLevels 'Contribute'
    }
    elseif (-not $WhatIfPreference) { return 'Skipped' }
    return 'Added'
}

#endregion

#region Calendar page

function Get-OrpheusCalendarWebPartComponent {
    # The calendar web part from the page's available components. It is passed to Add-PnPPageWebPart
    # as the component object: PnP resolves a bare GUID against ids spelled '{8E7C3D81-...}' and, when
    # nothing matches, silently adds an empty web part (webPartId null), which breaks page editing.
    param([Parameter(Mandatory)] [string] $PageName)
    $component = @(Get-PnPPageComponent -Page $PageName -ListAvailable) |
        Where-Object { $null -ne $_ -and (Test-SameId ([string] $_.Id) $script:WebPartId) } | Select-Object -First 1
    if (-not $component) {
        throw "The contract calendar web part ($script:WebPartId) is not available on this site. Install wp-contract-calendar first."
    }
    return $component
}

function Set-OrpheusCalendarPage {
    <#
    .SYNOPSIS
        Creates the ContractCalendar page with the contract calendar web part wired to the three lists.
    .DESCRIPTION
        The list ids come from Get-PnPList (Lists/Contracts, Lists/CalendarEntries, Lists/Holidays) as
        lowercase GUID strings without braces. It throws when a list is missing.

        A missing page is created (Article layout) with the web part and published. On an existing
        page, the first instance of the web part is kept. When it lacks or has other values for
        contractsListId, entriesListId, holidaysListId or useLocalData (or for a label passed in
        -Labels), those keys are set, the other required keys are added only when missing, every other
        key (for example timesheetTemplateUrl, or a monthsToShow the owner changed) is kept, and the
        page is published. A page without the web part gets it added and is published.
    .PARAMETER Labels
        approvingOrgLabel and serviceProviderLabel. Defaults: 'Client approval' and 'Service provider'.
    .OUTPUTS
        'Created', 'Updated' or 'Unchanged'.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([string])]
    param([hashtable] $Labels = @{})

    $pageName = 'ContractCalendar'
    $labelKeys = 'approvingOrgLabel', 'serviceProviderLabel'
    foreach ($key in $Labels.Keys) {
        if ($key -notin $labelKeys) { throw "Unknown label '$key'. Use $($labelKeys -join ' or ')." }
    }

    # The keys that wire the web part to this site. They are always enforced.
    $wiring = [ordered]@{ useLocalData = $false }
    foreach ($entry in @(
            @{ Key = 'contractsListId'; Url = 'Lists/Contracts' }
            @{ Key = 'entriesListId'; Url = 'Lists/CalendarEntries' }
            @{ Key = 'holidaysListId'; Url = 'Lists/Holidays' })) {
        $list = Get-PnPList -Identity $entry.Url
        if (-not $list) { throw "List $($entry.Url) not found: run list provisioning first." }
        $wiring[$entry.Key] = ConvertTo-NormalizedId ([string] $list.Id)
    }
    foreach ($key in $Labels.Keys) { $wiring[$key] = [string] $Labels[$key] }

    # The other required keys. On an existing web part they are added only when missing.
    $defaults = [ordered]@{
        monthsToShow         = 0
        blockWeekends        = $true
        demoUserId           = 1
        approvingOrgLabel    = 'Client approval'
        serviceProviderLabel = 'Service provider'
    }

    $required = [ordered]@{}
    foreach ($key in $defaults.Keys) { $required[$key] = $defaults[$key] }
    foreach ($key in $wiring.Keys) { $required[$key] = $wiring[$key] }

    $files = @((Invoke-OrpheusRest -Url "/_api/web/getfolderbyserverrelativeurl('SitePages')/files?`$select=Name").value)
    $pageExists = @($files | Where-Object { $null -ne $_ -and [string] $_.Name -eq "$pageName.aspx" }).Count -gt 0

    if (-not $pageExists) {
        if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "SitePages/$pageName.aspx" -Action 'Create the page with the contract calendar web part and publish it') {
            $null = Add-PnPPage -Name $pageName -Title 'Contract calendar' -LayoutType Article
            $component = Get-OrpheusCalendarWebPartComponent -PageName $pageName
            $null = Add-PnPPageWebPart -Page $pageName -Component $component -WebPartProperties ([hashtable] $required)
            $null = Set-PnPPage -Identity $pageName -Publish
        }
        elseif (-not $WhatIfPreference) { return 'Skipped' }
        return 'Created'
    }

    $components = @(Get-PnPPageComponent -Page $pageName | Where-Object { $null -ne $_ })
    # Empty web parts (a web part control with no web part id) are left by an unresolved component;
    # they cannot render and block page editing ("Can't edit this page now"), so they are removed.
    $placeholders = @($components | Where-Object {
            $_.PSObject.Properties['WebPartId'] -and [string]::IsNullOrWhiteSpace([string] $_.WebPartId) -and
            $_.PSObject.Properties['ControlType'] -and [int] $_.ControlType -eq 3
        })
    $removed = $false
    if ($placeholders.Count) {
        if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "SitePages/$pageName.aspx" -Action "Remove $($placeholders.Count) empty web part placeholder(s)") {
            foreach ($placeholder in $placeholders) {
                $null = Remove-PnPPageComponent -Page $pageName -InstanceId ([guid] $placeholder.InstanceId) -Force
            }
            $removed = $true
        }
        elseif (-not $WhatIfPreference) { return 'Skipped' }
    }

    $instances = @($components | Where-Object {
            $_.PSObject.Properties['WebPartId'] -and (Test-SameId ([string] $_.WebPartId) $script:WebPartId)
        })
    if ($instances.Count -eq 0) {
        $component = Get-OrpheusCalendarWebPartComponent -PageName $pageName
        if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "SitePages/$pageName.aspx" -Action 'Add the contract calendar web part and publish the page') {
            $null = Add-PnPPageWebPart -Page $pageName -Component $component -WebPartProperties ([hashtable] $required)
            $null = Set-PnPPage -Identity $pageName -Publish
        }
        elseif (-not $WhatIfPreference) { return 'Skipped' }
        return 'Updated'
    }
    if ($instances.Count -gt 1) { Write-Warning "SitePages/$pageName.aspx has $($instances.Count) contract calendar web parts; only the first is checked." }

    $webPart = $instances[0]
    $current = [ordered]@{}
    if (-not [string]::IsNullOrWhiteSpace([string] $webPart.PropertiesJson)) {
        $parsed = [string] $webPart.PropertiesJson | ConvertFrom-Json -AsHashtable
        foreach ($key in $parsed.Keys) { $current[$key] = $parsed[$key] }
    }

    $stale = @($wiring.Keys | Where-Object {
            -not $current.Contains($_) -or $null -eq $current[$_] -or
            $current[$_].GetType() -ne $wiring[$_].GetType() -or $current[$_] -cne $wiring[$_]
        })
    if (-not $stale.Count) {
        if ($removed) {
            $null = Set-PnPPage -Identity $pageName -Publish
            return 'Updated'
        }
        if ($WhatIfPreference -and $placeholders.Count) { return 'Updated' }
        return 'Unchanged'
    }

    foreach ($key in $wiring.Keys) { $current[$key] = $wiring[$key] }
    foreach ($key in $defaults.Keys) { if (-not $current.Contains($key)) { $current[$key] = $defaults[$key] } }
    [string] $json = $current | ConvertTo-Json -Compress -Depth 20

    if (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "SitePages/$pageName.aspx web part $($webPart.InstanceId)" -Action "Set $($stale -join ', ') and publish the page") {
        $null = Set-PnPPageWebPart -Page $pageName -Identity ([guid] $webPart.InstanceId) -PropertiesJson $json
        $null = Set-PnPPage -Identity $pageName -Publish
    }
    elseif (-not $WhatIfPreference) { return 'Skipped' }
    return 'Updated'
}

#endregion

#region Orchestration

function Get-OrpheusPackagePaths {
    <#
    .SYNOPSIS
        Resolves the four .sppkg files, in install order, and throws when one is missing.
    .DESCRIPTION
        For each package it looks for <SolutionsPath>/packages/<name>/sharepoint/solution/<name>.sppkg
        (a repository checkout, the default) and then for <SolutionsPath>/<name>.sppkg (a flat folder,
        such as the files of a GitHub Release). It reads nothing from SharePoint.
    .OUTPUTS
        [pscustomobject] with Name and Path, one per package.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param([ValidateNotNullOrEmpty()] [string] $SolutionsPath = $script:RepoRoot)

    $root = [System.IO.Path]::GetFullPath($SolutionsPath)
    $found = foreach ($name in $script:PackageNames) {
        $candidates = @(
            (Join-Path $root 'packages' $name 'sharepoint' 'solution' "$name.sppkg"),
            (Join-Path $root "$name.sppkg")
        )
        $path = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
        [pscustomobject]@{ Name = $name; Path = $path }
    }
    # A script block, not "ForEach-Object Name": the member form honours -WhatIf and would skip.
    $missing = @($found | Where-Object { -not $_.Path } | ForEach-Object { $_.Name })
    if ($missing.Count) {
        throw "Solution package(s) not found: $($missing -join ', '). Looked in $root\packages\<name>\sharepoint\solution and in $root. Build them with .\scripts\podman.ps1 package, or pass -SolutionsPath."
    }
    return $found
}

function Assert-OrpheusSiteAppCatalog {
    <#
    .SYNOPSIS
        Checks, read-only, that the connected site has a usable site collection App Catalog.
    .DESCRIPTION
        Reads the catalog with Get-PnPApp -Scope Site. When that fails, it looks for the catalog's
        library (an "Apps for SharePoint" list, BaseTemplate 336) on the site collection's root web.
        Only when that library is missing, or the check cannot run and the error mentions the app
        catalog, does it report a missing catalog with the admin commands. Any other failure, such as
        a 403 or throttling, is reported as it is.
    #>
    [CmdletBinding()]
    param()

    try { $null = Get-PnPApp -Scope Site; return }
    catch { $probeError = $_.Exception.Message }

    $libraryExists = try {
        @((Invoke-OrpheusRest -Url '/_api/site/rootweb/lists?$filter=BaseTemplate eq 336&$select=Id').value).Count -gt 0
    }
    catch { $null }

    if ($libraryExists -eq $false -or ($null -eq $libraryExists -and $probeError -match 'app ?catalog')) {
        throw ("This site has no site collection App Catalog ($probeError). A SharePoint administrator must first make sure " +
            'the tenant App Catalog exists (Register-PnPAppCatalogSite), then, connected to the SharePoint admin center, run ' +
            'Add-PnPSiteCollectionAppCatalog -Site <site url>. See docs/deployment.md.')
    }
    throw "Could not read the site collection App Catalog: $probeError"
}

function Invoke-OrpheusSolutionInstall {
    <#
    .SYNOPSIS
        Installs the four Orpheus solutions on the connected site and wires them up, in order.
    .DESCRIPTION
        1. Resolves the four packages (Get-OrpheusPackagePaths). A missing one throws before any call
           to SharePoint.
        2. Checks that the site has a site collection App Catalog (read-only).
        3. Install-OrpheusSolution for wp-contract-calendar, ext-app-customizer, ext-field-customizer
           and ext-form-customizer.
        4. Set-OrpheusAppCustomizer, Set-OrpheusFieldCustomizer, Set-OrpheusFormCustomizer,
           Set-OrpheusContractManagersGroup, Set-OrpheusCalendarPage.
        -WhatIf and -Confirm are passed on explicitly to every step. The first error stops the run,
        after a row 'Failed: <message>' for the step that failed.
    .PARAMETER ForceUpload
        Upload the packages even when the site already has their versions (same-version rebuilds).
    .OUTPUTS
        [pscustomobject] with Component and Action, one per step, for a summary table.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([pscustomobject])]
    param(
        [ValidateNotNullOrEmpty()] [string] $SolutionsPath = $script:RepoRoot,
        [hashtable] $Labels = @{},
        [ValidateRange(1, 86400)] [int] $TimeoutSeconds = 300,
        [switch] $ForceUpload
    )

    $packages = Get-OrpheusPackagePaths -SolutionsPath $SolutionsPath

    # Preference variables do not reach other commands reliably, so pass the switches explicitly.
    $gate = @{ WhatIf = [bool] $WhatIfPreference }
    if ($PSBoundParameters.ContainsKey('Confirm')) { $gate.Confirm = [bool] $PSBoundParameters['Confirm'] }

    Assert-OrpheusSiteAppCatalog

    foreach ($package in $packages) {
        Invoke-OrpheusStep -Component $package.Name -Step {
            $installed = Install-OrpheusSolution -Path $package.Path -TimeoutSeconds $TimeoutSeconds -ForceUpload:$ForceUpload @gate
            [pscustomobject]@{ Component = "$($package.Name) $($installed.Version)"; Action = [string] $installed.Action }
        }
    }

    Invoke-OrpheusStep -Component "Header custom action ($script:ChromeName)" -Step { Set-OrpheusAppCustomizer @gate }
    Invoke-OrpheusStep -Component "Field customizer ($script:ContractsListTitle.$script:RemainingDaysField)" -Step { Set-OrpheusFieldCustomizer @gate }
    Invoke-OrpheusStep -Component 'Form customizer (Orpheus Contract)' -Step { Set-OrpheusFormCustomizer @gate }
    Invoke-OrpheusStep -Component 'Contract managers group (Orpheus Contract Managers)' -Step { Set-OrpheusContractManagersGroup @gate }
    Invoke-OrpheusStep -Component 'Calendar page (SitePages/ContractCalendar.aspx)' -Step { Set-OrpheusCalendarPage -Labels $Labels @gate }
}

function Invoke-OrpheusStep {
    # Runs one step and emits its summary row. A step returns either an action string or a ready
    # row. When it throws, it emits a 'Failed: <message>' row and rethrows, so the summary shows
    # where the run stopped.
    param([Parameter(Mandatory)] [string] $Component, [Parameter(Mandatory)] [scriptblock] $Step)
    Write-Host "  $Component ..." -ForegroundColor Cyan
    try { $output = & $Step }
    catch {
        [pscustomobject]@{ Component = $Component; Action = "Failed: $($_.Exception.Message)" }
        throw
    }
    if ($output -is [string]) { return [pscustomobject]@{ Component = $Component; Action = $output } }
    return $output
}

#endregion

Export-ModuleMember -Function Read-SppkgInfo, Get-MissingManifests, Install-OrpheusSolution,
    Set-OrpheusAppCustomizer, Set-OrpheusFieldCustomizer, Set-OrpheusFormCustomizer, Set-OrpheusContractManagersGroup, Set-OrpheusCalendarPage,
    Get-OrpheusPackagePaths, Assert-OrpheusSiteAppCatalog, Invoke-OrpheusSolutionInstall
