#Requires -Version 7.4
<#
.SYNOPSIS
    Builds the sideloadable app package without Microsoft 365 Agents Toolkit.

.DESCRIPTION
    Resolves the toolkit placeholders (${{NAME}} from env/.env.<env> and $[file('...')]) in
    appPackage/*.json, checks that every result parses as JSON with no placeholder left, and zips the
    manifests and icons into appPackage/build/appPackage.<env>.zip (gitignored).

    If TEAMS_APP_ID is empty, a new GUID is generated and written back to the env file so that later
    builds update the same app instead of creating a second one.

    Upload the zip in Teams: Apps, Manage your apps, Upload an app, Upload a custom app. To update an
    uploaded app, raise "version" in appPackage/manifest.json first.

.PARAMETER Environment
    Environment name; reads env/.env.<Environment>. Default: dev.

.EXAMPLE
    ./packages/agent-contract-calendar/scripts/Build-AppPackage.ps1
#>
[CmdletBinding()]
param([ValidatePattern('^[a-z0-9-]+$')] [string] $Environment = 'dev')

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'AppPackage.psm1') -Force

$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root 'appPackage'
$envFile = Join-Path $root "env/.env.$Environment"
if (-not (Test-Path $envFile)) { throw "Missing $envFile (copy env/.env.dev.sample and fill it in)." }

$values = Read-EnvFile -Path $envFile
if ([string]::IsNullOrWhiteSpace($values['TEAMS_APP_ID'])) {
    $values['TEAMS_APP_ID'] = [guid]::NewGuid().ToString()
    $lines = @(Get-Content $envFile | Where-Object { $_ -notmatch '^\s*TEAMS_APP_ID=' })
    @($lines + "TEAMS_APP_ID=$($values['TEAMS_APP_ID'])") | Set-Content $envFile -Encoding utf8NoBOM
    Write-Host "TEAMS_APP_ID generated and saved to env/.env.$Environment"
}

$out = Join-Path $src 'build'
$stage = Join-Path $out "stage.$Environment"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory $stage -Force | Out-Null

foreach ($file in Get-ChildItem $src -Filter *.json -File) {
    $text = Get-Content $file.FullName -Raw
    $text = Expand-FileIncludes -Text $text -BaseDir $src
    $text = Expand-Placeholders -Text $text -Values $values
    if ($text -match '\$\{\{|\$\[file\(') { throw "Unresolved placeholder in $($file.Name)" }
    $null = $text | ConvertFrom-Json   # throws if the result is not valid JSON
    Set-Content (Join-Path $stage $file.Name) $text -Encoding utf8NoBOM -NoNewline
}
Copy-Item (Join-Path $src 'color.png'), (Join-Path $src 'outline.png') $stage

$zip = Join-Path $out "appPackage.$Environment.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Remove-Item $stage -Recurse -Force

$manifest = Get-Content (Join-Path $src 'manifest.json') -Raw | ConvertFrom-Json
Write-Host "Built $zip (manifest version $($manifest.version))"
