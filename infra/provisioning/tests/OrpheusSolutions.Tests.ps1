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
            [string[]] $Entries = @()
        )
        Add-Type -AssemblyName System.IO.Compression
        $stream = [System.IO.File]::Create($Path)
        $zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
        try {
            $manifest = "<?xml version=`"1.0`" encoding=`"utf-8`"?><App xmlns=`"http://schemas.microsoft.com/sharepoint/2012/app/manifest`" Name=`"test-client-side-solution`" ProductID=`"$ProductId`" Version=`"$Version`" IsClientSideSolution=`"true`"><Properties><Title>Test</Title></Properties></App>"
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
        $script:Package = New-Sppkg -Path (Join-Path $TestDrive 'ext-app-customizer.sppkg') -ProductId $script:SolutionId -Version '1.0.1.0' `
            -Entries "$script:AppCustomizerId/Extension_$script:AppCustomizerId.xml"
    }

    BeforeEach {
        New-PnPSafetyNet
        & (Get-Module OrpheusSolutions) { $script:PollIntervalSeconds = 0 }

        # A fake site collection App Catalog. Catalog = $null means the app is not in the catalog.
        # Installs and updates finish at once; set $script:Catalog.Stuck to keep InstalledVersion.
        $script:Catalog = @{ Present = $false; AppCatalogVersion = $null; InstalledVersion = $null; Stuck = $false }
        $script:Calls = [System.Collections.Generic.List[string]]::new()
        # Manifest answers for successive GetClientSideComponentsById calls; the last one repeats.
        $script:ManifestAnswers = [System.Collections.Generic.List[string]]::new()
        $script:ManifestAnswers.Add('{"id":"30930118"}')
        $script:ManifestCalls = 0

        Mock -ModuleName OrpheusSolutions Get-PnPApp {
            if (-not $script:Catalog.Present) { return }
            [pscustomobject]@{
                Id                = [guid] $script:SolutionId
                Title             = 'ext-app-customizer-client-side-solution'
                AppCatalogVersion = $script:Catalog.AppCatalogVersion
                InstalledVersion  = $script:Catalog.InstalledVersion
            }
        }
        Mock -ModuleName OrpheusSolutions Add-PnPApp {
            $script:Calls.Add('Add')
            $script:Catalog.Present = $true
            $script:Catalog.AppCatalogVersion = [version] '1.0.1.0'
        }
        Mock -ModuleName OrpheusSolutions Install-PnPApp {
            $script:Calls.Add('Install')
            if (-not $script:Catalog.Stuck) { $script:Catalog.InstalledVersion = $script:Catalog.AppCatalogVersion }
        }
        Mock -ModuleName OrpheusSolutions Update-PnPApp {
            $script:Calls.Add('Update')
            if (-not $script:Catalog.Stuck) { $script:Catalog.InstalledVersion = $script:Catalog.AppCatalogVersion }
        }
        Mock -ModuleName OrpheusSolutions Uninstall-PnPApp {
            $script:Calls.Add('Uninstall')
            $script:Catalog.InstalledVersion = $null
        }
        Mock -ModuleName OrpheusSolutions Remove-PnPApp {
            $script:Calls.Add('Remove')
            $script:Catalog.Present = $false
            $script:Catalog.AppCatalogVersion = $null
        }
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter { $Url -eq '/_api/web/GetClientSideComponentsById' } -MockWith {
            $index = [Math]::Min($script:ManifestCalls, $script:ManifestAnswers.Count - 1)
            $script:ManifestCalls++
            New-ComponentsResponse @{ $script:AppCustomizerId = $script:ManifestAnswers[$index] }
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
        $script:Calls -join ',' | Should -BeExactly 'Add'
        Should -Invoke -ModuleName OrpheusSolutions Install-PnPApp -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Update-PnPApp -Times 0 -Exactly
    }

    It 'updates an older installed version' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.0.0'
        $script:Catalog.InstalledVersion = [version] '1.0.0.0'

        $result = Install-OrpheusSolution -Path $script:Package

        $result.Action | Should -BeExactly 'Updated'
        $script:Calls -join ',' | Should -BeExactly 'Add,Update'
    }

    It 'reinstalls cleanly when a manifest is empty after the update' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.0.0'
        $script:Catalog.InstalledVersion = [version] '1.0.0.0'
        $script:ManifestAnswers.Insert(0, '')

        $result = Install-OrpheusSolution -Path $script:Package

        $result.Action | Should -BeExactly 'Reinstalled'
        $script:Calls -join ',' | Should -BeExactly 'Add,Update,Uninstall,Remove,Add,Install'
        $script:ManifestCalls | Should -Be 2
    }

    It 'throws with the component id when the manifest is still empty after the reinstall' {
        $script:Catalog.Present = $true
        $script:Catalog.AppCatalogVersion = [version] '1.0.1.0'
        $script:Catalog.InstalledVersion = [version] '1.0.1.0'
        $script:ManifestAnswers[0] = ''

        { Install-OrpheusSolution -Path $script:Package } | Should -Throw "*$script:AppCustomizerId*"
        $script:Calls -join ',' | Should -BeExactly 'Add,Uninstall,Remove,Add,Install'
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
        $script:ManifestAnswers[0] = ''

        (Install-OrpheusSolution -Path $script:Package -WhatIf).Action | Should -BeExactly 'Reinstalled'
        $script:Calls.Count | Should -Be 0
        Should -Invoke -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -Times 1 -Exactly
    }
}

#endregion
