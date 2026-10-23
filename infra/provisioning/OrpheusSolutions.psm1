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
        4. Checks the client-side manifests, polling for up to $script:ManifestSettleSeconds (60 s)
           because activation can lag the install. When one stays empty, it does a clean reinstall
           behind its own ShouldProcess: uninstall, wait, remove from the catalog, upload, install,
           wait, and polls again. It throws with the component ids when a manifest is still empty,
           or when the reinstall is declined.
        It throws before any upload when the package has no component entries, or when the installed
        or catalog version is newer than the package (a downgrade).
        Remove-PnPApp removes the package from the site collection App Catalog, so a clean reinstall
        also breaks the app on any other web of the site collection where it is installed.
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
    if (-not $info.ComponentIds.Count) { throw "$Path`: no WebPart_/Extension_ component entries found, so the manifests cannot be checked." }
    $id = $info.SolutionId
    $app = Get-OrpheusApp -SolutionId $id
    $title = if ($app) { [string] $app.Title } else { [System.IO.Path]::GetFileNameWithoutExtension($Path) }
    if ($app) {
        foreach ($existing in @([string] $app.InstalledVersion, [string] $app.AppCatalogVersion)) {
            if ($existing -and [version] $existing -gt [version] $info.Version) {
                throw "$title ($id): version $existing in the site is newer than the package $($info.Version). Refusing to downgrade; build the current package."
            }
        }
    }

    # The plan from the current state. The catalog copy is replaced by the upload, so an installed
    # app counts as current when its installed version equals the package version.
    $installed = $null -ne $app -and -not [string]::IsNullOrEmpty([string] $app.InstalledVersion)
    $action = if (-not $installed) { 'Installed' } elseif ([string] $app.InstalledVersion -ne $info.Version) { 'Updated' } else { 'Unchanged' }
    # Under -WhatIf the manifests are checked here (a read-only POST) so the plan shows a reinstall.
    # A real run checks them after the upload instead.
    if ($WhatIfPreference -and $action -eq 'Unchanged' -and @(Get-MissingManifests -ComponentIds $info.ComponentIds).Count) { $action = 'Reinstalled' }
    $result = [pscustomobject]@{ Title = $title; Version = $info.Version; Action = $action }

    $verb = @{ Installed = 'install'; Updated = 'update to'; Unchanged = 'keep'; Reinstalled = 'reinstall' }[$action]
    if (-not (Test-OrpheusShouldProcess -Cmdlet $PSCmdlet -Target "$title $($info.Version) ($id)" -Action "Upload to the site collection App Catalog and $verb")) {
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
        updated when needed).
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([string])]
    param([ValidateNotNullOrEmpty()] [string] $PropertiesJson = $script:ChromeProperties)

    if ($null -eq (ConvertTo-CanonicalJson $PropertiesJson)) { throw "-PropertiesJson is not valid JSON: $PropertiesJson" }

    $actions = @(@((Invoke-OrpheusRest -Url '/_api/web/UserCustomActions').value) |
            Where-Object { $null -ne $_ -and (Test-SameId ([string] $_.ClientSideComponentId) $script:AppCustomizerId) })

    if ($actions.Count -eq 0) {
        if ($PSCmdlet.ShouldProcess("web custom action $script:ChromeName", 'Add the header and footer application customizer')) {
            $null = Add-PnPCustomAction -Name $script:ChromeName -Title $script:ChromeTitle -Location $script:ChromeLocation `
                -ClientSideComponentId ([guid] $script:AppCustomizerId) -ClientSideComponentProperties $PropertiesJson -Scope Web
        }
        return 'Added'
    }

    $result = 'Unchanged'
    $kept = $actions[0]
    foreach ($duplicate in @($actions | Select-Object -Skip 1)) {
        if ($PSCmdlet.ShouldProcess("web custom action $($duplicate.Name) ($($duplicate.Id))", "Remove the duplicate (keeping $($kept.Id))")) {
            Remove-PnPCustomAction -Identity ([guid] $duplicate.Id) -Scope Web -Force
        }
        $result = 'Deduplicated'
    }

    if ((ConvertTo-CanonicalJson ([string] $kept.ClientSideComponentProperties)) -ne (ConvertTo-CanonicalJson $PropertiesJson)) {
        if ($PSCmdlet.ShouldProcess("web custom action $($kept.Name) ($($kept.Id))", "Set ClientSideComponentProperties to $PropertiesJson")) {
            # Invoke-PnPSPRestMethod -Method Merge sends the MERGE that SharePoint REST expects for an update.
            $null = Invoke-OrpheusRest -Method Merge -Url "/_api/web/UserCustomActions('$($kept.Id)')" -Body @{ ClientSideComponentProperties = $PropertiesJson }
        }
        if ($result -eq 'Unchanged') { $result = 'Updated' }
    }
    return $result
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
    $field = Invoke-OrpheusRest -Url "$list/fields/getbyinternalnameortitle('$script:RemainingDaysField')?`$select=ClientSideComponentId"
    $current = [string] $field.ClientSideComponentId
    $result = 'Unchanged'

    if (-not (Test-SameId $current $script:FieldCustomizerId)) {
        $result = if (Test-EmptyId $current) { 'Added' } else { 'Updated' }
        if ($PSCmdlet.ShouldProcess("$script:ContractsListTitle.$script:RemainingDaysField", "Set ClientSideComponentId to $script:FieldCustomizerId")) {
            Set-PnPField -List $script:ContractsListTitle -Identity $script:RemainingDaysField -Values @{ ClientSideComponentId = [guid] $script:FieldCustomizerId }
        }
    }

    $viewFields = @((Invoke-OrpheusRest -Url "$list/DefaultView/ViewFields").Items)
    if ($viewFields -notcontains $script:RemainingDaysField) {
        if ($result -eq 'Unchanged') { $result = 'Updated' }
        if ($PSCmdlet.ShouldProcess("$script:ContractsListTitle default view", "Add the $script:RemainingDaysField column")) {
            $null = Invoke-OrpheusRest -Method Post -Url "$list/DefaultView/ViewFields/addviewfield('$script:RemainingDaysField')"
        }
    }
    return $result
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

    if ($PSCmdlet.ShouldProcess("$script:ContractsListTitle content type $($listCt.Name) ($($listCt.StringId))", "Set $($differ -join ', ') to $script:FormCustomizerId")) {
        $ct = Get-PnPContentType -List $script:ContractsListTitle -Identity ([string] $listCt.StringId)
        if (-not $ct) { throw "Content type $($listCt.StringId) not found on the $script:ContractsListTitle list." }
        foreach ($form in $differ) { $ct.$form = $script:FormCustomizerId }
        $ct.Update($false)
        Invoke-PnPQuery
    }
    return $result
}

#endregion

#region Calendar page

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
        if ($PSCmdlet.ShouldProcess("SitePages/$pageName.aspx", 'Create the page with the contract calendar web part and publish it')) {
            $null = Add-PnPPage -Name $pageName -Title 'Contract calendar' -LayoutType Article
            $null = Add-PnPPageWebPart -Page $pageName -Component $script:WebPartId -WebPartProperties ([hashtable] $required)
            $null = Set-PnPPage -Identity $pageName -Publish
        }
        return 'Created'
    }

    $instances = @(Get-PnPPageComponent -Page $pageName | Where-Object {
            $null -ne $_ -and $_.PSObject.Properties['WebPartId'] -and (Test-SameId ([string] $_.WebPartId) $script:WebPartId)
        })
    if ($instances.Count -eq 0) {
        if ($PSCmdlet.ShouldProcess("SitePages/$pageName.aspx", 'Add the contract calendar web part and publish the page')) {
            $null = Add-PnPPageWebPart -Page $pageName -Component $script:WebPartId -WebPartProperties ([hashtable] $required)
            $null = Set-PnPPage -Identity $pageName -Publish
        }
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
    if (-not $stale.Count) { return 'Unchanged' }

    foreach ($key in $wiring.Keys) { $current[$key] = $wiring[$key] }
    foreach ($key in $defaults.Keys) { if (-not $current.Contains($key)) { $current[$key] = $defaults[$key] } }
    [string] $json = $current | ConvertTo-Json -Compress -Depth 20

    if ($PSCmdlet.ShouldProcess("SitePages/$pageName.aspx web part $($webPart.InstanceId)", "Set $($stale -join ', ') and publish the page")) {
        $null = Set-PnPPageWebPart -Page $pageName -Identity ([guid] $webPart.InstanceId) -PropertiesJson $json
        $null = Set-PnPPage -Identity $pageName -Publish
    }
    return 'Updated'
}

#endregion

Export-ModuleMember -Function Read-SppkgInfo, Get-MissingManifests, Install-OrpheusSolution,
    Set-OrpheusAppCustomizer, Set-OrpheusFieldCustomizer, Set-OrpheusFormCustomizer, Set-OrpheusCalendarPage
