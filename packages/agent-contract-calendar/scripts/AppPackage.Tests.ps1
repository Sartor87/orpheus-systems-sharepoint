#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.5.0' }

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot 'AppPackage.psm1') -Force
}

Describe 'Read-EnvFile' {
    It 'reads KEY=VALUE lines, strips surrounding quotes and skips comments' {
        $path = Join-Path $TestDrive '.env.dev'
        @('# comment', 'A=1', 'B=" (dev)"', '', 'C=x=y') | Set-Content $path
        $env = Read-EnvFile -Path $path
        $env['A'] | Should -Be '1'
        $env['B'] | Should -Be ' (dev)'
        $env['C'] | Should -Be 'x=y'
        $env.ContainsKey('# comment') | Should -BeFalse
    }
}

Describe 'Expand-Placeholders' {
    It 'replaces every ${{NAME}} with its value' {
        Expand-Placeholders -Text 'a ${{X}} b ${{Y}}' -Values @{ X = '1'; Y = '2' } | Should -Be 'a 1 b 2'
    }
    It 'JSON-escapes values so quotes cannot break the manifest' {
        Expand-Placeholders -Text '"${{X}}"' -Values @{ X = 'say "hi"' } | Should -Be '"say \"hi\""'
    }
    It 'throws on a placeholder without a value' {
        { Expand-Placeholders -Text '${{MISSING}}' -Values @{} } | Should -Throw '*MISSING*'
    }
    It 'throws on an empty value' {
        { Expand-Placeholders -Text '${{X}}' -Values @{ X = '' } } | Should -Throw '*X*'
    }
}

Describe 'Expand-FileIncludes' {
    It 'inlines $[file(...)] as a JSON-escaped string' {
        $dir = Join-Path $TestDrive 'pkg'; New-Item -ItemType Directory $dir | Out-Null
        "line 1`nsay `"x`"" | Set-Content (Join-Path $dir 'instruction.txt') -NoNewline
        Expand-FileIncludes -Text '{"instructions": "$[file(''instruction.txt'')]"}' -BaseDir $dir |
            Should -Be '{"instructions": "line 1\nsay \"x\""}'
    }
}
