# @orpheussystems/mcp-contract-calendar

MCP server for the contract calendar. It is the action layer of the "Contract Calendar" declarative
agent (`packages/agent-contract-calendar`): contractors book and remove days, contract managers and
HR read contracts grouped by vendor. Writes go through `shared-core`'s `SharePointDataService`, so
the agent and the calendar web part enforce the same rules from the same code.

Why it exists and how it is secured: `architecture/adr/XXXX-custom-mcp-server-in-typescript.md`,
`XXXX-declarative-agent-entra-sso-obo.md`, `XXXX-three-layer-audit-for-agent-actions.md`.
How to run the demo end to end: `packages/agent-contract-calendar/demo/demo-procedure.md`.

## What it serves

Stateless Streamable HTTP on port 8787 (`PORT`):

| Route | Purpose |
| --- | --- |
| `POST /mcp` | MCP requests. In `entra` mode the bearer token is validated first. |
| `GET /healthz` | Liveness, returns `{"ok":true}`. No auth. |
| `GET` and `DELETE /mcp` | 405; the server keeps no sessions. |

Tools:

| Tool | Who | What |
| --- | --- | --- |
| `get_my_contracts` | all | The caller's visible contracts with vendor, period, used and remaining days, plus the caller's roles and today's date |
| `list_contracts` (`vendor?`, `manager?`, `includeClosed?`) | managers, HR, admins | Contracts grouped by vendor. `manager` takes a name or email; several matching people give `needs_choice`. |
| `get_calendar` (`contractId`, `from`, `to`) | all, within visibility | Entries, holidays, totals and remaining days of one contract (max 366 days) |
| `book_days` (`from`, `to`, `type?`, `contractId?`, `note?`) | contractors | Books business days, max 31 days per call. Weekends, holidays and days outside the contract are skipped and reported. If a day falls in two overlapping contracts and `contractId` is missing, returns `needs_choice` and writes nothing. Result per day: `booked`, `skipped`, `failed`. |
| `remove_days` (`from`, `to`, `contractId`) | contractors | Removes days from one own active contract; days without an entry come back as `notFound` |
| `get_holidays` (`country`, `from`, `to`) | all | Public holidays of a country (max 366 days) |

Visibility: a contractor sees own contracts, a manager sees contracts where they are
`ContractManager`, HR (members of `HR_GROUP`) and site owners see all, a user with no role sees
nothing. The server pre-filters in OData and re-checks every item in memory. Only contractors can
write; anyone else gets `forbidden`.

Tool errors come back as MCP tool results with `isError` and a code: `not_found`, `forbidden`,
`invalid_input`, or `internal` for anything unexpected (no internal detail is returned).

## Run modes

| `AUTH_MODE` | `DATA_MODE` | Use |
| --- | --- | --- |
| `none` | `local` | Development. No token; the caller is fixture user `LOCAL_USER_ID`. In-memory data from the `shared-core` fixtures, with demo vendors attached. |
| `entra` | `local` | Token validation against Entra with fixture data. Tests auth without touching SharePoint. |
| `entra` | `sharepoint` | Demo and production: validate the token, on-behalf-of exchange, SharePoint as the user. |
| `none` | `sharepoint` | Rejected at start-up: no anonymous SharePoint access. |

A missing `AUTH_MODE` means `entra` (fail closed). `createApp` refuses to serve `entra` mode without
the auth middleware.

Token validation (jose, RS256): issuer pinned to the tenant in both the v1 (`sts.windows.net`) and
v2 (`login.microsoftonline.com`) forms; audience must be `API_AUDIENCE` or `CLIENT_ID` (v1 and v2
tokens carry different `aud` values). The on-behalf-of exchange (msal-node) requests `SP_SCOPE`. If
Entra answers with a consent or interaction error, the server returns 401 with
`WWW-Authenticate: Bearer` so Copilot shows the sign-in prompt; any other failure is a 500.

## Environment variables

Copy `.env.sample` to `.env` (gitignored). The `mcp` compose service reads it if present.

