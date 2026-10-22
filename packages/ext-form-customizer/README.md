# ext-form-customizer

Orpheus Systems form customizer for SharePoint Online (SPFx 1.23.2, React 17).

- **Contract form** (`ContractForm`): new, edit and display form for the Contracts list, with field validation and
  overlap detection for contracts of the same contractor.
  - New / Edit: two-column Fluent UI layout (one column under 640 px), people pickers for contractor and manager,
    date pickers (`yyyy-mm-dd`, also accepts `d.m.yyyy`), targets in steps of 0.5. Save stays disabled until the form
    is valid; field errors show when a field is left and all at once when Save is tried.
  - When the contractor has another Active or Draft contract whose period intersects, a warning offers
    **Save anyway** / **Cancel** (Closed contracts are ignored). The check never blocks saving.
  - Display: the same fields read-only, with an **Open calendar** link to the calendar page for the contract.

## Properties

`ClientSideComponentProperties` of the form customizer (all optional):

| Property | Default | Meaning |
| --- | --- | --- |
| `codePattern` | `^\d{4}-[A-Za-z]+(-[A-Za-z]+)*$` | Regular expression for the contract code. An invalid pattern falls back to the default. |
| `defaultCountry` | `BG` | Country preset on new contracts. |
| `calendarPageUrl` | `SitePages/ContractCalendar.aspx` | Calendar page, relative to the web (server-relative or absolute also work); `?contractId=<id>` is appended. |

The package does not provision anything. Binding the form customizer to the `Orpheus Contract` content type is done by
the provisioning scripts, not by this package.

## Develop

From the repository root (container setup: `docs/dev-environment.md`):

```powershell
podman compose run --rm shell bash -c "npm test -w @orpheussystems/ext-form-customizer"
podman compose run --rm shell bash -c "npm run package -w @orpheussystems/ext-form-customizer"
.\scripts\podman.ps1 serve ext-form-customizer
```

`config/serve.json` has `contractNew`, `contractEdit` and `contractDisplay` configurations. Replace the `{tenantDomain}`
and `{site}` placeholders locally; do not commit tenant URLs.

## License

Apache-2.0.
