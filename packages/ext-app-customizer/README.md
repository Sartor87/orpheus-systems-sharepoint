# ext-app-customizer

Orpheus Systems application customizer for SharePoint Online (SPFx 1.23.2, React 17).

- **Header** (Top placeholder, 48 px): the Orpheus mark and wordmark linking to the Orpheus Systems website, and a
  role-aware menu on the right. Below 640 px the menu collapses into a button with a dropdown. The current page's
  item is marked `aria-current="page"`.
- **Footer** (Bottom placeholder): the Orpheus kicker, a contact link and the component version.
- **Brand toast**: once per page and at most once per 7 days per browser, shared with every other Orpheus
  component on the site.

The header renders immediately with the items that need no role, then loads the current user's roles from the
Contracts list (Contractor, ContractManager, Admin) and re-renders. If the lookup fails (list missing, no access to
groups) the header keeps the brand and the role-less items.

## Properties

| Property           | Default                           | Description                                                    |
| ------------------ | --------------------------------- | -------------------------------------------------------------- |
| `contractsListUrl` | `Lists/Contracts`                 | Web-relative URL of the Contracts list (used to derive roles). |
| `calendarPageUrl`  | `SitePages/ContractCalendar.aspx` | Web-relative URL of the contract calendar page.                |
| `menu`             | My calendar · Contracts · Holidays | Items `{ label, url, roles? }`; no `roles` = everyone.        |
| `showFooter`       | `true`                            | Set to `false` to render the header only.                      |

Menu URLs may use the tokens `{calendarPageUrl}` and `{contractsListUrl}`; relative URLs resolve against the web.

## Develop

From the repository root (container setup: `docs/dev-environment.md`):

```powershell
podman compose run --rm shell bash -c "npm test -w @orpheussystems/ext-app-customizer"
podman compose run --rm shell bash -c "npm run package -w @orpheussystems/ext-app-customizer"
.\scripts\podman.ps1 serve ext-app-customizer
```

`config/serve.json` uses `{tenantDomain}` and `{site}` placeholders. Binding the customizer to a site is done by
provisioning; for a quick check, open a page with the debug query string printed by `serve`.

## License

Apache-2.0