| Variable | Default | Required when | Meaning |
| --- | --- | --- | --- |
| `PORT` | `8787` | | Listening port |
| `AUTH_MODE` | `entra` | | `entra` or `none` |
| `DATA_MODE` | `sharepoint` | | `sharepoint` or `local` |
| `LOCAL_USER_ID` | `1` | `AUTH_MODE=none` | Fixture user id acting as the caller |
| `SITE_URL` | | `DATA_MODE=sharepoint` | `https://<tenant>.sharepoint.com/sites/<site>` |
| `TENANT_ID` | | `entra` or `sharepoint` | Entra tenant id |
| `CLIENT_ID` | | `entra` or `sharepoint` | Client id of the server's app registration |
| `CLIENT_SECRET` | | `DATA_MODE=sharepoint` | Credential for the on-behalf-of exchange (a Key Vault certificate in the Azure target) |
| `API_AUDIENCE` | | `AUTH_MODE=entra` | Expected token audience, the Application ID URI (`api://...`) |
| `SP_SCOPE` | | `DATA_MODE=sharepoint` | `https://<tenant>.sharepoint.com/AllSites.Write` |
| `CONTRACTS_LIST_URL` | `Lists/Contracts` | | Site-relative list URL |
| `ENTRIES_LIST_URL` | `Lists/CalendarEntries` | | Site-relative list URL |
| `HOLIDAYS_LIST_URL` | `Lists/Holidays` | | Site-relative list URL |
| `HR_GROUP` | `Orpheus HR` | | SharePoint group whose members get the HR role. The title match is case-sensitive. |
| `AUDIT_LOG_PATH` | stdout | | File to append audit JSON lines to |
| `LOG_REQUEST_HEADERS` | `false` | | Log the first request's headers, IP and User-Agent once, credentials redacted |

## Running locally (no SharePoint, no Entra)

Node runs only in Podman (ADR 0002). From the worktree root, in PowerShell:

```powershell
$env:COMPOSE_PROJECT_NAME = 'orpheus-agent'
podman compose run --rm shell bash -c "npm run build:shared && npm run build -w @orpheussystems/mcp-contract-calendar"
podman compose run --rm --service-ports mcp
```

With `AUTH_MODE=none`, `DATA_MODE=local`, `LOCAL_USER_ID=1` in `.env`, the server listens on
`http://localhost:8787/mcp` (stateless Streamable HTTP; `GET /healthz` for liveness).

For the SharePoint-backed demo set `AUTH_MODE=entra`, `DATA_MODE=sharepoint` and the tenant values,
run the setup script (below), and expose port 8787 with a dev tunnel
(`architecture/adr/XXXX-dev-tunnel-for-the-agent-demo.md`).

## MCP Inspector

Manual check (needs Node on some machine or a second container):

```
npx @modelcontextprotocol/inspector
```

Connect with transport "Streamable HTTP" to `http://localhost:8787/mcp`, list tools, call `book_days` with `from=2026-11-02`, `to=2026-11-06`. Expected: 5 booked. An automated equivalent runs in `src/__tests__/app.test.ts` (SDK client over HTTP).

## Tests

```powershell
$env:COMPOSE_PROJECT_NAME = 'orpheus-agent'
podman compose run --rm shell bash -c "export NODE_OPTIONS=--max-old-space-size=1536; npm run build:shared && timeout 180 npm test -w @orpheussystems/mcp-contract-calendar -- --maxWorkers=2 && timeout 180 npm run typecheck -w @orpheussystems/mcp-contract-calendar"
```

Unit tests run every tool against `LocalDataService` and the agent cast fixtures
(`src/domain/__fixtures__/agentCast.ts`, Ivan as manager): range booking skips weekends and
holidays, overlap returns `needs_choice`, manager and HR writes are refused, a manager sees only
own contracts, HR sees all grouped by vendor, totals equal `computeTotals`. Token tests use signed
test tokens (valid v1 and v2, wrong audience, foreign issuer, expired, missing `oid`).
`agentPackage.test.ts` checks that tool names in the agent's plugin manifest exist in `TOOL_NAMES`.

The setup script's Pester tests run on the host (PowerShell 7):

```powershell
Invoke-Pester packages/mcp-contract-calendar/setup/AgentDemo.Tests.ps1
```

## Logs and audit

