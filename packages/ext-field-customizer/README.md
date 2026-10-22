# ext-field-customizer

Orpheus Systems field customizer for SharePoint Online (SPFx 1.23.2, React 17).

- **Remaining days** (`RemainingDays` column): two compact bars per row showing the remaining on-site and
  off-site days of a contract (for example "On-site 12.5 left", "Off-site 3 over").

The bars read `OnSiteTargetDays`, `OnSiteUsedDays`, `OffSiteTargetDays` and `OffSiteUsedDays` from the list item.
These columns must be part of the view; if they are not, the cell shows "—". No extra requests are made.

## Develop

From the repository root (container setup: `docs/dev-environment.md`):

```powershell
podman compose run --rm shell bash -c "npm test -w @orpheussystems/ext-field-customizer"
podman compose run --rm shell bash -c "npm run package -w @orpheussystems/ext-field-customizer"
.\scripts\podman.ps1 serve ext-field-customizer
```

`config/serve.json` uses `{tenantDomain}` and `{site}` placeholders. For a quick check, open the Contracts list
with the debug query string printed by `serve`.

## License

Apache-2.0
