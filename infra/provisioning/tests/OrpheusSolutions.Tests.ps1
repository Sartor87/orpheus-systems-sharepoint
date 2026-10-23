#Requires -Version 7.4
#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }

<#
.SYNOPSIS
    Pester tests for OrpheusSolutions.psm1 (no tenant).

.DESCRIPTION
    PnP.PowerShell is imported only so the mocks get the real parameter sets. Every PnP cmdlet the
    module names is mocked to throw by default (see New-PnPSafetyNet), and each test then mocks the
    calls it expects. Nothing can reach a tenant: there is no connection, and no unmocked PnP cmdlet
    runs.

    Run from the repository root:
        pwsh -NoProfile -Command "Import-Module Pester -MinimumVersion 5; Invoke-Pester infra/provisioning/tests/OrpheusSolutions.Tests.ps1 -Output Detailed"
#>

BeforeAll {
    Set-StrictMode -Version 1.0
    $ErrorActionPreference = 'Stop'

    Import-Module PnP.PowerShell -ErrorAction Stop
    $ModulePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..' 'OrpheusSolutions.psm1'))
    Import-Module $ModulePath -Force -ErrorAction Stop

    $script:SiteUrl = 'https://example.invalid/sites/test'
    $script:AppCustomizerId = '30930118-2d09-49f4-bdc4-fb2c9b4af49e'
    $script:FieldCustomizerId = 'a7721b49-8c3e-48c7-ac67-69408fcc6a03'
    $script:FormCustomizerId = '9ec4e23b-5adb-4be5-af3a-85f46fa4fc27'
    $script:WebPartId = '8e7c3d81-db98-46c9-993e-d4c26928926f'

    # Every PnP cmdlet the module names, so an unexpected call fails the test instead of running.
    $source = Get-Content -LiteralPath $ModulePath -Raw
    $script:PnPCommands = @([regex]::Matches($source, '\b[A-Z][a-z]+-PnP[A-Za-z]+\b') | ForEach-Object Value | Sort-Object -Unique)

    function New-Sppkg {
        # Builds a minimal .sppkg (a zip) with an AppManifest.xml and the given component entries.
        param(
            [Parameter(Mandatory)] [string] $Path,
            [Parameter(Mandatory)] [string] $ProductId,
            [Parameter(Mandatory)] [string] $Version,
            [string[]] $Entries = @(),
            [string] $Name = 'test-client-side-solution'
        )
        Add-Type -AssemblyName System.IO.Compression
        $stream = [System.IO.File]::Create($Path)
        $zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
        try {
            $manifest = "<?xml version=`"1.0`" encoding=`"utf-8`"?><App xmlns=`"http://schemas.microsoft.com/sharepoint/2012/app/manifest`" Name=`"$Name`" ProductID=`"$ProductId`" Version=`"$Version`" IsClientSideSolution=`"true`"><Properties><Title>Test</Title></Properties></App>"
            foreach ($name in @('AppManifest.xml') + $Entries) {
                $writer = [System.IO.StreamWriter]::new($zip.CreateEntry($name).Open())
                try { $writer.Write($(if ($name -eq 'AppManifest.xml') { $manifest } else { '<Elements />' })) } finally { $writer.Dispose() }
            }
        }
        finally {
            $zip.Dispose()
            $stream.Dispose()
        }
        return $Path
    }

    function New-ComponentsResponse {
        # The shape of POST /_api/web/GetClientSideComponentsById: ids upper case in braces.
        param([hashtable] $Manifests)
        [pscustomobject]@{
            value = @($Manifests.Keys | ForEach-Object {
                    [pscustomobject]@{ Id = "{$($_.ToUpperInvariant())}"; Manifest = $Manifests[$_]; Status = 0 }
                })
        }
    }
    # The value a PnP pipe bind was built from (its private field), e.g. Get-BindValue $Identity '_id'.
    function New-AvailableComponent {
        # A real PnP.Core PageComponent, as Get-PnPPageComponent -ListAvailable returns it. SharePoint
        # spells the id with braces in upper case, which is why resolving by a bare GUID failed live.
        param([string] $Id, [string] $Name)
        $type = [AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq 'PnP.Core' } |
            ForEach-Object { $_.GetType('PnP.Core.Model.SharePoint.PageComponent') } | Where-Object { $_ } | Select-Object -First 1
        $component = [Activator]::CreateInstance($type)
        $component.Id = $Id
        $component.Name = $Name
        return $component
    }

    function Get-BindValue {
        param($Bind, [string] $Field)
        return $Bind.GetType().GetField($Field, [System.Reflection.BindingFlags] 'NonPublic, Instance').GetValue($Bind)
    }

    # Mocks every PnP cmdlet the module names to throw. Call it in BeforeEach, before the specific mocks.
    function New-PnPSafetyNet {
        foreach ($name in $script:PnPCommands) {
            Mock -ModuleName OrpheusSolutions -CommandName $name -MockWith ([scriptblock]::Create("throw 'Unexpected call to $name (not mocked by this test).'"))
        }
    }
}

#region Task 1: package reader and manifest check

Describe 'Read-SppkgInfo' {
    It 'reads the solution id, the version and the component ids' {
        $path = New-Sppkg -Path (Join-Path $TestDrive 'app.sppkg') -ProductId '{8C050D2E-26F4-4A5E-822C-414D9365314F}' -Version '1.0.1.0' `
            -Entries '30930118-2d09-49f4-bdc4-fb2c9b4af49e/Extension_30930118-2d09-49f4-bdc4-fb2c9b4af49e.xml'

        $info = Read-SppkgInfo -Path $path

        $info.SolutionId | Should -BeExactly '8c050d2e-26f4-4a5e-822c-414d9365314f'
        $info.Name | Should -BeExactly 'test-client-side-solution'
        $info.Version | Should -BeExactly '1.0.1.0'
        $info.ComponentIds | Should -BeExactly @('30930118-2d09-49f4-bdc4-fb2c9b4af49e')
    }

    It 'takes a web part id from the file name, not from its feature folder' {
        # The real wp-contract-calendar package stores its web part under the feature id folder.
        $path = New-Sppkg -Path (Join-Path $TestDrive 'wp.sppkg') -ProductId '326f6878-25b8-4117-93fb-ba9882352eaf' -Version '1.0.2.0' `
            -Entries '1200746d-2d50-40ae-9f33-21f153ccec28/WebPart_8E7C3D81-DB98-46C9-993E-D4C26928926F.xml', '_rels/AppManifest.xml.rels'

        $info = Read-SppkgInfo -Path $path

        $info.SolutionId | Should -BeExactly '326f6878-25b8-4117-93fb-ba9882352eaf'
        $info.ComponentIds | Should -BeExactly @('8e7c3d81-db98-46c9-993e-d4c26928926f')
    }

    It 'throws when the file is not a solution package' {
        $path = Join-Path $TestDrive 'missing.sppkg'
        { Read-SppkgInfo -Path $path } | Should -Throw
    }
}

Describe 'Get-MissingManifests' {
    BeforeEach { New-PnPSafetyNet }

    It 'returns the ids whose manifest is empty' {
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -eq '/_api/web/GetClientSideComponentsById' } -MockWith {
            New-ComponentsResponse @{ '30930118-2d09-49f4-bdc4-fb2c9b4af49e' = ''; 'a7721b49-8c3e-48c7-ac67-69408fcc6a03' = '{"id":"a7721b49"}' }
        }

        $missing = Get-MissingManifests -ComponentIds '30930118-2d09-49f4-bdc4-fb2c9b4af49e', 'a7721b49-8c3e-48c7-ac67-69408fcc6a03'

        $missing | Should -BeExactly @('30930118-2d09-49f4-bdc4-fb2c9b4af49e')
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 1 -Exactly -ParameterFilter {
            $Method -eq 'Post' -and (($Content | ConvertFrom-Json).componentIds -join ',') -eq '30930118-2d09-49f4-bdc4-fb2c9b4af49e,a7721b49-8c3e-48c7-ac67-69408fcc6a03'
        }
    }

    It 'returns an id that is absent from the response' {
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -eq '/_api/web/GetClientSideComponentsById' } -MockWith {
            New-ComponentsResponse @{ 'a7721b49-8c3e-48c7-ac67-69408fcc6a03' = '{"id":"a7721b49"}' }
        }

        $missing = Get-MissingManifests -ComponentIds 'A7721B49-8C3E-48C7-AC67-69408FCC6A03', '9ec4e23b-5adb-4be5-af3a-85f46fa4fc27'

        $missing | Should -BeExactly @('9ec4e23b-5adb-4be5-af3a-85f46fa4fc27')
    }

    It 'returns nothing for an empty id list, without a request' {
        $missing = Get-MissingManifests -ComponentIds @()

        @($missing).Count | Should -Be 0
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 0 -Exactly
    }

    It 'returns nothing when every manifest is present' {
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -eq '/_api/web/GetClientSideComponentsById' } -MockWith {
            New-ComponentsResponse @{ '30930118-2d09-49f4-bdc4-fb2c9b4af49e' = '{"id":"30930118"}' }
        }

        @(Get-MissingManifests -ComponentIds '30930118-2d09-49f4-bdc4-fb2c9b4af49e').Count | Should -Be 0
    }
}

#endregion

#region Task 2: install with self-healing reinstall

Describe 'Install-OrpheusSolution' {
    BeforeAll {
        $script:SolutionId = '8c050d2e-26f4-4a5e-822c-414d9365314f'
        $script:Package = New-Sppkg -Path (Join-Path $TestDrive 'ext-app-customizer.sppkg') -ProductId $script:SolutionId -Version '1.0.1.0' -Name 'ext-app-customizer-client-side-solution' `
            -Entries "$script:AppCustomizerId/Extension_$script:AppCustomizerId.xml"
    }

    BeforeEach {
        New-PnPSafetyNet
        & (Get-Module OrpheusSolutions) { $script:PollIntervalSeconds = 0; $script:ManifestSettleSeconds = 1 }

        # A fake site collection App Catalog. Catalog = $null means the app is not in the catalog.
        # Installs and updates finish at once; set $script:Catalog.Stuck to keep InstalledVersion.
        # Live finding: Get-PnPApp's Id is the catalog list item's id, not the package ProductID, and a
        # re-upload after Remove-PnPApp gets a new item id.
        $script:Catalog = @{ Present = $false; AppCatalogVersion = $null; InstalledVersion = $null; Stuck = $false; ItemId = $null; Uploads = 0 }
        $script:Calls = [System.Collections.Generic.List[string]]::new()
        # The fake component manifest. ManifestMode: 'Healthy'; 'BrokenUntilReinstall' (empty until
        # Remove-PnPApp has run, the live failure); 'AlwaysBroken'. LagPolls: the number of calls that
        # still answer empty once the manifest would be present (activation lagging the install).
        $script:ManifestMode = 'Healthy'
        $script:LagPolls = 0
        $script:ManifestCalls = 0

        Mock -ModuleName OrpheusSolutions Get-PnPApp {
            if (-not $script:Catalog.Present) { return }
            if (-not $script:Catalog.ItemId) { $script:Catalog.ItemId = 'c0c0c0c0-0000-4000-8000-0000000000aa' }
            [pscustomobject]@{
                Id                = [guid] $script:Catalog.ItemId
                Title             = 'ext-app-customizer-client-side-solution'
                AppCatalogVersion = $script:Catalog.AppCatalogVersion
                InstalledVersion  = $script:Catalog.InstalledVersion
            }
        }
        Mock -ModuleName OrpheusSolutions Add-PnPApp {
            $script:Calls.Add('Add')
            if (-not $script:Catalog.Present) { $script:Catalog.Uploads++; $script:Catalog.ItemId = 'c0c0c0c0-0000-4000-8000-{0:d12}' -f $script:Catalog.Uploads }
            $script:Catalog.Present = $true
            $script:Catalog.AppCatalogVersion = [version] '1.0.1.0'
        }
        Mock -ModuleName OrpheusSolutions Install-PnPApp {
            if ([string] $Identity.Id -ne $script:Catalog.ItemId) { throw "Install-PnPApp got '$($Identity.Id)', expected the catalog item id '$($script:Catalog.ItemId)'." }
            $script:Calls.Add('Install')
            if (-not $script:Catalog.Stuck) { $script:Catalog.InstalledVersion = $script:Catalog.AppCatalogVersion }
        }
        Mock -ModuleName OrpheusSolutions Update-PnPApp {
            if ([string] $Identity.Id -ne $script:Catalog.ItemId) { throw "Update-PnPApp got '$($Identity.Id)', expected the catalog item id '$($script:Catalog.ItemId)'." }
            $script:Calls.Add('Update')
            if (-not $script:Catalog.Stuck) { $script:Catalog.InstalledVersion = $script:Catalog.AppCatalogVersion }
        }
        Mock -ModuleName OrpheusSolutions Uninstall-PnPApp {
            if ([string] $Identity.Id -ne $script:Catalog.ItemId) { throw "Uninstall-PnPApp got '$($Identity.Id)', expected the catalog item id '$($script:Catalog.ItemId)'." }
            $script:Calls.Add('Uninstall')
            $script:Catalog.InstalledVersion = $null
        }
        Mock -ModuleName OrpheusSolutions Remove-PnPApp {
            if ([string] $Identity.Id -ne $script:Catalog.ItemId) { throw "Remove-PnPApp got '$($Identity.Id)', expected the catalog item id '$($script:Catalog.ItemId)'." }
            $script:Calls.Add('Remove')
            $script:Catalog.Present = $false
            $script:Catalog.AppCatalogVersion = $null
            $script:Catalog.ItemId = $null
        }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -eq '/_api/web/GetClientSideComponentsById' } -MockWith {
            $script:ManifestCalls++
            $empty = $script:ManifestMode -eq 'AlwaysBroken' -or ($script:ManifestMode -eq 'BrokenUntilReinstall' -and -not $script:Calls.Contains('Remove'))
            if (-not $empty -and $script:LagPolls -gt 0) { $script:LagPolls--; $empty = $true }
            $manifest = if ($empty) { '' } else { '{"id":"30930118"}' }
            New-ComponentsResponse @{ $script:AppCustomizerId = $manifest }
        }
    }

    It 'installs a solution that is not in the catalog' {
        $result = Install-OrpheusSolution -Path $script:Package

        $result.Action | Should -BeExactly 'Installed'
        $result.Version | Should -BeExactly '1.0.1.0'
        $result.Title | Should -BeExactly 'ext-app-customizer-client-side-solution'
        $script:Calls -join ',' | Should -BeExactly 'Add,Install'
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPApp -Times 1 -Exactly -ParameterFilter {
            $Scope -eq 'Site' -and $Publish -and $Overwrite -and $Path -eq $script:Package
        }
        Should -Invoke -ModuleName OrpheusSolutions Install-PnPApp -Times 1 -Exactly -ParameterFilter { $Scope -eq 'Site' }
    }

    It 'reports Unchanged when the installed version matches and the manifests are present' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.1.0'
        $script:Catalog.InstalledVersion = [version] '1.0.1.0'

        $result = Install-OrpheusSolution -Path $script:Package

        $result.Action | Should -BeExactly 'Unchanged'
        $script:Calls.Count | Should -Be 0
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPApp -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Install-PnPApp -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Update-PnPApp -Times 0 -Exactly
        $script:ManifestCalls | Should -Be 1
    }

    It 'uploads a same-version package again with -ForceUpload' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.1.0'
        $script:Catalog.InstalledVersion = [version] '1.0.1.0'

        $result = Install-OrpheusSolution -Path $script:Package -ForceUpload

        $result.Action | Should -BeExactly 'Uploaded'
        $script:Calls -join ',' | Should -BeExactly 'Add'
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPApp -Times 1 -Exactly -ParameterFilter { $Overwrite -and $Publish }
    }

    It 'uploads when the catalog holds another version than the package' {
        # Installed at the package version, but the catalog holds another version: upload to align.
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.0.0'
        $script:Catalog.InstalledVersion = [version] '1.0.1.0'

        $null = Install-OrpheusSolution -Path $script:Package

        Should -Invoke -ModuleName OrpheusSolutions Add-PnPApp -Times 1 -Exactly
    }

    It 'reports Skipped and writes nothing when the upload is declined' {
        Mock -ModuleName OrpheusSolutions Test-OrpheusShouldProcess { $false }

        (Install-OrpheusSolution -Path $script:Package).Action | Should -BeExactly 'Skipped'
        $script:Calls.Count | Should -Be 0
    }

    It 'returns a single result with a string Action when the PnP cmdlets emit objects' {
        Mock -ModuleName OrpheusSolutions Install-PnPApp {
            $script:Calls.Add('Install')
            $script:Catalog.InstalledVersion = $script:Catalog.AppCatalogVersion
            [pscustomobject]@{ Id = [guid]::NewGuid(); Status = 'Installed' }
        }

        $result = @(Install-OrpheusSolution -Path $script:Package)

        $result.Count | Should -Be 1
        $result[0].Action | Should -BeOfType [string]
        $result[0].Action | Should -BeExactly 'Installed'
    }

    It 'updates an older installed version' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.0.0'
        $script:Catalog.InstalledVersion = [version] '1.0.0.0'

        $result = Install-OrpheusSolution -Path $script:Package

        $result.Action | Should -BeExactly 'Updated'
        $script:Calls -join ',' | Should -BeExactly 'Add,Update'
    }

    It 'reinstalls cleanly when a manifest stays empty after the update' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.0.0'
        $script:Catalog.InstalledVersion = [version] '1.0.0.0'
        $script:ManifestMode = 'BrokenUntilReinstall'

        $result = Install-OrpheusSolution -Path $script:Package

        $result.Action | Should -BeExactly 'Reinstalled'
        $script:Calls -join ',' | Should -BeExactly 'Add,Update,Uninstall,Remove,Add,Install'
        # The settle poll asked more than once before deciding, and once after the reinstall.
        $script:ManifestCalls | Should -BeGreaterThan 2
    }

    It 'does not reinstall when the manifest is empty right after the update and then appears' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.0.0'
        $script:Catalog.InstalledVersion = [version] '1.0.0.0'
        $script:LagPolls = 1

        $result = Install-OrpheusSolution -Path $script:Package

        $result.Action | Should -BeExactly 'Updated'
        $script:Calls -join ',' | Should -BeExactly 'Add,Update'
        $script:ManifestCalls | Should -Be 2
    }

    It 'does not reinstall an unchanged solution whose manifest is briefly empty' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.1.0'
        $script:Catalog.InstalledVersion = [version] '1.0.1.0'
        $script:LagPolls = 1

        (Install-OrpheusSolution -Path $script:Package).Action | Should -BeExactly 'Unchanged'
        $script:Calls.Count | Should -Be 0
    }

    It 'succeeds when the manifest is empty right after the reinstall and then appears' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.1.0'
        $script:Catalog.InstalledVersion = [version] '1.0.1.0'
        $script:ManifestMode = 'BrokenUntilReinstall'
        $script:LagPolls = 1

        (Install-OrpheusSolution -Path $script:Package).Action | Should -BeExactly 'Reinstalled'
        $script:Calls -join ',' | Should -BeExactly 'Uninstall,Remove,Add,Install'
    }

    It 'throws with the component id when the manifest stays empty through the reinstall' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.1.0'
        $script:Catalog.InstalledVersion = [version] '1.0.1.0'
        $script:ManifestMode = 'AlwaysBroken'

        { Install-OrpheusSolution -Path $script:Package } | Should -Throw "*$script:AppCustomizerId*even after a clean reinstall*"
        $script:Calls -join ',' | Should -BeExactly 'Uninstall,Remove,Add,Install'
        $script:ManifestCalls | Should -BeGreaterThan 2
    }

    It 'asks before the clean reinstall and throws without touching the app when it is declined' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.1.0'
        $script:Catalog.InstalledVersion = [version] '1.0.1.0'
        $script:ManifestMode = 'AlwaysBroken'
        Mock -ModuleName OrpheusSolutions Test-OrpheusShouldProcess -MockWith { $Cmdlet.ShouldProcess($Target, $Action) }
        Mock -ModuleName OrpheusSolutions Test-OrpheusShouldProcess -ParameterFilter { $Action -like 'Clean reinstall*' } -MockWith { $false }

        { Install-OrpheusSolution -Path $script:Package } | Should -Throw "*$script:AppCustomizerId*clean reinstall declined*"
        $script:Calls.Count | Should -Be 0
        Should -Invoke -ModuleName OrpheusSolutions Test-OrpheusShouldProcess -Times 1 -Exactly -ParameterFilter {
            $Action -like 'Clean reinstall*' -and $Target -like "*$script:SolutionId*"
        }
    }

    It 'refuses a package older than the installed version before any upload' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.2.0'
        $script:Catalog.InstalledVersion = [version] '1.0.2.0'

        { Install-OrpheusSolution -Path $script:Package } | Should -Throw '*1.0.2.0*newer than the package 1.0.1.0*'
        $script:Calls.Count | Should -Be 0
    }

    It 'refuses a package without component entries before any upload' {
        $empty = New-Sppkg -Path (Join-Path $TestDrive 'empty.sppkg') -ProductId $script:SolutionId -Version '1.0.1.0'

        { Install-OrpheusSolution -Path $empty } | Should -Throw '*no WebPart_/Extension_ component entries*'
        $script:Calls.Count | Should -Be 0
    }

    It 'throws when an install does not finish within the timeout' {
        $script:Catalog.Stuck = $true

        { Install-OrpheusSolution -Path $script:Package -TimeoutSeconds 1 } | Should -Throw '*Timed out*'
    }

    It 'makes no write call with -WhatIf' {
        $result = Install-OrpheusSolution -Path $script:Package -WhatIf

        $result.Action | Should -BeExactly 'Installed'
        foreach ($name in 'Add-PnPApp', 'Install-PnPApp', 'Update-PnPApp', 'Uninstall-PnPApp', 'Remove-PnPApp') {
            Should -Invoke -ModuleName OrpheusSolutions $name -Times 0 -Exactly
        }
    }

    It 'makes no write call with -WhatIf when the installed solution is outdated' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.0.0'
        $script:Catalog.InstalledVersion = [version] '1.0.0.0'

        (Install-OrpheusSolution -Path $script:Package -WhatIf).Action | Should -BeExactly 'Updated'
        $script:Calls.Count | Should -Be 0
    }

    It 'plans a reinstall with -WhatIf when a manifest is empty, using only the read-only POST' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.1.0'
        $script:Catalog.InstalledVersion = [version] '1.0.1.0'
        $script:ManifestMode = 'AlwaysBroken'

        (Install-OrpheusSolution -Path $script:Package -WhatIf).Action | Should -BeExactly 'Reinstalled'
        $script:Calls.Count | Should -Be 0
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 1 -Exactly
    }
}

