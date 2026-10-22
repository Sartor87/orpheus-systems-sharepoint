# ext-form-customizer

Orpheus Systems form customizer for SharePoint Online (SPFx 1.23.2, React 17).

- **Contract form** (`ContractForm`): new, edit and display form for the Contracts list, with field validation and
  overlap detection for contracts of the same contractor.

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
