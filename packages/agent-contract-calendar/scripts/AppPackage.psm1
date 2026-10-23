# Pure helpers for Build-AppPackage.ps1: they resolve the Agents Toolkit placeholders so the app
# package can be built and sideloaded without the toolkit.

function Read-EnvFile {
    param([Parameter(Mandatory)] [string] $Path)
    $values = @{}
    foreach ($line in Get-Content $Path) {
        if ($line -match '^\s*(#|$)') { continue }
        $key, $value = $line -split '=', 2
        $value = $value.Trim()
        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key.Trim()] = $value
    }
    $values
}

function ConvertTo-JsonStringBody([string] $Value) {
    # ConvertTo-Json adds the surrounding quotes; strip them to splice into an existing JSON string.
    $json = ConvertTo-Json -InputObject $Value -Compress
    $json.Substring(1, $json.Length - 2)
}

function Expand-Placeholders {
    param([Parameter(Mandatory)] [string] $Text, [Parameter(Mandatory)] [hashtable] $Values)
    [regex]::Replace($Text, '\$\{\{([A-Z0-9_]+)\}\}', {
        param($m)
        $name = $m.Groups[1].Value
        if (-not $Values.ContainsKey($name) -or [string]::IsNullOrEmpty($Values[$name])) {
            throw "No value for placeholder `${{$name}}"
        }
        ConvertTo-JsonStringBody $Values[$name]
    })
}

function Expand-FileIncludes {
    param([Parameter(Mandatory)] [string] $Text, [Parameter(Mandatory)] [string] $BaseDir)
    [regex]::Replace($Text, "\`$\[file\('([^']+)'\)\]", {
        param($m)
        $content = Get-Content (Join-Path $BaseDir $m.Groups[1].Value) -Raw
        ConvertTo-JsonStringBody ($content -replace "`r`n", "`n")
    })
}

Export-ModuleMember -Function Read-EnvFile, Expand-Placeholders, Expand-FileIncludes
