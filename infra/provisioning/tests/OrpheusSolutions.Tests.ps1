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
    # The value a PnP pipe bind was built from (its private field), e.g. Get-BindValue $Identity '_id'.
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

Describe 'Set-OrpheusFieldCustomizer' {
    BeforeEach {
        New-PnPSafetyNet
        $script:FieldComponentId = $script:FieldCustomizerId
        $script:ViewFields = @('LinkTitle', 'ContractCode', 'RemainingDays')
        Mock -ModuleName OrpheusSolutions Invoke-PnPSPRestMethod -ParameterFilter {
            $Method -eq 'Get' -and $Url -like "/_api/web/lists/getbytitle('Contracts')/fields/getbyinternalnameortitle('RemainingDays')*"
        } -MockWith { [pscustomobject]@{ ClientSideComponentId = $script:FieldComponentId } }
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
        Mock -ModuleName OrpheusSolutions Get-PnPPageComponent { $script:Components }
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
            $Page.Name -eq 'ContractCalendar.aspx' -and (Get-BindValue $Component '_id') -eq [guid] $script:WebPartId -and
            $p.contractsListId -ceq 'c0000000-0000-0000-0000-00000000000a' -and
            $p.entriesListId -ceq 'e0000000-0000-0000-0000-00000000000b' -and
            $p.holidaysListId -ceq 'd0000000-0000-0000-0000-00000000000c' -and
            $p.useLocalData -eq $false -and $p.monthsToShow -eq 0 -and $p.blockWeekends -eq $true -and $p.demoUserId -eq 1 -and
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

        foreach ($name in 'Add-PnPPage', 'Add-PnPPageWebPart', 'Set-PnPPageWebPart', 'Set-PnPPage') {
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
            $p.timesheetTemplateUrl -eq 'x' -and $p.monthsToShow -eq 3 -and $p.useLocalData -eq $false -and
            $p.contractsListId -ceq 'c0000000-0000-0000-0000-00000000000a' -and
            $p.entriesListId -ceq 'e0000000-0000-0000-0000-00000000000b' -and
            $p.holidaysListId -ceq 'd0000000-0000-0000-0000-00000000000c' -and
            $p.blockWeekends -eq $true -and $p.demoUserId -eq 1 -and $p.approvingOrgLabel -eq 'Client approval'
        }
        Should -Invoke -ModuleName OrpheusSolutions Set-PnPPage -Times 1 -Exactly -ParameterFilter { $Publish }
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPage -Times 0 -Exactly
        Should -Invoke -ModuleName OrpheusSolutions Add-PnPPageWebPart -Times 0 -Exactly
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

        foreach ($name in 'Add-PnPPage', 'Add-PnPPageWebPart', 'Set-PnPPageWebPart', 'Set-PnPPage') {
            Should -Invoke -ModuleName OrpheusSolutions $name -Times 0 -Exactly
        }
    }
}

#endregion
