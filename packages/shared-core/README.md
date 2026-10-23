# @orpheussystems/shared-core

The domain layer shared by the web part, the extensions and the MCP server: models, business rules, date handling and the data service. It has no UI and no SPFx dependency.

## Entry points

| Import | Contents |
|---|---|
| `@orpheussystems/shared-core` | Models (`Contract`, `CalendarEntry`, `Holiday`, `EntryType`, roles), `dates` (`DateKey` helpers), `rules` (totals, remaining days, blocked days, who may create or edit a contract), `IDataService`, `LocalDataService`, timesheet template data |
| `@orpheussystems/shared-core/sharepoint` | `SharePointDataService` (PnPjs 4), the list mappers and queries, list lookup and role derivation. Imports `@pnp/sp`, a peer dependency, so code that does not talk to SharePoint should not import it |

## The rules live here once

- One calendar entry per contractor per date, across all of the contractor's contracts: writing a day removes the contractor's entry on that date in any other contract ([ADR 0008](../../architecture/adr/0008-one-calendar-entry-per-contractor-per-date.md)).
- Weekends and the holidays of the contract's country (or `*`) are blocked.
- Used on-site and off-site days are recomputed on every affected contract after every write.
- SharePoint date-only values are read with `isoToDateKey`, which rounds to the nearest UTC midnight, and list filters use whole-day windows.
- Contracts with a blank start or end date have no period and are not shown in the calendar.

`LocalDataService` applies the same rules in memory over the fixtures in `src/data/fixtures/` (demo contracts, entries, holidays and users). The web part uses it in debug builds, the MCP server in `DATA_MODE=local`, and the tests everywhere ([ADR 0003](../../architecture/adr/0003-idataservice-local-and-sharepoint.md)).

## Develop

```powershell
podman compose run --rm shell bash -c "npm run build -w @orpheussystems/shared-core"
podman compose run --rm shell bash -c "npm test -w @orpheussystems/shared-core"
```

The SPFx packages consume the compiled `lib/`, so build this package (`npm run build:shared` at the root) before building them.

## License

Apache-2.0. See the repository's [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
