#Requires -Version 7.4
<#
.SYNOPSIS
    Runs every PowerShell test in the repo. Used by CI and for local runs.

.DESCRIPTION
    Two kinds of tests:
      - infra/provisioning/tests/*.Tests.ps1: self-contained runners (no Pester), run as scripts.
        Each exits 0 on success.
      - packages/*/setup/*.Tests.ps1: Pester 5 suites.

    Needs PnP.PowerShell 3.x (for #Requires only; the tests fake every cmdlet) and Pester 5.5+.

        pwsh -NoProfile -File scripts/ci/run-pester.ps1
#>

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..' '..'))
$failed = [System.Collections.Generic.List[string]]::new()

foreach ($runner in Get-ChildItem (Join-Path $root 'infra' 'provisioning' 'tests') -Filter '*.Tests.ps1' | Sort-Object Name) {
    Write-Host "`n=== $($runner.Name) ==="
    & pwsh -NoProfile -File $runner.FullName
    if ($LASTEXITCODE -ne 0) { $failed.Add($runner.Name) }
}

$suites = @(Get-ChildItem (Join-Path $root 'packages') -Directory |
    ForEach-Object { Join-Path $_.FullName 'setup' } |
    Where-Object { Test-Path $_ } |
    ForEach-Object { Get-ChildItem $_ -Filter '*.Tests.ps1' })

if ($suites.Count -gt 0) {
    Import-Module Pester -MinimumVersion 5.5.0
    $config = New-PesterConfiguration
    $config.Run.Path = @($suites.FullName)
    $config.Run.PassThru = $true
    $config.Output.Verbosity = 'Detailed'
    $result = Invoke-Pester -Configuration $config
    if ($result.Result -ne 'Passed') { $failed.Add('Pester') }
}

if ($failed.Count -gt 0) {
    Write-Error "PowerShell tests failed: $($failed -join ', ')" -ErrorAction Continue
    exit 1
}
Write-Host "`nPowerShell tests: all passed"
