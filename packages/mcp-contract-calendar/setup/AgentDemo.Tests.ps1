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

Describe 'Test-SpNotFound' {
    It 'is true for a 404 status code on the exception' {
        $e = [System.Net.Http.HttpRequestException]::new('Response status code does not indicate success.', $null, [System.Net.HttpStatusCode]::NotFound)
        Test-SpNotFound -Exception $e | Should -BeTrue
    }
    It 'is true for a 404 on an inner exception' {
        $inner = [System.Net.Http.HttpRequestException]::new('x', $null, [System.Net.HttpStatusCode]::NotFound)
        Test-SpNotFound -Exception ([System.Exception]::new('wrapped', $inner)) | Should -BeTrue
    }
    It 'is true for the SharePoint "does not exist" column message' {
        Test-SpNotFound -Exception ([System.Exception]::new("Column 'Vendor' does not exist. It may have been deleted by another user.")) | Should -BeTrue
    }
    It 'is true for "Invalid field name"' {
        Test-SpNotFound -Exception ([System.Exception]::new('Invalid field name. {582b1c53-77a2-4a1b-918f-14e0b9eaff06}')) | Should -BeTrue
    }
    It 'is false for 401 and 403 even when the text mentions a field' {
        $e401 = [System.Net.Http.HttpRequestException]::new("Column 'Vendor' does not exist", $null, [System.Net.HttpStatusCode]::Unauthorized)
        Test-SpNotFound -Exception $e401 | Should -BeFalse
        $e403 = [System.Net.Http.HttpRequestException]::new('Forbidden', $null, [System.Net.HttpStatusCode]::Forbidden)
        Test-SpNotFound -Exception $e403 | Should -BeFalse
    }
    It 'is false for an access denied or token error' {
        Test-SpNotFound -Exception ([System.Exception]::new('Access denied. You do not have permission to perform this action.')) | Should -BeFalse
        Test-SpNotFound -Exception ([System.Exception]::new('AADSTS50076: interaction required')) | Should -BeFalse
    }
    It 'is false for $null' { Test-SpNotFound -Exception $null | Should -BeFalse }
}

Describe 'Get-SpFieldOrNull' {
    It 'returns the field when found' {
        Mock -ModuleName AgentDemo Invoke-SpRest { [pscustomobject]@{ Id = '582b1c53-77a2-4a1b-918f-14e0b9eaff06'; InternalName = 'Vendor' } }
        (Get-SpFieldOrNull -Url '/x').InternalName | Should -Be 'Vendor'
    }
    It 'returns $null on not found' {
        Mock -ModuleName AgentDemo Invoke-SpRest { throw [System.Net.Http.HttpRequestException]::new('nf', $null, [System.Net.HttpStatusCode]::NotFound) }
        Get-SpFieldOrNull -Url '/x' | Should -BeNullOrEmpty
    }
    It 'rethrows an auth error instead of treating it as Missing' {
        Mock -ModuleName AgentDemo Invoke-SpRest { throw [System.Net.Http.HttpRequestException]::new('denied', $null, [System.Net.HttpStatusCode]::Unauthorized) }
        { Get-SpFieldOrNull -Url '/x' } | Should -Throw '*denied*'
    }
}

Describe 'Get-VendorPreflightState' {
    BeforeAll {
        $script:Site = [pscustomobject]@{ Id = $VendorId; InternalName = 'Vendor'; TypeAsString = 'Text' }
        $script:Other = '11111111-1111-1111-1111-111111111111'
    }
    It 'is Missing when nothing exists' {
        (Get-VendorPreflightState -SiteField $null -SiteFieldById $null -ListField $null).State | Should -Be 'Missing'
    }
    It 'is Present when the site column exists and the list field has the same Id' {
        $list = [pscustomobject]@{ Id = "{$($VendorId.ToUpperInvariant())}"; InternalName = 'Vendor'; TypeAsString = 'Text' }
        (Get-VendorPreflightState -SiteField $Site -SiteFieldById $Site -ListField $list).State | Should -Be 'Present'
    }
    It 'is Present when the site column exists and the list has no Vendor field yet' {
        (Get-VendorPreflightState -SiteField $Site -SiteFieldById $Site -ListField $null).State | Should -Be 'Present'
    }
    It 'is Conflict when the site column named Vendor has another Id' {
        $f = [pscustomobject]@{ Id = $Other; InternalName = 'Vendor'; TypeAsString = 'Text' }
        $r = Get-VendorPreflightState -SiteField $f -SiteFieldById $null -ListField $null
        $r.State | Should -Be 'Conflict'
        $r.Reason | Should -Match 'site column'
    }
    It 'is Conflict when the Vendor Id exists under another internal name' {
        $f = [pscustomobject]@{ Id = $VendorId; InternalName = 'VendorName'; TypeAsString = 'Text' }
        $r = Get-VendorPreflightState -SiteField $null -SiteFieldById $f -ListField $null
        $r.State | Should -Be 'Conflict'
        $r.Reason | Should -Match 'VendorName'
    }
    It 'is Conflict when the Contracts list has a Vendor field with another Id' {
        $list = [pscustomobject]@{ Id = $Other; InternalName = 'Vendor'; TypeAsString = 'Text' }
        $r = Get-VendorPreflightState -SiteField $null -SiteFieldById $null -ListField $list
        $r.State | Should -Be 'Conflict'
        $r.Reason | Should -Match 'Contracts list'
    }
    It 'is Conflict for a list field with another Id even when the site column is Present' {
        $list = [pscustomobject]@{ Id = $Other; InternalName = 'Vendor'; TypeAsString = 'Text' }
        (Get-VendorPreflightState -SiteField $Site -SiteFieldById $Site -ListField $list).State | Should -Be 'Conflict'
    }
}
