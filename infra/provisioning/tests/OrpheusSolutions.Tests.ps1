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