Each tool call writes one JSON line (`src/audit/audit.ts`) to stdout or to `AUDIT_LOG_PATH`:
`time`, `correlationId` (the `x-ms-correlation-id` or `request-id` header if present, otherwise a
new UUID), `serverVersion`, `user` (`oid`, `upn`, `spUserId`), `tool`, `args`, `outcome` (`ok`,
`needs_choice`, `error`), `errorCode`, `detail` (the `booked`, `skipped`, `failed`, `removed`,
`notFound` arrays) and `tokenId` (the token's `uti`). No prompt text. The event is written even
when the tool throws.

For the demo, keep the file inside the mounted repository so it survives the container, for
example `AUDIT_LOG_PATH=/usr/app/spfx/packages/mcp-contract-calendar/audit-demo.jsonl`
(`audit-*.jsonl` is gitignored).

Known gap: booked days carry `contractId` and date, not the SharePoint item ids written. Planned fix.

With `LOG_REQUEST_HEADERS=true` the first request is logged once as `{"event":"first_request",...}`
with the values of `authorization`, `cookie`, `set-cookie`, `proxy-authorization` and `x-ms-token*`
replaced by `[redacted]`. This answers whether Copilot forwards a correlation id.

## Demo setup script

`setup/Setup-AgentDemo.ps1` (PowerShell 7.4, PnP.PowerShell 3) prepares a site provisioned with
`infra/provisioning`: the `Vendor` column, the HR group, and the 002xxx demo contracts and entries
from `setup/demo-data.json`. It is idempotent and pre-flights before any write; a `Vendor` field
with another ID or type stops it with exit code 1. It reads and writes only 002xxx items. `-WhatIf`
prints the plan without connecting. UPNs are parameters and never committed. The call is in the
demo procedure.

## Module loading

Spike results (Node 22.23.1 in the Podman dev container):

- Plain Node: `require('@orpheussystems/shared-core/sharepoint')` works, because Node 22.23 loads the ESM `@pnp/sp` through `require(esm)`. Output of the check `typeof s.SharePointDataService, typeof s.mapContract`: `function function`.
- Jest (ts-jest, CommonJS loader): importing `@orpheussystems/shared-core/sharepoint` fails with `Must use import to load ES Module: .../node_modules/@pnp/sp/webs/index.js`.

Rule: unit-tested modules import pure shared-core code only. That means the root barrel `@orpheussystems/shared-core`, and for mappers and queries the deep paths `@orpheussystems/shared-core/lib/data/spMappers` and `@orpheussystems/shared-core/lib/data/spQueries`. Modules that import PnPjs (`sharepoint/createSpfi.ts`, `sharepoint/SharePointContractDirectory.ts`, `sharepoint/agentRoles.ts`, `context/contextFactory.ts`) are kept thin and are not imported by Jest tests.

`jose` 6 is ESM-only too; Jest transpiles it through ts-jest with `allowJs`.

shared-core must be built (`npm run build:shared`) before the tests run.

## Developer notes: type checking and memory

Jest transpiles only (`isolatedModules`); run `npm run typecheck` for type errors. The MCP SDK `registerTool` is called through a loosely typed wrapper in `src/mcp/createMcpServer.ts` because its zod-driven generics exhaust memory in tsc with zod 3.25.

Background: with MCP SDK 1.32 and zod 3.25, letting `registerTool` infer handler types from the zod
shapes pushed tsc to about 4.2 GB and crashed the host. The `ToolRegistrar` wrapper keeps zod as the
runtime validator, and each handler casts its arguments to its own type.

Cap every Node run in the container: `NODE_OPTIONS=--max-old-space-size=1536`, a `timeout` around
the command, and `--maxWorkers=2` for Jest.

## Known risks

- `SharePointDataService.upsertEntry` deletes the sibling entry and adds the new one in one batch,
  but the batch is not transactional: the delete can succeed while the add fails. `book_days`
  reports such a day as failed. The fix belongs in `shared-core`.
- Large lists need indexes on the filtered columns: Contracts `Contractor`, `ContractManager` and
  `Status` (provisioned by `infra/provisioning`), `Title` for the setup script's `startswith`
  filter, and `Vendor` if vendor filters run on a large list.
- Guest contractors are not verified with declarative agents.
