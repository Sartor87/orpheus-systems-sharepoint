<#
Thin wrapper over `podman compose`. Subcommands map 1:1 to compose services.
Usage: .\scripts\podman.ps1 <shell|install|build|test|serve|package> [package-name]
Example: .\scripts\podman.ps1 serve wp-contract-calendar
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('shell', 'install', 'build', 'test', 'serve', 'package')]
    [string]$Command,

    [Parameter(Position = 1)]
    [string]$Name
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

if ($Command -eq 'serve') {
    if ($Name) { $env:PKG = "@orpheussystems/$Name" }
    podman compose run --rm --service-ports serve
} else {
    podman compose run --rm $Command
}
exit $LASTEXITCODE
