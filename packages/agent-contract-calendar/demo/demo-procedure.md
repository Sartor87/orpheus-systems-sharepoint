# Contract agent demo procedure

How to run the Contract Calendar agent against a developer tenant: the MCP server runs locally in
Podman, a dev tunnel exposes it, and the sideloaded declarative agent calls it from Copilot Chat.
Nothing is deployed to Azure (`architecture/adr/XXXX-dev-tunnel-for-the-agent-demo.md`).

Every step that changes the tenant (app registration, consent, group, list data, sideloading) is
done by or with the owner.

## About the demo data

- **People.** The demo uses five sandbox accounts, passed to the setup script as UPN parameters and
  never committed: Ivan (contract manager of all demo contracts), Emilia (HR), and three
  contractors, Alex, Ionna and Boyan.
- **Name clash.** The web part's `shared-core` fixtures have "Ivan Petrov" as a *contractor*. In the
  agent demo Ivan is the *manager*, and the sandbox accounts are different people from the fixture
  people. Do not mix the two when explaining the demo.
- **Vendors are fictional.** Kuker Consulting, Samodiva Systems and Sofia SharePoint Chads are
  invented names. "SharePoint" is a Microsoft trademark and is used here only as fictional demo
  data.
- **Contract numbers.** Demo contracts use the 002xxx series (`NNNNNN_<YEAR>`); 001xxx belongs to the
  web part's seed and is never touched by the agent's setup script.

| Title | Contractor | Vendor | Period | Seeded entries |
|---|---|---|---|---|
| `002101_2026` | Ionna | Samodiva Systems | 2026-03-02 to 2026-12-18 | 2026-10-05 to 2026-10-08 |
| `002102_2026` | Alex | Kuker Consulting | 2026-01-12 to 2026-11-30 | 2026-10-12 to 2026-10-15 |
| `002103_2027` | Alex | Kuker Consulting | 2026-11-16 to 2027-10-29 | 2026-12-01 to 2026-12-03 |
| `002104_2026` | Boyan | Sofia SharePoint Chads | 2026-05-04 to 2027-04-30 | 2026-10-19 to 2026-10-21 |

`002102_2026` and `002103_2027` overlap from 2026-11-16 to 2026-11-30. The setup script leaves that
window empty so the overlap question can be shown live. All contracts are in country `BG`.

## The three demo users

| User | Role | What the demo shows |
|---|---|---|
| Alex | Contractor at Kuker Consulting, with the bridge pair | Booking a range; the agent asking which contract an overlap day counts against (`needs_choice`) instead of guessing; holidays and weekends skipped and reported; removing a day |
| Ivan | Contract manager of all four demo contracts | Contracts grouped by vendor (three vendors); remaining days on a contract; booking for someone else refused |
| Emilia | HR, member of `Orpheus HR` with Read | All contracts filtered by manager ("Ivan's vendors"); HR is read-only, booking refused |

The prompts and expected tool calls are in `prompt-set.md`.

## Prerequisites

1. A developer tenant with Copilot Chat. No Microsoft 365 Copilot licence is needed: custom actions
   (MCP plugins) work in unlicensed Copilot Chat; developer mode debug cards do not.
2. Teams admin center: custom app upload allowed for the demo accounts. Agents Toolkit shows
   "Custom App Upload Enabled" and "Copilot Access Enabled" for the signed-in account.
3. A test site provisioned with `infra/provisioning/Provision-OrpheusSite.ps1 -SeedDemoData -Country BG`
   (lists, content types, indexes, BG holidays including 2026-12-24 to 2026-12-26).
4. An Entra app registration for the MCP server: exposed API with an Application ID URI,
   delegated SharePoint `AllSites.Write` with admin consent, and a client secret for the
   on-behalf-of exchange. Do not reuse the provisioning app registration. The Entra SSO
   registration for Copilot needs the tunnel URL, so it is done later, in step 5.
5. PowerShell 7.4 with PnP.PowerShell 3.0+, and your own PnP PowerShell app registration client id
   (see `infra/provisioning/README.md`).
6. Podman with the compose volumes initialised (`fix-perms`, `install`), `devtunnel` CLI on the
   host, VS Code with the Microsoft 365 Agents Toolkit extension.

## Start order

Run from the repository root. Steps 3 and 4 each keep a terminal busy (the `mcp` service and
`devtunnel host` run in the foreground), so give each its own terminal and use a third one for the
remaining steps.

### 1. Setup script

```powershell
./packages/mcp-contract-calendar/setup/Setup-AgentDemo.ps1 `
  -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ClientId <client-id> `
  -IvanUpn <upn> -EmiliaUpn <upn> -AlexUpn <upn> -IonnaUpn <upn> -BoyanUpn <upn> -WhatIf
```

Read the plan, then run the same command without `-WhatIf`. It adds the `Vendor` column (or reports
it unchanged if the HTML-timesheet script created it first), the `Orpheus HR` group with Emilia, the
demo contracts and entries, and recomputes used days. Run it a second time: every step must report
unchanged. If it stops with exit code 1 on a conflicting `Vendor` field, nothing was written; resolve
the conflict first.

### 2. Server configuration

Copy `packages/mcp-contract-calendar/.env.sample` to `.env` and set:

```
AUTH_MODE=entra
DATA_MODE=sharepoint
SITE_URL=https://<tenant>.sharepoint.com/sites/<site>
TENANT_ID=<tenant-id>
CLIENT_ID=<client-id>
CLIENT_SECRET=<client-secret>
API_AUDIENCE=<application-id-uri>
SP_SCOPE=https://<tenant>.sharepoint.com/AllSites.Write
HR_GROUP=Orpheus HR
AUDIT_LOG_PATH=/usr/app/spfx/packages/mcp-contract-calendar/audit-demo.jsonl
LOG_REQUEST_HEADERS=true
```