#endregion

#region Task 3: bindings (header, field, form)

Describe 'Set-OrpheusAppCustomizer' {
    BeforeAll {
        $script:ChromeProperties = '{"contractsListUrl":"Lists/Contracts","calendarPageUrl":"SitePages/ContractCalendar.aspx","showFooter":true}'
        function New-CustomAction {
            param([string] $Id, [string] $Properties = $script:ChromeProperties, [string] $ComponentId = $script:AppCustomizerId)
            [pscustomobject]@{
                Id                            = $Id
                Name                          = 'OrpheusChrome'
                Title                         = 'Orpheus header and footer'
                Location                      = 'ClientSideExtension.ApplicationCustomizer'
                ClientSideComponentId         = $ComponentId
                ClientSideComponentProperties = $Properties
            }
        }
    }

    BeforeEach {
        New-PnPSafetyNet
        $script:Actions = @()
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -eq '/_api/web/UserCustomActions' -and $Method -eq 'Get' } -MockWith {
            [pscustomobject]@{ value = @($script:Actions) }
        }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -like "/_api/web/UserCustomActions('*')" -and $Method -eq 'Merge' } -MockWith { }
        Mock -ModuleName OrpheusSolutions Add-PnPCustomAction { }
        Mock -ModuleName OrpheusSolutions Remove-PnPCustomAction { }
    }

    It 'adds the header when there is none' {
        # An unrelated action with another component id does not count.
        $script:Actions = @(New-CustomAction -Id '11111111-1111-1111-1111-111111111111' -ComponentId '22222222-2222-2222-2222-222222222222')

        Set-OrpheusAppCustomizer | Should -BeExactly 'Added'

        Should -Invoke -ModuleName OrpheusSolutions Add-PnPCustomAction -Times 1 -Exactly -ParameterFilter {
            $Name -eq 'OrpheusChrome' -and $Title -eq 'Orpheus header and footer' -and
            $Location -eq 'ClientSideExtension.ApplicationCustomizer' -and $ClientSideComponentId -eq [guid] $script:AppCustomizerId -and
            $ClientSideComponentProperties -eq $script:ChromeProperties -and $Scope -eq 'Web'
        }
        Should -Invoke -ModuleName OrpheusSolutions Remove-PnPCustomAction -Times 0 -Exactly
    }

    It 'reports Unchanged for one action whose properties differ only in key order and spacing' {
        $script:Actions = @(New-CustomAction -Id 'aaaaaaaa-0000-0000-0000-000000000001' -ComponentId $script:AppCustomizerId.ToUpperInvariant() `
                -Properties '{ "showFooter": true, "calendarPageUrl": "SitePages/ContractCalendar.aspx", "contractsListUrl": "Lists/Contracts" }')

        Set-OrpheusAppCustomizer | Should -BeExactly 'Unchanged'

        Should -Invoke -ModuleName OrpheusSolutions Add-PnPCustomAction -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Remove-PnPCustomAction -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 0 -Exactly -ParameterFilter { $Method -ne 'Get' }
    }

    It 'updates the properties of the one action in place' {
        $script:Actions = @(New-CustomAction -Id 'aaaaaaaa-0000-0000-0000-000000000001' -Properties '{"contractsListUrl":"Lists/Contracts","showFooter":false}')

        Set-OrpheusAppCustomizer | Should -BeExactly 'Updated'

        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 1 -Exactly -ParameterFilter {
            $Method -eq 'Merge' -and $Url -eq "/_api/web/UserCustomActions('aaaaaaaa-0000-0000-0000-000000000001')" -and
            ($Content | ConvertFrom-Json).ClientSideComponentProperties -eq $script:ChromeProperties
        }
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPCustomAction -Times 0 -Exactly
    }

    It 'keeps the first of two duplicates and removes the other' {
        $script:Actions = @(
            New-CustomAction -Id 'aaaaaaaa-0000-0000-0000-000000000001'
            New-CustomAction -Id 'aaaaaaaa-0000-0000-0000-000000000002'
        )

        Set-OrpheusAppCustomizer | Should -BeExactly 'Deduplicated'

        Should -Invoke -ModuleName OrpheusSolutions Remove-PnPCustomAction -Times 1 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Remove-PnPCustomAction -Times 1 -Exactly -ParameterFilter {
            (Get-BindValue $Identity '_id') -eq [guid] 'aaaaaaaa-0000-0000-0000-000000000002' -and $Scope -eq 'Web' -and $Force
        }
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 0 -Exactly -ParameterFilter { $Method -ne 'Get' }
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPCustomAction -Times 0 -Exactly
    }

    It 'removes the duplicates and updates the kept action when its properties differ' {
        $script:Actions = @(
            New-CustomAction -Id 'aaaaaaaa-0000-0000-0000-000000000001' -Properties ''
            New-CustomAction -Id 'aaaaaaaa-0000-0000-0000-000000000002'
            New-CustomAction -Id 'aaaaaaaa-0000-0000-0000-000000000003'
        )

        Set-OrpheusAppCustomizer | Should -BeExactly 'Deduplicated'

        Should -Invoke -ModuleName OrpheusSolutions Remove-PnPCustomAction -Times 2 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Remove-PnPCustomAction -Times 0 -Exactly -ParameterFilter { (Get-BindValue $Identity '_id') -eq [guid] 'aaaaaaaa-0000-0000-0000-000000000001' }
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 1 -Exactly -ParameterFilter {
            $Method -eq 'Merge' -and $Url -eq "/_api/web/UserCustomActions('aaaaaaaa-0000-0000-0000-000000000001')"
        }
    }

    It 'makes no write call with -WhatIf' {
        $script:Actions = @()
        Set-OrpheusAppCustomizer -WhatIf | Should -BeExactly 'Added'

        $script:Actions = @(
            New-CustomAction -Id 'aaaaaaaa-0000-0000-0000-000000000001' -Properties '{}'
            New-CustomAction -Id 'aaaaaaaa-0000-0000-0000-000000000002'
        )
        Set-OrpheusAppCustomizer -WhatIf | Should -BeExactly 'Deduplicated'

        Should -Invoke -ModuleName OrpheusSolutions Add-PnPCustomAction -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Remove-PnPCustomAction -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 0 -Exactly -ParameterFilter { $Method -ne 'Get' }
    }
}

Describe 'template.xml RemainingDays site column' {
    It 'carries the field customizer, so re-applying the template does not unbind it' {
        # Live: each run applied the template, which reset the column without ClientSideComponentId,
        # and the field step then bound it again ("Added" on every run).
        [xml] $template = Get-Content -Raw (Join-Path $PSScriptRoot '..' 'template.xml')
        $field = $template.SelectNodes('//*[local-name()="Field"]') | Where-Object { $_.GetAttribute('Name') -eq 'RemainingDays' } | Select-Object -First 1
        $field | Should -Not -BeNullOrEmpty
        $field.GetAttribute('ClientSideComponentId') | Should -BeExactly 'a7721b49-8c3e-48c7-ac67-69408fcc6a03'
    }
}

Describe 'Set-OrpheusFieldCustomizer' {
    BeforeEach {
        New-PnPSafetyNet
        $script:FieldComponentId = $script:FieldCustomizerId
        $script:ViewFields = @('LinkTitle', 'ContractCode', 'RemainingDays')
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter {
            $Method -eq 'Get' -and $Url -like "/_api/web/lists/getbytitle('Contracts')/fields/getbyinternalnameortitle('RemainingDays')*"
        } -MockWith { [pscustomobject]@{ ClientSideComponentId = $null } }  # live: the REST $select returned no id
        Mock -ModuleName OrpheusSolutions Get-PnPField -ParameterFilter { (Get-BindValue $List '_name') -eq 'Contracts' -and $Identity.Name -eq 'RemainingDays' } -MockWith {
            [pscustomobject]@{ InternalName = 'RemainingDays'; ClientSideComponentId = [guid] $script:FieldComponentId }
        }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter {
            $Method -eq 'Get' -and $Url -eq "/_api/web/lists/getbytitle('Contracts')/DefaultView/ViewFields"
        } -MockWith { [pscustomobject]@{ SchemaXml = '<FieldRef />'; Items = @($script:ViewFields) } }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter {
            $Method -eq 'Post' -and $Url -eq "/_api/web/lists/getbytitle('Contracts')/DefaultView/ViewFields/addviewfield('RemainingDays')"
        } -MockWith { }
        Mock -ModuleName OrpheusSolutions Set-PnPField { }
    }

    It 'binds the field customizer when the field has none' {
        $script:FieldComponentId = '00000000-0000-0000-0000-000000000000'

        Set-OrpheusFieldCustomizer | Should -BeExactly 'Added'

        Should -Invoke -ModuleName OrpheusSolutions Set-PnPField -Times 1 -Exactly -ParameterFilter {
            (Get-BindValue $List '_name') -eq 'Contracts' -and $Identity.Name -eq 'RemainingDays' -and $Values.ClientSideComponentId -eq [guid] $script:FieldCustomizerId
        }
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 0 -Exactly -ParameterFilter { $Method -eq 'Post' }
    }

    It 'reports Unchanged when the binding and the default view are correct' {
        $script:FieldComponentId = $script:FieldCustomizerId.ToUpperInvariant()

        Set-OrpheusFieldCustomizer | Should -BeExactly 'Unchanged'

        Should -Invoke -ModuleName OrpheusSolutions Set-PnPField -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 0 -Exactly -ParameterFilter { $Method -ne 'Get' }
    }

    It 'rebinds a field bound to another component' {
        $script:FieldComponentId = '22222222-2222-2222-2222-222222222222'

        Set-OrpheusFieldCustomizer | Should -BeExactly 'Updated'

        Should -Invoke -ModuleName OrpheusSolutions Set-PnPField -Times 1 -Exactly
    }

    It 'adds RemainingDays to the default view when it is missing' {
        $script:ViewFields = @('LinkTitle', 'ContractCode')

        Set-OrpheusFieldCustomizer | Should -BeExactly 'Updated'

        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 1 -Exactly -ParameterFilter { $Method -eq 'Post' }
        Should -Invoke -ModuleName OrpheusSolutions Set-PnPField -Times 0 -Exactly
    }

    It 'makes no write call with -WhatIf' {
        $script:FieldComponentId = '00000000-0000-0000-0000-000000000000'
        $script:ViewFields = @('LinkTitle')

        Set-OrpheusFieldCustomizer -WhatIf | Should -BeExactly 'Added'

        Should -Invoke -ModuleName OrpheusSolutions Set-PnPField -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 0 -Exactly -ParameterFilter { $Method -ne 'Get' }
    }
}

Describe 'Set-OrpheusFormCustomizer' {
    BeforeAll {
        $script:ListCtId = '0x0100514116295A2F4DD1A93519F365EB8AAF00C1D2E3F4A5B6C7D8E9F0A1B2C3D4E5F6A7'
    }

    BeforeEach {
        New-PnPSafetyNet
        $script:Calls = [System.Collections.Generic.List[string]]::new()
        $script:FormIds = @{ New = $script:FormCustomizerId; Edit = $script:FormCustomizerId; Display = $script:FormCustomizerId }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter {
            $Method -eq 'Get' -and $Url -like "/_api/web/lists/getbytitle('Contracts')/contenttypes*"
        } -MockWith {
            [pscustomobject]@{
                value = @(
                    [pscustomobject]@{ Name = 'Item'; StringId = '0x01009999'; NewFormClientSideComponentId = $null; EditFormClientSideComponentId = $null; DisplayFormClientSideComponentId = $null }
                    [pscustomobject]@{
                        Name                             = 'Orpheus Contract'
                        StringId                         = $script:ListCtId
                        NewFormClientSideComponentId     = $script:FormIds.New
                        EditFormClientSideComponentId    = $script:FormIds.Edit
                        DisplayFormClientSideComponentId = $script:FormIds.Display
                    }
                )
            }
        }
        Mock -ModuleName OrpheusSolutions Get-PnPContentType {
            $script:ContentType = [pscustomobject]@{
                StringId                         = $script:ListCtId
                NewFormClientSideComponentId     = $script:FormIds.New
                EditFormClientSideComponentId    = $script:FormIds.Edit
                DisplayFormClientSideComponentId = $script:FormIds.Display
            }
            $script:ContentType | Add-Member -MemberType ScriptMethod -Name Update -Value { param($updateChildren) $script:Calls.Add("Update($updateChildren)") }
            $script:ContentType
        }
        Mock -ModuleName OrpheusSolutions Invoke-PnPQuery { $script:Calls.Add('Query') }
    }

    It 'binds all three forms when none is set' {
        $script:FormIds = @{ New = $null; Edit = ''; Display = $null }

        Set-OrpheusFormCustomizer | Should -BeExactly 'Added'

        $script:Calls -join ',' | Should -BeExactly 'Update(False),Query'
        $script:ContentType.NewFormClientSideComponentId | Should -BeExactly $script:FormCustomizerId
        $script:ContentType.EditFormClientSideComponentId | Should -BeExactly $script:FormCustomizerId
        $script:ContentType.DisplayFormClientSideComponentId | Should -BeExactly $script:FormCustomizerId
        Should -Invoke -ModuleName OrpheusSolutions Get-PnPContentType -Times 1 -Exactly -ParameterFilter { (Get-BindValue $List '_name') -eq 'Contracts' }
    }

    It 'reports Unchanged when the three ids are already set' {
        $script:FormIds = @{ New = "{$($script:FormCustomizerId.ToUpperInvariant())}"; Edit = $script:FormCustomizerId; Display = $script:FormCustomizerId }

        Set-OrpheusFormCustomizer | Should -BeExactly 'Unchanged'

        $script:Calls.Count | Should -Be 0
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPQuery -Times 0 -Exactly
    }

    It 'updates only the form id that differs' {
        $script:FormIds.Edit = '22222222-2222-2222-2222-222222222222'

        Set-OrpheusFormCustomizer | Should -BeExactly 'Updated'

        $script:Calls -join ',' | Should -BeExactly 'Update(False),Query'
        $script:ContentType.EditFormClientSideComponentId | Should -BeExactly $script:FormCustomizerId
    }

    It 'throws when the list has no Orpheus Contract content type' {
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Method -eq 'Get' } -MockWith { [pscustomobject]@{ value = @() } }

        { Set-OrpheusFormCustomizer } | Should -Throw '*Orpheus Contract*'
    }

    It 'makes no write call with -WhatIf' {
        $script:FormIds = @{ New = $null; Edit = $null; Display = $null }

        Set-OrpheusFormCustomizer -WhatIf | Should -BeExactly 'Added'

        $script:Calls.Count | Should -Be 0
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPQuery -Times 0 -Exactly
    }
}

Describe 'Binding functions under -Confirm and with chatty cmdlets' {
    BeforeEach {
        New-PnPSafetyNet
        Mock -ModuleName OrpheusSolutions Get-PnPGroup { }
        Mock -ModuleName OrpheusSolutions Get-PnPField { [pscustomobject]@{ InternalName = 'RemainingDays'; ClientSideComponentId = [guid]::Empty } }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Method -eq 'Get' } -MockWith {
            switch -Wildcard ($Url) {
                '/_api/web/UserCustomActions' { [pscustomobject]@{ value = @() } }
                '*/fields/getbyinternalnameortitle*' { [pscustomobject]@{ ClientSideComponentId = '00000000-0000-0000-0000-000000000000' } }
                '*/DefaultView/ViewFields' { [pscustomobject]@{ Items = @('LinkTitle') } }
                '*/contenttypes*' { [pscustomobject]@{ value = @([pscustomobject]@{ Name = 'Orpheus Contract'; StringId = '0x0100514116295A2F4DD1A93519F365EB8AAF00AB' }) } }
                default { throw "Unexpected GET $Url" }
            }
        }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Method -ne 'Get' } -MockWith { [pscustomobject]@{ odata = 'response' } }
        Mock -ModuleName OrpheusSolutions Add-PnPCustomAction { [pscustomobject]@{ Id = [guid]::NewGuid() } }
        Mock -ModuleName OrpheusSolutions Set-PnPField { [pscustomobject]@{ InternalName = 'RemainingDays' } }
        Mock -ModuleName OrpheusSolutions Get-PnPContentType {
            $ct = [pscustomobject]@{ StringId = '0x01'; NewFormClientSideComponentId = $null; EditFormClientSideComponentId = $null; DisplayFormClientSideComponentId = $null }
            $ct | Add-Member -MemberType ScriptMethod -Name Update -Value { param($updateChildren) }
            $ct
        }
        Mock -ModuleName OrpheusSolutions Invoke-PnPQuery { [pscustomobject]@{ Done = $true } }
    }

    It 'returns a single string from each binding when the cmdlets emit objects' {
        foreach ($result in @(@(Set-OrpheusAppCustomizer), @(Set-OrpheusFieldCustomizer), @(Set-OrpheusFormCustomizer))) {
            $result.Count | Should -Be 1
            $result[0] | Should -BeOfType [string]
        }
    }

    It 'reports Skipped and writes nothing when each step is declined' {
        Mock -ModuleName OrpheusSolutions Test-OrpheusShouldProcess { $false }

        Set-OrpheusAppCustomizer | Should -BeExactly 'Skipped'
        Set-OrpheusFieldCustomizer | Should -BeExactly 'Skipped'
        Set-OrpheusFormCustomizer | Should -BeExactly 'Skipped'

        foreach ($name in 'Add-PnPCustomAction', 'Set-PnPField', 'Get-PnPContentType', 'Invoke-PnPQuery') {
            Should -Invoke -ModuleName OrpheusSolutions $name -Times 0 -Exactly
        }
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 0 -Exactly -ParameterFilter { $Method -ne 'Get' }
    }

    It 'still reports the plan, not Skipped, under -WhatIf' {
        Set-OrpheusAppCustomizer -WhatIf | Should -BeExactly 'Added'
        Set-OrpheusFieldCustomizer -WhatIf | Should -BeExactly 'Added'
    }
}

#endregion

#region Task 4: calendar page with the web part

Describe 'Set-OrpheusCalendarPage' {
    BeforeAll {
        $script:ListIds = @{
            'Lists/Contracts'       = [guid] 'C0000000-0000-0000-0000-00000000000A'
            'Lists/CalendarEntries' = [guid] 'E0000000-0000-0000-0000-00000000000B'
            'Lists/Holidays'        = [guid] 'D0000000-0000-0000-0000-00000000000C'
        }
        $script:InstanceId = [guid] 'f0000000-0000-0000-0000-000000000001'

        function New-CorrectProperties {
            [ordered]@{
                useLocalData         = $false
                contractsListId      = 'c0000000-0000-0000-0000-00000000000a'
                entriesListId        = 'e0000000-0000-0000-0000-00000000000b'
                holidaysListId       = 'd0000000-0000-0000-0000-00000000000c'
                monthsToShow         = 0
                blockWeekends        = $true
                demoUserId           = 1
                approvingOrgLabel    = 'Client approval'
                serviceProviderLabel = 'Service provider'
            }
        }
    }

    BeforeEach {
        New-PnPSafetyNet
        $script:Pages = @('Home.aspx', 'ContractCalendar.aspx')
        $script:Components = @()
        $script:MissingList = $null

        Mock -ModuleName OrpheusSolutions Get-PnPList {
            $name = Get-BindValue $Identity '_name'
            if ($name -eq $script:MissingList) { return $null }
            [pscustomobject]@{ Id = $script:ListIds[$name]; Title = ($name -split '/')[-1] }
        }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter {
            $Method -eq 'Get' -and $Url -like "/_api/web/getfolderbyserverrelativeurl('SitePages')/files*"
        } -MockWith { [pscustomobject]@{ value = @($script:Pages | ForEach-Object { [pscustomobject]@{ Name = $_ } }) } }
        $script:Available = @(New-AvailableComponent -Id '{8E7C3D81-DB98-46C9-993E-D4C26928926F}' -Name 'ContractCalendar')
        Mock -ModuleName OrpheusSolutions Get-PnPPageComponent -ParameterFilter { $ListAvailable } -MockWith { $script:Available }
        Mock -ModuleName OrpheusSolutions Get-PnPPageComponent -ParameterFilter { -not $ListAvailable } -MockWith { $script:Components }
        Mock -ModuleName OrpheusSolutions Remove-PnPPageComponent { }
        Mock -ModuleName OrpheusSolutions Add-PnPPage { }
        Mock -ModuleName OrpheusSolutions Add-PnPPageWebPart { }
        Mock -ModuleName OrpheusSolutions Set-PnPPageWebPart { }
        Mock -ModuleName OrpheusSolutions Set-PnPPage { }
    }

    It 'creates the page with the web part wired to the three lists when it is missing' {
        $script:Pages = @('Home.aspx')

        Set-OrpheusCalendarPage | Should -BeExactly 'Created'

        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPage -Times 1 -Exactly -ParameterFilter {
            $Name -eq 'ContractCalendar' -and $Title -eq 'Contract calendar' -and $LayoutType -eq 'Article'
        }
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPageWebPart -Times 1 -Exactly -ParameterFilter {
            $p = Get-BindValue $WebPartProperties '_hashtable'
            $Page.Name -eq 'ContractCalendar.aspx' -and (Get-BindValue $Component '_component').Name -ceq 'ContractCalendar' -and
            $p.contractsListId -ceq 'c0000000-0000-0000-0000-00000000000a' -and
            $p.entriesListId -ceq 'e0000000-0000-0000-0000-00000000000b' -and
            $p.holidaysListId -ceq 'd0000000-0000-0000-0000-00000000000c' -and
            $p.useLocalData -is [bool] -and -not $p.useLocalData -and $p.monthsToShow -is [int] -and $p.monthsToShow -eq 0 -and
            $p.blockWeekends -is [bool] -and $p.blockWeekends -and $p.demoUserId -is [int] -and $p.demoUserId -eq 1 -and
            $p.approvingOrgLabel -eq 'Client approval' -and $p.serviceProviderLabel -eq 'Service provider'
        }
        Should -Invoke -ModuleName OrpheusSolutions Set-PnPPage -Times 1 -Exactly -ParameterFilter { $Identity.Name -eq 'ContractCalendar.aspx' -and $Publish }
    }

    It 'uses the labels it is given' {
        $script:Pages = @()

        Set-OrpheusCalendarPage -Labels @{ approvingOrgLabel = 'Approver'; serviceProviderLabel = 'Vendor' } | Should -BeExactly 'Created'

        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPageWebPart -Times 1 -Exactly -ParameterFilter {
            $p = Get-BindValue $WebPartProperties '_hashtable'
            $p.approvingOrgLabel -eq 'Approver' -and $p.serviceProviderLabel -eq 'Vendor'
        }
    }

    It 'reports Unchanged when the page has a correctly wired web part' {
        $script:Components = @(
            [pscustomobject]@{ InstanceId = [guid] 'f0000000-0000-0000-0000-000000000009'; Text = '<p>Intro</p>' }
            [pscustomobject]@{ InstanceId = $script:InstanceId; WebPartId = $script:WebPartId; PropertiesJson = (New-CorrectProperties | ConvertTo-Json -Compress) }
        )

        Set-OrpheusCalendarPage | Should -BeExactly 'Unchanged'

        foreach ($name in 'Add-PnPPage', 'Add-PnPPageWebPart', 'Set-PnPPageWebPart', 'Set-PnPPage', 'Remove-PnPPageComponent') {
            Should -Invoke -ModuleName OrpheusSolutions $name -Times 0 -Exactly
        }
    }

    It 'sets the list ids on a web part without lists and keeps the other keys' {
        # The state the owner created by hand: the web part is on the page but has no lists.
        $script:Components = @(
            [pscustomobject]@{ InstanceId = $script:InstanceId; WebPartId = "{$($script:WebPartId.ToUpperInvariant())}"; PropertiesJson = '{"useLocalData":true,"monthsToShow":3,"timesheetTemplateUrl":"x"}' }
        )

        Set-OrpheusCalendarPage | Should -BeExactly 'Updated'

        Should -Invoke -ModuleName OrpheusSolutions Set-PnPPageWebPart -Times 1 -Exactly -ParameterFilter {
            $p = $PropertiesJson | ConvertFrom-Json
            $Page.Name -eq 'ContractCalendar.aspx' -and $Identity.InstanceId -eq $script:InstanceId -and
            $p.timesheetTemplateUrl -ceq 'x' -and $p.monthsToShow -is [long] -and $p.monthsToShow -eq 3 -and
            $p.useLocalData -is [bool] -and -not $p.useLocalData -and
            $p.contractsListId -ceq 'c0000000-0000-0000-0000-00000000000a' -and
            $p.entriesListId -ceq 'e0000000-0000-0000-0000-00000000000b' -and
            $p.holidaysListId -ceq 'd0000000-0000-0000-0000-00000000000c' -and
            $p.blockWeekends -is [bool] -and $p.blockWeekends -and $p.demoUserId -is [long] -and $p.demoUserId -eq 1 -and
            $p.approvingOrgLabel -ceq 'Client approval'
        }
        Should -Invoke -ModuleName OrpheusSolutions Set-PnPPage -Times 1 -Exactly -ParameterFilter { $Publish }
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPage -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPageWebPart -Times 0 -Exactly
    }

    It 'passes the available component itself, not a bare id that PnP cannot resolve' {
        Set-OrpheusCalendarPage | Should -BeExactly 'Updated'

        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPageWebPart -Times 1 -Exactly -ParameterFilter {
            $c = Get-BindValue $Component '_component'
            $null -ne $c -and $c.Id -ceq '{8E7C3D81-DB98-46C9-993E-D4C26928926F}'
        }
    }

    It 'throws, before adding anything, when the web part is not available on the site' {
        $script:Available = @()

        { Set-OrpheusCalendarPage } | Should -Throw '*8e7c3d81-db98-46c9-993e-d4c26928926f*not available*'
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPageWebPart -Times 0 -Exactly
    }

    It 'removes empty web part placeholders (no web part id) and adds the real web part' {
        $script:Components = @(
            [pscustomobject]@{ InstanceId = [guid] '39c938ef-ed6b-4a60-a3f1-6b02ce07cd22'; WebPartId = ''; ControlType = 3; PropertiesJson = '{}' }
            [pscustomobject]@{ InstanceId = [guid] 'e1ba7637-c079-4afa-a63d-f0a86d5fb9ff'; WebPartId = $null; ControlType = 3; PropertiesJson = '{"useLocalData":false}' }
            [pscustomobject]@{ InstanceId = [guid] 'f0000000-0000-0000-0000-000000000009'; Text = '<p>Intro</p>' }
        )

        Set-OrpheusCalendarPage | Should -BeExactly 'Updated'

        Should -Invoke -ModuleName OrpheusSolutions Remove-PnPPageComponent -Times 2 -Exactly -ParameterFilter { $Force }
        Should -Invoke -ModuleName OrpheusSolutions Remove-PnPPageComponent -Times 0 -Exactly -ParameterFilter { "$InstanceId" -eq 'f0000000-0000-0000-0000-000000000009' }
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPageWebPart -Times 1 -Exactly
    }

    It 'adds the web part to an existing page that lacks it' {
        $script:Components = @([pscustomobject]@{ InstanceId = [guid] 'f0000000-0000-0000-0000-000000000009'; Text = '<p>Intro</p>' })

        Set-OrpheusCalendarPage | Should -BeExactly 'Updated'

        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPageWebPart -Times 1 -Exactly -ParameterFilter {
            (Get-BindValue $WebPartProperties '_hashtable').holidaysListId -ceq 'd0000000-0000-0000-0000-00000000000c'
        }
        Should -Invoke -ModuleName OrpheusSolutions Set-PnPPage -Times 1 -Exactly -ParameterFilter { $Publish }
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPage -Times 0 -Exactly
    }

    It 'reports Skipped and writes nothing when the page creation is declined' {
        $script:Pages = @()
        Mock -ModuleName OrpheusSolutions Test-OrpheusShouldProcess { $false }

        Set-OrpheusCalendarPage | Should -BeExactly 'Skipped'
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPage -Times 0 -Exactly
    }

    It 'returns a single string when the page cmdlets emit objects' {
        $script:Pages = @()
        Mock -ModuleName OrpheusSolutions Add-PnPPage { [pscustomobject]@{ Name = 'ContractCalendar.aspx' } }
        Mock -ModuleName OrpheusSolutions Add-PnPPageWebPart { [pscustomobject]@{ InstanceId = [guid]::NewGuid() } }
        Mock -ModuleName OrpheusSolutions Set-PnPPage { [pscustomobject]@{ Name = 'ContractCalendar.aspx' } }

        $result = @(Set-OrpheusCalendarPage)

        $result.Count | Should -Be 1
        $result[0] | Should -BeExactly 'Created'
    }

    It 'throws when a list is missing' {
        $script:MissingList = 'Lists/Holidays'

        { Set-OrpheusCalendarPage } | Should -Throw '*run list provisioning first*'
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPage -Times 0 -Exactly
    }

    It 'makes no write call with -WhatIf' {
        $script:Pages = @()
        Set-OrpheusCalendarPage -WhatIf | Should -BeExactly 'Created'

        $script:Pages = @('ContractCalendar.aspx')
        $script:Components = @([pscustomobject]@{ InstanceId = $script:InstanceId; WebPartId = $script:WebPartId; PropertiesJson = '{}' })
        Set-OrpheusCalendarPage -WhatIf | Should -BeExactly 'Updated'

        foreach ($name in 'Add-PnPPage', 'Add-PnPPageWebPart', 'Set-PnPPageWebPart', 'Set-PnPPage', 'Remove-PnPPageComponent', 'New-PnPSiteGroup') {
            Should -Invoke -ModuleName OrpheusSolutions $name -Times 0 -Exactly
        }
    }
}

#endregion

#region Task 5: orchestrator

Describe 'Get-OrpheusPackagePaths' {
    BeforeAll {
        $script:PackageNames = 'wp-contract-calendar', 'ext-app-customizer', 'ext-field-customizer', 'ext-form-customizer'
    }

    BeforeEach { New-PnPSafetyNet }

    It 'resolves the four packages in a repository layout, in install order' {
        $root = Join-Path $TestDrive 'repo'
        foreach ($name in $script:PackageNames) {
            $dir = New-Item -ItemType Directory -Force -Path (Join-Path $root 'packages' $name 'sharepoint' 'solution')
            Set-Content -LiteralPath (Join-Path $dir "$name.sppkg") -Value 'zip'
        }

        $packages = Get-OrpheusPackagePaths -SolutionsPath $root

        $packages.Name | Should -BeExactly $script:PackageNames
        $packages[1].Path | Should -BeExactly ([System.IO.Path]::GetFullPath((Join-Path $root 'packages' 'ext-app-customizer' 'sharepoint' 'solution' 'ext-app-customizer.sppkg')))
    }

    It 'resolves the four packages in a flat folder' {
        $flat = New-Item -ItemType Directory -Force -Path (Join-Path $TestDrive 'flat')
        foreach ($name in $script:PackageNames) { Set-Content -LiteralPath (Join-Path $flat "$name.sppkg") -Value 'zip' }

        $packages = Get-OrpheusPackagePaths -SolutionsPath $flat

        $packages.Name | Should -BeExactly $script:PackageNames
        $packages[3].Path | Should -BeExactly ([System.IO.Path]::GetFullPath((Join-Path $flat 'ext-form-customizer.sppkg')))
    }

    It 'throws naming every missing package and the package command' {
        $partial = New-Item -ItemType Directory -Force -Path (Join-Path $TestDrive 'partial')
        Set-Content -LiteralPath (Join-Path $partial 'ext-app-customizer.sppkg') -Value 'zip'

        { Get-OrpheusPackagePaths -SolutionsPath $partial } |
            Should -Throw '*wp-contract-calendar, ext-field-customizer, ext-form-customizer*.\scripts\podman.ps1 package*'
    }

    It 'still throws for a missing package while -WhatIf is in effect' {
        $partial = New-Item -ItemType Directory -Force -Path (Join-Path $TestDrive 'partial-whatif')
        $WhatIfPreference = $true

        { Get-OrpheusPackagePaths -SolutionsPath $partial } | Should -Throw '*podman.ps1 package*'
        { Invoke-OrpheusSolutionInstall -SolutionsPath $partial -WhatIf } | Should -Throw '*podman.ps1 package*'
    }

    It 'defaults to the repository root two levels above the module' {
        $expected = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..' '..' '..'))
        (& (Get-Module OrpheusSolutions) { $script:RepoRoot }) | Should -BeExactly $expected
    }
}

Describe 'Assert-OrpheusSiteAppCatalog' {
    BeforeEach { New-PnPSafetyNet }

    It 'passes when the catalog can be read' {
        Mock -ModuleName OrpheusSolutions Get-PnPApp { }

        { Assert-OrpheusSiteAppCatalog } | Should -Not -Throw
    }

    It 'names the admin commands when the site has no Apps for SharePoint library' {
        Mock -ModuleName OrpheusSolutions Get-PnPApp { throw 'Something went wrong.' }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -like '*BaseTemplate eq 336*' } -MockWith { [pscustomobject]@{ value = @() } }

        { Assert-OrpheusSiteAppCatalog } | Should -Throw '*no site collection App Catalog*Register-PnPAppCatalogSite*Add-PnPSiteCollectionAppCatalog*'
    }

    It 'reports the real error, not a missing catalog, when the catalog exists' {
        Mock -ModuleName OrpheusSolutions Get-PnPApp { throw '(403) Forbidden.' }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -like '*BaseTemplate eq 336*' } -MockWith { [pscustomobject]@{ value = @([pscustomobject]@{ Id = [guid]::NewGuid() }) } }

        $message = try { Assert-OrpheusSiteAppCatalog; '' } catch { $_.Exception.Message }

        $message | Should -BeLike '*(403) Forbidden.*'
        $message | Should -Not -BeLike '*no site collection App Catalog*'
    }

    It 'reports the real error when even the library check fails' {
        Mock -ModuleName OrpheusSolutions Get-PnPApp { throw 'The remote server returned an error: (429).' }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -like '*BaseTemplate eq 336*' } -MockWith { throw '(429) Too many requests.' }

        $message = try { Assert-OrpheusSiteAppCatalog; '' } catch { $_.Exception.Message }

        $message | Should -BeLike '*(429)*'
        $message | Should -Not -BeLike '*no site collection App Catalog*'
    }
}

Describe 'Set-OrpheusContractManagersGroup' {
    BeforeEach {
        New-PnPSafetyNet
        $script:GroupExists = $false
        Mock -ModuleName OrpheusSolutions Get-PnPGroup {
            if ($script:GroupExists) { return [pscustomobject]@{ Title = 'Orpheus Contract Managers' } }
            return $null
        }
        Mock -ModuleName OrpheusSolutions New-PnPSiteGroup { }
    }

    It 'adds the group with Contribute when missing' {
        Set-OrpheusContractManagersGroup | Should -BeExactly 'Added'

        Should -Invoke -ModuleName OrpheusSolutions New-PnPSiteGroup -Times 1 -Exactly -ParameterFilter {
            $Name -eq 'Orpheus Contract Managers' -and "$PermissionLevels" -eq 'Contribute'
        }
    }

    It 'is Unchanged when it exists, with no New-PnPSiteGroup' {
        $script:GroupExists = $true

        Set-OrpheusContractManagersGroup | Should -BeExactly 'Unchanged'
        Should -Invoke -ModuleName OrpheusSolutions New-PnPSiteGroup -Times 0 -Exactly
    }

    It 'treats a "not found" or "does not exist" throw as missing' {
        foreach ($message in 'Group cannot be found.', 'The group does not exist or is not valid.') {
            Mock -ModuleName OrpheusSolutions Get-PnPGroup -MockWith ({ throw $message }.GetNewClosure())

            Set-OrpheusContractManagersGroup | Should -BeExactly 'Added'
        }
        Should -Invoke -ModuleName OrpheusSolutions New-PnPSiteGroup -Times 2 -Exactly
    }

    It 'rethrows any other Get-PnPGroup error and writes nothing' {
        Mock -ModuleName OrpheusSolutions Get-PnPGroup { throw 'Access denied (403).' }

        { Set-OrpheusContractManagersGroup } | Should -Throw '*Access denied*'
        Should -Invoke -ModuleName OrpheusSolutions New-PnPSiteGroup -Times 0 -Exactly
    }

    It 'makes no write call with -WhatIf' {
        Set-OrpheusContractManagersGroup -WhatIf | Should -BeExactly 'Added'
        Should -Invoke -ModuleName OrpheusSolutions New-PnPSiteGroup -Times 0 -Exactly
    }

    It 'reports Skipped and writes nothing when the creation is declined' {
        Mock -ModuleName OrpheusSolutions Test-OrpheusShouldProcess { $false }

        Set-OrpheusContractManagersGroup | Should -BeExactly 'Skipped'
        Should -Invoke -ModuleName OrpheusSolutions New-PnPSiteGroup -Times 0 -Exactly
    }

    It 'returns a single string when New-PnPSiteGroup emits an object' {
        Mock -ModuleName OrpheusSolutions New-PnPSiteGroup { [pscustomobject]@{ Title = 'Orpheus Contract Managers' } }

        $result = @(Set-OrpheusContractManagersGroup)

        $result.Count | Should -Be 1
        $result[0] | Should -BeExactly 'Added'
    }
}

Describe 'Invoke-OrpheusSolutionInstall' {
    BeforeAll {
        $script:Flat = New-Item -ItemType Directory -Force -Path (Join-Path $TestDrive 'solutions')
        foreach ($name in 'wp-contract-calendar', 'ext-app-customizer', 'ext-field-customizer', 'ext-form-customizer') {
            Set-Content -LiteralPath (Join-Path $script:Flat "$name.sppkg") -Value 'zip'
        }
    }

    BeforeEach {
        New-PnPSafetyNet
        $script:Order = [System.Collections.Generic.List[string]]::new()
        Mock -ModuleName OrpheusSolutions Get-PnPApp { $script:Order.Add('Probe') }
        Mock -ModuleName OrpheusSolutions Install-OrpheusSolution {
            $name = [System.IO.Path]::GetFileNameWithoutExtension($Path)
            $script:Order.Add("Install:$name")
            [pscustomobject]@{ Title = "$name-client-side-solution"; Version = '1.0.0.0'; Action = 'Installed' }
        }
        Mock -ModuleName OrpheusSolutions Set-OrpheusAppCustomizer { $script:Order.Add('AppCustomizer'); 'Added' }
        Mock -ModuleName OrpheusSolutions Set-OrpheusFieldCustomizer { $script:Order.Add('FieldCustomizer'); 'Added' }
        Mock -ModuleName OrpheusSolutions Set-OrpheusFormCustomizer { $script:Order.Add('FormCustomizer'); 'Unchanged' }
        Mock -ModuleName OrpheusSolutions Set-OrpheusContractManagersGroup { $script:Order.Add('ManagersGroup'); 'Added' }
        Mock -ModuleName OrpheusSolutions Set-OrpheusCalendarPage { $script:Order.Add('CalendarPage'); 'Created' }
    }

    It 'checks the App Catalog, installs the four packages, then wires header, field, form and page in order' {
        $rows = Invoke-OrpheusSolutionInstall -SolutionsPath $script:Flat

        $script:Order -join ',' | Should -BeExactly ('Probe,Install:wp-contract-calendar,Install:ext-app-customizer,Install:ext-field-customizer,' +
            'Install:ext-form-customizer,AppCustomizer,FieldCustomizer,FormCustomizer,ManagersGroup,CalendarPage')
        $rows.Count | Should -Be 9
        $rows[0].Component | Should -BeLike '*wp-contract-calendar*'
        $rows[0].Action | Should -BeExactly 'Installed'
        ($rows | Select-Object -Last 5).Action -join ',' | Should -BeExactly 'Added,Added,Unchanged,Added,Created'
        $rows[-2].Component | Should -BeExactly 'Contract managers group (Orpheus Contract Managers)'
    }

    It 'throws on a missing package before reading or writing anything on the site' {
        $missing = New-Item -ItemType Directory -Force -Path (Join-Path $TestDrive 'missing')

        { Invoke-OrpheusSolutionInstall -SolutionsPath $missing } | Should -Throw '*podman.ps1 package*'
        $script:Order.Count | Should -Be 0
    }

    It 'stops with the admin commands when the site has no site collection App Catalog' {
        Mock -ModuleName OrpheusSolutions Get-PnPApp { throw 'The site collection app catalog does not exist.' }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -like '*BaseTemplate eq 336*' } -MockWith { [pscustomobject]@{ value = @() } }

        { Invoke-OrpheusSolutionInstall -SolutionsPath $script:Flat } |
            Should -Throw '*tenant App Catalog*Register-PnPAppCatalogSite*Add-PnPSiteCollectionAppCatalog*'
        Should -Invoke -ModuleName OrpheusSolutions Install-OrpheusSolution -Times 0 -Exactly
    }

    It 'passes the labels to the calendar page' {
        $null = Invoke-OrpheusSolutionInstall -SolutionsPath $script:Flat -Labels @{ approvingOrgLabel = 'Approver' }

        Should -Invoke -ModuleName OrpheusSolutions Set-OrpheusCalendarPage -Times 1 -Exactly -ParameterFilter { $Labels.approvingOrgLabel -eq 'Approver' }
    }

    It 'adds a Failed row for the step that throws, then rethrows' {
        Mock -ModuleName OrpheusSolutions Install-OrpheusSolution -ParameterFilter { $Path -like '*ext-app-customizer*' } -MockWith { throw 'Timed out after 300 s waiting for x.' }
        $rows = [System.Collections.Generic.List[object]]::new()

        { Invoke-OrpheusSolutionInstall -SolutionsPath $script:Flat | ForEach-Object { $rows.Add($_) } } | Should -Throw '*Timed out*'

        $rows.Count | Should -Be 2
        $rows[1].Component | Should -BeLike '*ext-app-customizer*'
        $rows[1].Action | Should -BeLike 'Failed: Timed out after 300 s*'
        Should -Invoke -ModuleName OrpheusSolutions Set-OrpheusAppCustomizer -Times 0 -Exactly
    }

    It 'adds a Failed row when a binding step throws' {
        Mock -ModuleName OrpheusSolutions Set-OrpheusFieldCustomizer { throw 'Field RemainingDays not found.' }
        $rows = [System.Collections.Generic.List[object]]::new()

        { Invoke-OrpheusSolutionInstall -SolutionsPath $script:Flat | ForEach-Object { $rows.Add($_) } } | Should -Throw '*RemainingDays*'

        $rows[-1].Component | Should -BeLike 'Field customizer*'
        $rows[-1].Action | Should -BeExactly 'Failed: Field RemainingDays not found.'
    }

    It 'passes -ForceUpload to every install' {
        $null = Invoke-OrpheusSolutionInstall -SolutionsPath $script:Flat -ForceUpload

        Should -Invoke -ModuleName OrpheusSolutions Install-OrpheusSolution -Times 4 -Exactly -ParameterFilter { $ForceUpload }
    }

    It 'passes -Confirm:$false to every step' {
        $null = Invoke-OrpheusSolutionInstall -SolutionsPath $script:Flat -Confirm:$false

        Should -Invoke -ModuleName OrpheusSolutions Install-OrpheusSolution -Times 4 -Exactly -ParameterFilter { $null -ne $Confirm -and -not $Confirm }
        Should -Invoke -ModuleName OrpheusSolutions Set-OrpheusCalendarPage -Times 1 -Exactly -ParameterFilter { $null -ne $Confirm -and -not $Confirm }
    }

    It 'passes -WhatIf explicitly to every step' {
        $null = Invoke-OrpheusSolutionInstall -SolutionsPath $script:Flat -WhatIf

        foreach ($name in 'Install-OrpheusSolution', 'Set-OrpheusAppCustomizer', 'Set-OrpheusFieldCustomizer', 'Set-OrpheusFormCustomizer', 'Set-OrpheusContractManagersGroup', 'Set-OrpheusCalendarPage') {
            Should -Invoke -ModuleName OrpheusSolutions $name -Times 0 -Exactly -ParameterFilter { -not $WhatIf }
        }
        Should -Invoke -ModuleName OrpheusSolutions Install-OrpheusSolution -Times 4 -Exactly -ParameterFilter { $WhatIf }
    }
}

Describe 'Invoke-OrpheusSolutionInstall -WhatIf on a fresh site' {
    # End to end through the real module functions: only reads are mocked, every write cmdlet is
    # left to the safety net, so any write throws.
    BeforeAll {
        $script:Fresh = New-Item -ItemType Directory -Force -Path (Join-Path $TestDrive 'fresh')
        $ids = @{
            'wp-contract-calendar' = @('326f6878-25b8-4117-93fb-ba9882352eaf', "1200746d-2d50-40ae-9f33-21f153ccec28/WebPart_$script:WebPartId.xml")
            'ext-app-customizer'   = @('8c050d2e-26f4-4a5e-822c-414d9365314f', "$script:AppCustomizerId/Extension_$script:AppCustomizerId.xml")
            'ext-field-customizer' = @('ff0771c6-d3da-4799-a42d-4d1e225cb3b3', "$script:FieldCustomizerId/Extension_$script:FieldCustomizerId.xml")
            'ext-form-customizer'  = @('f5fa93dd-a37d-498c-8c17-87a94be561e5', "$script:FormCustomizerId/Extension_$script:FormCustomizerId.xml")
        }
        foreach ($name in $ids.Keys) {
            $null = New-Sppkg -Path (Join-Path $script:Fresh "$name.sppkg") -ProductId $ids[$name][0] -Version '1.0.0.0' -Entries $ids[$name][1]
        }
    }

    BeforeEach {
        New-PnPSafetyNet
        Mock -ModuleName OrpheusSolutions Get-PnPApp { }
        Mock -ModuleName OrpheusSolutions Get-PnPList { [pscustomobject]@{ Id = [guid]::NewGuid() } }
        Mock -ModuleName OrpheusSolutions Get-PnPGroup { }
        Mock -ModuleName OrpheusSolutions Get-PnPField { [pscustomobject]@{ InternalName = 'RemainingDays'; ClientSideComponentId = [guid]::Empty } }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Method -eq 'Get' } -MockWith {
            switch -Wildcard ($Url) {
                '/_api/web/UserCustomActions' { [pscustomobject]@{ value = @() } }
                '*/fields/getbyinternalnameortitle*' { [pscustomobject]@{ ClientSideComponentId = '00000000-0000-0000-0000-000000000000' } }
                '*/DefaultView/ViewFields' { [pscustomobject]@{ Items = @('LinkTitle') } }
                '*/contenttypes*' { [pscustomobject]@{ value = @([pscustomobject]@{ Name = 'Orpheus Contract'; StringId = '0x0100514116295A2F4DD1A93519F365EB8AAF00AB' }) } }
                '*SitePages*' { [pscustomobject]@{ value = @() } }
                default { throw "Unexpected GET $Url" }
            }
        }
    }

    It 'plans every step and makes no write call' {
        $rows = Invoke-OrpheusSolutionInstall -SolutionsPath $script:Fresh -WhatIf

        $rows.Action -join ',' | Should -BeExactly 'Installed,Installed,Installed,Installed,Added,Added,Added,Added,Created'
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 0 -Exactly -ParameterFilter { $Method -ne 'Get' }
        foreach ($name in 'Add-PnPApp', 'Install-PnPApp', 'Update-PnPApp', 'Uninstall-PnPApp', 'Remove-PnPApp', 'Add-PnPCustomAction',
            'Remove-PnPCustomAction', 'Set-PnPField', 'Get-PnPContentType', 'Invoke-PnPQuery', 'Add-PnPPage', 'Add-PnPPageWebPart',
            'Set-PnPPageWebPart', 'Set-PnPPage', 'Remove-PnPPageComponent', 'New-PnPSiteGroup') {
            Should -Invoke -ModuleName OrpheusSolutions $name -Times 0 -Exactly
        }
    }
}

#endregion
