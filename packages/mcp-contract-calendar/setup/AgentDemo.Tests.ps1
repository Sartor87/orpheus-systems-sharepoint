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

Describe 'ConvertTo-DateKey' {
    It 'returns a plain yyyy-MM-dd string unchanged' { ConvertTo-DateKey '2026-10-05' | Should -Be '2026-10-05' }
    It 'maps a UTC datetime one hour before local midnight to the next day' {
        ConvertTo-DateKey ([datetime]::new(2026, 10, 4, 22, 0, 0, [System.DateTimeKind]::Utc)) | Should -Be '2026-10-05'
    }
    It 'handles an Unspecified-kind datetime as UTC' {
        ConvertTo-DateKey ([datetime]::new(2026, 10, 4, 22, 0, 0, [System.DateTimeKind]::Unspecified)) | Should -Be '2026-10-05'
    }
    It 'handles a Local-kind datetime by converting to UTC first' {
        $utc = [datetime]::new(2026, 10, 4, 22, 0, 0, [System.DateTimeKind]::Utc)
        ConvertTo-DateKey ($utc.ToLocalTime()) | Should -Be '2026-10-05'
    }
    It 'parses a Z timestamp string' { ConvertTo-DateKey '2026-10-04T22:00:00Z' | Should -Be '2026-10-05' }
    It 'handles what ConvertFrom-Json makes of a Z timestamp and of a plain date' {
        $o = '{"a":"2026-10-04T22:00:00Z","b":"2026-10-05"}' | ConvertFrom-Json
        ConvertTo-DateKey $o.a | Should -Be '2026-10-05'
        ConvertTo-DateKey $o.b | Should -Be '2026-10-05'
    }
    It 'returns null for null' { ConvertTo-DateKey $null | Should -BeNullOrEmpty }
}

Describe 'ConvertFrom-SpJson' {
    It 'tolerates both Id and ID and keeps Id' {
        $o = ConvertFrom-SpJson '{"Id":7,"ID":7,"Title":"x"}'
        $o.Id | Should -Be 7
        $o.Title | Should -Be 'x'
        @($o.PSObject.Properties.Name) | Should -Be @('Id', 'Title')
    }
    It 'keeps ID-then-Id order collapsed to Id' {
        $o = ConvertFrom-SpJson '{"ID":9,"Id":9}'
        @($o.PSObject.Properties.Name) | Should -Be @('Id')
    }
    It 'parses a value array with duplicate keys per item' {
        $o = ConvertFrom-SpJson '{"value":[{"Id":1,"ID":1},{"Id":2,"ID":2}]}'
        @($o.value).Count | Should -Be 2
        $o.value[1].Id | Should -Be 2
    }
    It 'keeps an empty value array as an array' {
        $o = ConvertFrom-SpJson '{"value":[]}'
        $o.PSObject.Properties['value'] | Should -Not -BeNullOrEmpty
        @($o.value).Count | Should -Be 0
    }
}

Describe 'ConvertTo-SpObject' {
    It 'converts nested dictionaries and lists' {
        InModuleScope AgentDemo {
            $o = ConvertTo-SpObject ([ordered]@{ A = 1; B = @([ordered]@{ C = 2 }) })
            $o.A | Should -Be 1
            $o.B[0].C | Should -Be 2
        }
    }
    It 'collapses case-only duplicate keys, preferring Id' {
        InModuleScope AgentDemo {
            $h = [System.Collections.Hashtable]::new([System.StringComparer]::Ordinal)
            $h['ID'] = 5; $h['Id'] = 5
            $o = ConvertTo-SpObject $h
            @($o.PSObject.Properties.Name) | Should -Be @('Id')
        }
    }
    It 'passes scalars and null through' {
        InModuleScope AgentDemo {
            ConvertTo-SpObject 'x' | Should -Be 'x'
            ConvertTo-SpObject $null | Should -BeNullOrEmpty
        }
    }
}

Describe 'Get-ListItemsRest' {
    It 'throws when the response has no value property' {
        Mock -ModuleName AgentDemo Invoke-SpRest { [pscustomobject]@{ error = 'boom' } }
        { Get-ListItemsRest -List 'Contracts' -Select 'Id' } | Should -Throw '*no ''value''*'
    }
    It 'throws on a null response' {
        Mock -ModuleName AgentDemo Invoke-SpRest { $null }
        { Get-ListItemsRest -List 'Contracts' -Select 'Id' } | Should -Throw
    }
    It 'returns an empty array for an empty value' {
        Mock -ModuleName AgentDemo Invoke-SpRest { [pscustomobject]@{ value = [object[]] @() } }
        @(Get-ListItemsRest -List 'Contracts' -Select 'Id').Count | Should -Be 0
    }
    It 'sends the filter URL-encoded' {
        Mock -ModuleName AgentDemo Invoke-SpRest { [pscustomobject]@{ value = [object[]] @() } }
        $null = Get-ListItemsRest -List 'Contracts' -Select 'Id' -Filter "startswith(Title,'002')"
        Should -Invoke -ModuleName AgentDemo Invoke-SpRest -ParameterFilter { $Url -like '*$filter=startswith%28Title%2C%27002%27%29*' }
    }
}