### 3. Start the `mcp` service

```powershell
$env:COMPOSE_PROJECT_NAME = 'orpheus-agent'
podman compose run --rm shell bash -c "npm run build:shared && npm run build -w @orpheussystems/mcp-contract-calendar"
podman compose run --rm --service-ports mcp
```

Expect a `{"event":"listening","port":8787,"authMode":"entra","dataMode":"sharepoint"}` line.
Check `http://localhost:8787/healthz`. A `POST /mcp` without a token must return 401.

### 4. Host the dev tunnel

Once:

```powershell
devtunnel user login
devtunnel create <tunnel-id> --allow-anonymous
devtunnel port create <tunnel-id> -p 8787 --protocol http
```

Each session:

```powershell
devtunnel host <tunnel-id>
```

On the very first run open the "Connect via browser" URL once and select Continue. The public URL
stays the same across sessions; its host name is `<tunnel-host>` below.

### 5. Entra SSO registration for Copilot

Needs the tunnel host from step 4, so it comes after it. Once per tunnel:

1. In the Teams developer portal, Tools, "Microsoft Entra SSO client ID registration", create a
   registration with base URL `https://<tunnel-host>` and the client id of the server's app
   registration. Keep the generated registration id for `MCP_AUTH_REFERENCE_ID`. (Agents Toolkit
   can do this when the MCP action is added with "Entra SSO".)
2. In the app registration: add the registration's Application ID URI to `identifierUris`, add
   the `oAuthConsentRedirect` redirect URI under Web authentication, and pre-authorise the
   Enterprise token store client under Expose an API (exact values in `../README.md`, "Entra SSO
   setup").
3. If that Application ID URI differs from `API_AUDIENCE` in the server's `.env`, update
   `API_AUDIENCE` and restart the `mcp` service (step 3).

### 6. Provision the agent with Agents Toolkit

In `packages/agent-contract-calendar`, copy `env/.env.dev.sample` to `env/.env.dev`, set
`MCP_SERVER_URL=https://<tunnel-host>/mcp` and `MCP_AUTH_REFERENCE_ID` (from step 5). Then Agents
Toolkit, Lifecycle, Provision. The owner approves each provision run.

### 7. Copilot Chat

Sign in as one of the three demo users, open `https://m365.cloud.microsoft/chat`, pick the Contract
Calendar agent (the name carries the `APP_NAME_SUFFIX`) and use the prompts from `prompt-set.md`.
The first call per user may show a sign-in or consent prompt; that is the 401 path working.

Watch the server output and the audit file while prompting. Each tool call adds one line.

## After the demo

- Remove days booked during the demo (prompt "remove …" as Alex, or delete the items in
  CalendarEntries) so the overlap window 2026-11-16 to 2026-11-30 is empty for the next run. The
  setup script does not delete anything.
- Stop `devtunnel host` (Ctrl+C) and the `mcp` container. Delete the tunnel when the demo work is
  finished (`devtunnel delete <tunnel-id>`).
- Keep `audit-demo.jsonl` as evidence for the verification log; it is gitignored.

## Verification log

Open items to check on the live run. The owner fills in the result columns. Sources: the research's
"To verify on the dev tenant" list, and the items from the agent package and setup script that were
written from documentation without a live run.

| # | Check | How | Result | Date | Evidence |
|---|---|---|---|---|---|
| V1 | SharePoint `ListItem*` audit records for an agent-made change show our app's client id, so agent changes can be told apart from web part changes | Book a day as Alex; Purview Audit search on CalendarEntries | | | |
| V2 | Copilot forwards a conversation or request id to the MCP server | `LOG_REQUEST_HEADERS=true`; read the `first_request` line | | | |
| V3 | `CopilotInteraction` records for the sideloaded agent show `AISystemPlugin` with our plugin | Purview Audit search, workload Copilot | | | |
| V4 | Cold start plus on-behalf-of plus a five-day `book_days` stays under the action timeout (about 10 s) | Restart the container, book five days, time the call in the server log | | | |
| V5 | `m365agents.yml` v1.9 and its action list match a freshly scaffolded "Start with an MCP server" project | Scaffold a new project with the toolkit, diff | | | |
| V6 | App manifest 1.30, declarative agent manifest v1.8 and plugin manifest v2.4 (including the `RemoteMCPServer` runtime with dynamic discovery and conversation starters) are accepted by provision | Provision; read toolkit validation output | | | |
| V7 | Entra SSO: consent or interaction errors from the on-behalf-of exchange lead to the sign-in prompt in Copilot (401 path) | First call as a user who has not consented | | | |
| V8 | Negative cases: no token gives 401; a token for another audience gives 401 | Call `/mcp` through the tunnel without and with a foreign token | | | |
| V9 | Manager (Ivan) and HR (Emilia) booking is refused by the server, not only by the instructions | Prompts 9 and 10 in `prompt-set.md`; audit `errorCode: forbidden` if the tool was called | | | |
| V10 | HR role is detected from `Orpheus HR` membership (exact title match) | Emilia: `get_my_contracts` returns role `HR` | | | |
| V11 | Copilot asks for confirmation before `book_days` with dynamic tool discovery (no per-function confirmation hint in the manifest) | Prompt 1; note whether the agent restates and confirms | | | |
| V12 | Setup script second run reports every step unchanged | Run step 1 twice | | | |
| V13 | Setup script and the HTML-timesheet script create the same `Vendor` column whichever runs first | Run both scripts on a fresh site in either order | | | |
| V14 | Guest contractors can use the agent in Copilot Chat | Invite a guest, map it as a contractor, try prompt 1 | | | |
