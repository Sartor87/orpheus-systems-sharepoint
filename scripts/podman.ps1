<#
Thin wrapper over `podman compose`. Subcommands map 1:1 to compose services.
Usage: .\scripts\podman.ps1 <fix-perms|shell|install|build|test|serve|package|trust-dev-cert> [package-name]
Example: .\scripts\podman.ps1 serve wp-contract-calendar
Run `fix-perms` once after the named volumes are created (first run or after a reset).
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('fix-perms', 'shell', 'install', 'build', 'test', 'serve', 'package', 'trust-dev-cert')]
    [string]$Command,

    [Parameter(Position = 1)]
    [string]$Name
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$pkg = if ($Name) { "@orpheussystems/$Name" } else { '@orpheussystems/wp-contract-calendar' }

switch ($Command) {
    'serve' {
        $env:PKG = $pkg
        podman compose run --rm --service-ports serve
    }
    'trust-dev-cert' {
        podman compose run --rm shell bash -c "npm exec -w $pkg -- heft --unmanaged trust-dev-cert"
    }
    default {
        podman compose run --rm $Command
    }
}
exit $LASTEXITCODE
