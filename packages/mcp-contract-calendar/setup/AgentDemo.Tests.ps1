BeforeAll {
    Import-Module (Join-Path $PSScriptRoot 'AgentDemo.psm1') -Force
    $script:Data = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'demo-data.json') -Raw | ConvertFrom-Json
    $script:VendorId = '582b1c53-77a2-4a1b-918f-14e0b9eaff06'
}

Describe 'Get-VendorFieldState' {
    It 'is Missing for $null' { Get-VendorFieldState -Field $null | Should -Be 'Missing' }
    It 'is Present for the Vendor Id with braces, upper case, Text' {
        Get-VendorFieldState -Field ([pscustomobject]@{ Id = '{582B1C53-77A2-4A1B-918F-14E0B9EAFF06}'; TypeAsString = 'Text' }) | Should -Be 'Present'
    }
    It 'is Present for the Vendor Id without braces' {
        Get-VendorFieldState -Field ([pscustomobject]@{ Id = $VendorId; TypeAsString = 'Text' }) | Should -Be 'Present'
    }
    It 'is Present for a [guid] Id' {
        Get-VendorFieldState -Field ([pscustomobject]@{ Id = [guid] $VendorId; TypeAsString = 'Text' }) | Should -Be 'Present'
    }
    It 'is Conflict for the name with another Id' {
        Get-VendorFieldState -Field ([pscustomobject]@{ Id = '11111111-1111-1111-1111-111111111111'; TypeAsString = 'Text' }) | Should -Be 'Conflict'
    }
    It 'is Conflict for the Vendor Id with type Note' {
        Get-VendorFieldState -Field ([pscustomobject]@{ Id = $VendorId; TypeAsString = 'Note' }) | Should -Be 'Conflict'
    }
}

Describe 'Get-VendorFieldXml' {
    It 'contains every exact attribute' {
        $xml = Get-VendorFieldXml
        foreach ($a in 'ID="{582b1c53-77a2-4a1b-918f-14e0b9eaff06}"', 'Name="Vendor"', 'StaticName="Vendor"', 'DisplayName="Vendor (service provider)"', 'Type="Text"', 'MaxLength="255"', 'Group="Orpheus Systems"') {
            $xml | Should -Match ([regex]::Escape($a))
        }
    }
    It 'is well-formed XML with a Field root' {
        ([xml] (Get-VendorFieldXml)).DocumentElement.LocalName | Should -Be 'Field'
    }
}

Describe 'Test-DemoTitle' {
    It 'rejects 001xxx' { Test-DemoTitle -Title '001185_2026' | Should -BeFalse }
    It 'accepts 002xxx' { Test-DemoTitle -Title '002101_2026' | Should -BeTrue }
    It 'rejects trailing junk' { Test-DemoTitle -Title "002101_2026`n001185_2026" | Should -BeFalse }
    It 'rejects empty' { Test-DemoTitle -Title '' | Should -BeFalse }
}

Describe 'demo-data.json' {
    It 'has only 002xxx titles' {
        foreach ($c in $Data.contracts) { Test-DemoTitle -Title $c.title | Should -BeTrue }
        foreach ($e in $Data.entries) { Test-DemoTitle -Title $e.contractTitle | Should -BeTrue }
    }
    It 'has no entry in the 2026-11-16..2026-11-30 overlap window' {
        foreach ($e in $Data.entries) { ($e.date -ge '2026-11-16' -and $e.date -le '2026-11-30') | Should -BeFalse }
    }
    It 'has no weekend entries' {
        foreach ($e in $Data.entries) { ([datetime]::ParseExact($e.date, 'yyyy-MM-dd', $null)).DayOfWeek | Should -Not -BeIn 'Saturday', 'Sunday' }
    }
    It 'has no entry on a BG holiday' {
        $hol = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..' '..' 'shared-core' 'src' 'data' 'fixtures' 'holidays.json') -Raw | ConvertFrom-Json
        $dates = @($hol | Where-Object { $_.country -in 'BG', '*' } | ForEach-Object { $_.date })
        foreach ($e in $Data.entries) { $dates | Should -Not -Contain $e.date }
    }
    It 'has 3 to 5 entries per contract' {
        foreach ($c in $Data.contracts) { @($Data.entries | Where-Object { $_.contractTitle -eq $c.title }).Count | Should -BeIn 3, 4, 5 }
    }
}

Describe 'Get-DemoContractPlan' {
    It 'returns all contracts when none exist' { @(Get-DemoContractPlan -Existing @() -Data $Data).Count | Should -Be 4 }
    It 'excludes existing titles' {
        $plan = @(Get-DemoContractPlan -Existing @('002101_2026', '001185_2026') -Data $Data)
        $plan.title | Should -Not -Contain '002101_2026'
        $plan.Count | Should -Be 3
    }
    It 'returns nothing when all exist' {
        @(Get-DemoContractPlan -Existing @($Data.contracts.title) -Data $Data).Count | Should -Be 0
    }
}

Describe 'Get-DemoEntryPlan' {
    It 'returns all entries when none exist' { @(Get-DemoEntryPlan -Existing @() -Data $Data).Count | Should -Be $Data.entries.Count }
    It 'excludes existing contract/date pairs' {
        $first = $Data.entries[0]
        $plan = @(Get-DemoEntryPlan -Existing @(@{ ContractTitle = $first.contractTitle; Date = $first.date }) -Data $Data)
        $plan.Count | Should -Be ($Data.entries.Count - 1)
        @($plan | Where-Object { $_.contractTitle -eq $first.contractTitle -and $_.date -eq $first.date }).Count | Should -Be 0
    }
}
