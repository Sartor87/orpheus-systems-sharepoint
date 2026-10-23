# Research: a SharePoint agent for the contract calendar

Date: 2026-10-22
Author: Kiril Iliev (research run by Claude)
Status: research complete, handed over to the architect. Start with "Handover to the architect" at the end.
Scope: the agent only. The calendar web part (`packages/wp-contract-calendar`) is being worked on in parallel and is out of scope.

## Question

Build an agent that contractors and contract managers can talk to and that can do everything the
calendar web part does, for example "book me on-site days from 01.12 to 05.12". Two things to settle:

1. Do we need a custom MCP server, or can an off-the-shelf agent write to the three lists on its own?
2. How do we build and test this on a Microsoft 365 developer tenant?

## Verdict

**Yes, build a custom MCP server, and put the agent on top of it as a declarative agent made with
the Microsoft 365 Agents Toolkit.** The MCP server reuses `@orpheussystems/shared-core`
(`SharePointDataService`, `rules.ts`, `dates.ts`) server-side, so the agent and the web part enforce
the same invariants from the same code. The agent calls the server through Microsoft Entra SSO and the
server calls SharePoint on behalf of the signed-in user, so SharePoint permissions and the role
derivation from §7 of the design spec keep working unchanged.

Testing on the developer tenant is possible without a Copilot licence, with one limit: custom actions
(MCP plugins) are allowed in Copilot Chat for unlicensed users, but developer mode and the SharePoint
knowledge capability are not. We do not need SharePoint knowledge, because the MCP server returns the
data. Details and a step list are in "How to test" below.

## Why a generic SharePoint tool is not enough

The web part is not a thin CRUD layer. `SharePointDataService.upsertEntry` does, in one call:

- rejects weekends and holidays for the contract's country (`isBlocked`);
- rejects dates outside the contract period;
- finds the contractor's sibling contracts and deletes any entry on that date across all of them
  (ADR 0008: one entry per contractor per date, the overlap dialog moves a day, it never duplicates);
- adds the new entry and recomputes `OnSiteUsedDays` / `OffSiteUsedDays` on every affected contract,
  all in one batch.

`getMyContracts` filters by role (`contractsFilter`), managers are read-only, Closed contracts are
hidden. Any agent that writes list items through a generic tool has to replay this logic from prose
instructions, per day, across several tool calls. For "01.12 to 05.12" that is five days times
four or five calls each, with the LLM deciding which existing entry to delete. That will drift from
the web part and corrupt the used-days counters.

The off-the-shelf routes that were checked, and why each one was rejected:

| Route | What it offers | Why not |
|---|---|---|
| Copilot Studio first-party **SharePoint MCP** server (`mcp_SharePointRemoteServer`) | list item create / update / delete, columns, sites | Preview, and Microsoft marks the application-specific Microsoft 365 MCP servers as backward-compatibility only, "shouldn't be used in production environments or new projects". Generic CRUD, no business rules. |
| **Work IQ MCP** (`create_entity`, `update_entity`, `delete_entity` on resource paths) | the replacement for the above | Preview. Mutations are blocked by tenant policy by default and need an admin to allow them per path. Documented hosts are Copilot Studio, Foundry, GitHub Copilot CLI; not the Agents Toolkit declarative agent route. Generic CRUD again. |
| **Copilot in SharePoint skills** (convert-agent-file-to-skill, mid-November 2026) | repeatable workflows inside a site, can "interact with SharePoint content such as lists" | "Skills can't connect to external systems or execute custom code." Rules would live in prose. Needs a Microsoft Copilot licence for every user, and the skill is reachable only from Copilot in SharePoint, not from Teams or the Copilot app. |
| **Copilot Studio agent** + SharePoint connector actions / agent flows | no custom hosting, SharePoint channel exists today | Rules would be rebuilt in Power Automate flows, a second implementation next to `shared-core`. Billing is Copilot Studio capacity / Copilot Credits per message. Reasonable fallback if hosting an MCP server is unwanted. |
| **API plugin** (OpenAPI) straight at SharePoint REST or Graph | no server to host | Same "rules in prose" problem, plus the agent would need per-user tokens for SharePoint; the documented pattern is an API or MCP server you own, secured with Entra SSO, which then calls SharePoint. |
| The current **SharePoint agent builder / `.agent` files** | easy, lives in the site | Q&A over content only, no actions. The `.agent` format stops working after March 2027. |

MCP versus API plugin for our own server: both are supported as declarative agent actions, both use
the same Entra SSO auth config. MCP is the Agents Toolkit default, gets dynamic tool discovery (no
repackaging when tools change), and can later return MCP Apps widgets (a month grid in the chat). Pick
MCP.

## Proposed architecture

```
Contractor / manager
   │  Copilot Chat (m365.cloud.microsoft/chat), Teams, later the SharePoint Agent Chat web part
   ▼
Declarative agent  "Contract Calendar"  (Agents Toolkit project, declarativeAgent.json + ai-plugin.json)
   │  Entra SSO auth config → token with audience = MCP server App ID URI
   ▼
MCP server  (Node 22 + TypeScript, @modelcontextprotocol/sdk, streamable HTTP)
   │  validates token, on-behalf-of exchange → https://<tenant>.sharepoint.com/AllSites.Write
   │  PnPjs v4 (@pnp/sp + @pnp/nodejs) with the user's token
   │  reuses shared-core: SharePointDataService, deriveRoles, rules.ts, dates.ts
   ▼
SharePoint lists: Contracts, CalendarEntries, Holidays (same lists as the web part)
```

Why TypeScript for the server: `shared-core` is TypeScript and `SharePointDataService` only needs an
`SPFI`. PnPjs runs in Node with `@pnp/nodejs` and a bearer-token behaviour, so the server gets the
exact `upsertEntry` / `deleteEntry` semantics the web part has. A .NET server would re-implement
them. Hosting: Azure Functions Flex Consumption (there is an official "host MCP SDK servers on Azure
Functions" template) or Azure Container Apps; either scales to zero.

### Tools (first cut, one tool per thing the web part can do)

| Tool | Who | Maps to |
|---|---|---|
| `get_my_contracts` | both | `getMyContracts` plus derived roles |
| `get_calendar(contractId, from, to)` | both | `getEntries` + `getHolidays` + `computeTotals` / `computeRemaining` in one response, so the agent can answer "how many on-site days do I have left" without arithmetic |
| `book_days(from, to, type, contractId?)` | contractor | loops business days, `upsertEntry` per day; skips weekends and holidays and reports them; if more than one contract covers a date and `contractId` is missing, returns `needs_choice` with the candidates so the agent asks ("Count against 001185_2026 or 001186_2027?") instead of guessing |
| `remove_days(from, to, contractId)` | contractor | `deleteEntry` per day |
| `get_holidays(country, from, to)` | both | `getHolidays` |
| `get_contractor_calendar(contractId, from, to)` | manager | same as `get_calendar`; managers are read-only, the server refuses writes for them (mirrors the web part) |

Deferred: timesheet PDF. The web part builds it client-side with pdfmake. A server-side
`generate_timesheet` that writes the PDF to a document library is a phase 2; phase 1 returns a deep
link to `ContractCalendar.aspx?contractId=…` (the page already honours that parameter).

Keep the tool count under ten; above that the orchestrator's selection quality degrades (documented
limit). Tool descriptions carry the rules in words too ("dates are yyyy-MM-dd; weekends and holidays
are skipped") because that is what the orchestrator reads when it fills parameters.

### Agent instructions, the parts that matter

- Today's date comes from the host. For "01.12 to 05.12" assume the next occurrence that falls inside
  an active contract, and state the resolved dates back before booking.
- Default type is on-site full day unless the user says half or off-site.
- Confirm the plan (dates, type, contract) in one message, then call `book_days` once.
- Never claim a day was booked unless the tool result says so; list skipped days and why.
- Managers: answer questions, never book.

### Identity and permissions

- One Entra app registration secures the MCP server (expose an API, Application ID URI). Agents
  Toolkit creates the Entra SSO auth config and writes `OAuthPluginVault` + `reference_id` into
  `ai-plugin.json`. Then, by hand: add the generated Application ID URI to `identifierUris`, add
  `https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect` as a Web redirect URI, and add
  the Enterprise token store client `ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b` as an authorised client
  application. The server must accept that URI as audience.
- The server does an on-behalf-of exchange for a SharePoint delegated scope (`AllSites.Write` is
  enough for list items; the provisioning app uses `AllSites.FullControl`, do not reuse it). Tenant
  admin consent once. If the OBO exchange fails for consent, return 401 so Copilot shows the sign-in
  prompt (documented behaviour).
- Because every call runs as the user, `deriveRoles` and the role filters work unchanged, and
  SharePoint still enforces list permissions. The known gap from §7 (contractors hold Contribute on
  Contracts) is unchanged by the agent; the server, like the web part, is what stops a contractor
  editing a contract.

## How to test on the developer tenant

### 1. Find out which kind of developer tenant you have

Developer Program sandboxes come in two kinds now. Instant sandboxes issued to new eligible members
(rollout started at Ignite, November 2025; documented as standard from July 2026) are
commerce-enabled: Microsoft 365 admin center → Marketplace lets you buy Microsoft 365 Copilot
licences from inside the sandbox. Older sandboxes are not, and "an existing developer tenant that
doesn't already have commerce capability can't be directly converted". Check: admin center →
Marketplace → search "Microsoft 365 Copilot" → is **Buy** offered? Also check the Developer Program
dashboard for an upgrade / migrate banner.

Eligibility for the programme itself is now limited to Visual Studio Professional/Enterprise
subscribers, ISV Success, MAICPP partners and Premier/Unified support customers. A replacement
sandbox is possible only after the current one is 60 days old, and only if you still qualify.

**Result for our tenant (checked 2026-10-22):** commerce-enabled. Admin center → Marketplace
lists prices and shows "Microsoft Copilot is available to order now". Buying goes through the new
billing experience: create a billing account and profile, accept the Microsoft Customer Agreement.
**Decision (owner, 2026-10-22): no Copilot licence for now**, until the new SharePoint agent
framework (Agent Chat web part, post-`.agent` upgrade path) is clearer. Development and testing run
unlicensed, as described in step 2. The Copilot Studio Trial offered in the same Marketplace does
not help: it gives Copilot Studio message capacity, not developer mode in Copilot Chat.

### 2. What works without a Copilot licence (unlicensed Copilot Chat)

From the official capability table (prerequisites page, "Agent capabilities and licensing models"):

| Capability | Copilot Chat, no licence, no PAYG | Licensed |
|---|---|---|
| Declarative agents, custom instructions | ✅ | ✅ |
| **Custom actions (MCP / API plugins)** | ✅ | ✅ |
| MCP Apps widgets | ✅ | ✅ |
| Knowledge: SharePoint, connectors, embedded files | ❌ | ✅ |
| `-developer on` debug cards | ❌ (licensed experience only) | ✅ |

So the agent above is fully exercisable on a non-commerce sandbox: sideload, open
`https://m365.cloud.microsoft/chat`, pick the agent (name ends in `dev`), and the MCP tools run. The
things you lose are the debug card that shows which tool was matched and why, and SharePoint content
grounding, which this agent does not use. If the tenant is commerce-enabled, one Copilot licence on
one test account gives you developer mode as well; that is worth it during tool-description tuning.

### 3. Tenant preparation (once)

1. Teams admin center → Teams apps → Setup policies → Global → **Upload custom apps: On**. Agents
   Toolkit shows "Custom App Upload Enabled" and "Copilot Access Enabled" under the account; the
   second one is needed for provisioning.
2. Provision the three lists on a test site with the existing script and seed demo data:
   `infra/provisioning/Provision-OrpheusSite.ps1 -SeedDemoData -Country BG`. The fixtures have a
   contractor, a manager, an active contract and a bridge pair, which is exactly what the overlap
   path needs.
3. Map two of the 24 sandbox users to the fixture contractor and manager (Contractor /
   ContractManager person columns) so each role can be tested with a real sign-in.
4. Entra: app registration for the MCP server (step "Identity and permissions" above), admin consent
   for the SharePoint delegated scope.

### 4. Development loop

1. **Unit tests, no tenant.** The MCP server's tools take an `IDataService`. Test them against
   `LocalDataService` and the fixtures, the same way `useCalendarState` is tested today: booking a
   range skips the holiday, overlap returns `needs_choice`, manager write is refused, totals match
   `computeTotals`. This is where the DoD for every tool lives.
2. **Local MCP server + MCP Inspector.** Run the server locally (auth **None** while developing; the
   docs allow it and tell you to add auth before production), point `npx @modelcontextprotocol/inspector`
   at it, call tools by hand. For SharePoint-backed runs locally, acquire a user token with
   `@azure/identity` interactive login and pass it as the bearer, so `SharePointDataService` talks to
   the real lists before any Copilot is involved.
3. **Sideload.** Agents Toolkit → Create a New Agent → Declarative Agent → Add an Action → Start with
   an MCP server → URL of the server (a dev tunnel while local, see "Debug MCP and API plugins
   locally" in the extensibility docs) → Lifecycle → Provision. Press F5 to open Copilot Chat on the
   agent. Switch the auth type to Entra SSO before testing the role paths, because with auth None
   there is no user to run as.
4. **Prompt set.** Keep a file of prompts with expected tool calls: "book me on-site 01.12 to
   05.12", "half day off-site next Friday", "how many on-site days are left on 001185", "remove the
   3rd", a date on a holiday, a date in the overlap window, a manager asking to book (must refuse).
   With a licensed account, `-developer on` shows matched versus selected functions; without it,
   verify through the server logs and the list contents.
5. **Where users will meet it.** Copilot Chat and Teams work now. On a SharePoint page the target is
   the Agent Chat web part (roadmap 575298, "coming soon" in the upgrade article); the web part that
   exists today (SharePoint agent web part, roadmap 481512, GA August 2025) hosts `.agent` files,
   which retire in March 2027, so do not build the SharePoint placement on it. Until the Agent Chat
   web part ships, a Button web part linking to the agent's share link in the Copilot app is the
   placement.

### 5. What to budget

- Azure: a Functions Flex Consumption plan or a Container App; near zero at test volume.
- Copilot: optional single licence on the dev tenant for developer mode, only if commerce is enabled.
- Production: contractors who are **guest users** in the tenant are an open question. The licensing
  table talks about Microsoft 365 users; guest access to declarative agents and to Copilot Chat is
  not covered by the pages read for this report and must be verified before promising contractors
  the agent.

## Hosting and audit (added 2026-10-22, second pass)

### Hosting: Azure Container Apps, minReplicas 1 (recommended)

| | Container Apps | Functions Flex Consumption |
|---|---|---|
| Runtime | our own image; Node + Express + `@modelcontextprotocol/sdk`, unchanged | Functions host; MCP extension or "self-hosted MCP SDK" custom handler |
| Local parity | same image under Podman, which is how this repo already builds | Functions Core Tools on the host, a second toolchain |
| Cold start | none with `minReplicas: 1` | none with always-ready instances (billed) |
| Entra auth | built-in auth or validate in code | built-in auth or validate in code |
| Logs | console and system logs to Log Analytics out of the box | Application Insights out of the box |
| Billing | per vCPU/GiB-second, one small replica always on | per execution plus always-ready instances |

Both are viable. Container Apps wins here on toolchain fit: no Node on the host, Podman everywhere,
and the server stays a plain HTTP app that would also run on App Service or AKS. Keep one replica
warm either way; Copilot gives an action roughly 10 seconds, and a cold start plus an on-behalf-of
exchange plus a SharePoint batch can exceed that.

### Audit: three layers, two are free

1. **Copilot interaction, automatic.** Every prompt to a declarative agent produces a
   `CopilotInteraction` record (workload `Copilot`) in Purview Audit Standard. It carries the user,
   time, `AppHost`, `AgentId` / `AgentName` / `TargetAgentName`, `AISystemPlugin` (our MCP plugin's
   name, id, version) and `AccessedResources`. Agents with dynamic tool discovery are explicitly
   covered. No code needed.
2. **SharePoint change, automatic.** `ListItemCreated`, `ListItemUpdated`, `ListItemDeleted` /
   `ListItemRecycled` on CalendarEntries and Contracts. Because the server uses an on-behalf-of
   delegated token, the actor is the real user, not `app@sharepoint`. This is the strongest reason
   never to switch the server to app-only access. Verify on the dev tenant that the record also
   shows our app's client id, so agent-made changes can be told apart from web-part changes.
3. **The tool call itself, our code.** Neither record above says "book_days 01.12–05.12 skipped
   08.12 holiday, moved 03.12 from 1185 to 1186". The server writes one structured audit event per
   tool call: user object id and UPN, tool, arguments, outcome per day, list item ids touched, Entra
   token id (`uti`), correlation id, server version. Destination: a dedicated Log Analytics table
   with long retention (or archive), separate from diagnostic logs, no prompts or free text beyond
   the arguments.

Optional fourth layer: the Purview `contentActivities` Graph API can push the tool call into Purview
so it appears next to the Copilot record (`ConnectedAIAppInteraction`). It is designed for
prompt/response content of custom AI apps, some of those records are billed pay-as-you-go, and
Copilot already logs the prompt. Only add it if compliance requires the tool call inside Purview
rather than Log Analytics.

Retention: Audit Standard keeps records 180 days; E5 users (the dev sandbox is E5) get one year for
SharePoint and Entra records. Longer needs Audit Premium retention policies. Contractors on a
non-E5 licence get 180 days.

Open: whether Copilot forwards a conversation or request id to the MCP server. If it does, log it
and the three layers join exactly; if not, they join on user plus timestamp. Check on the dev tenant
by logging the full request headers once.

## Borrow

- `shared-core` as-is in the server: `SharePointDataService`, `deriveRoles`, `rules.ts`, `dates.ts`,
  `LocalDataService` + fixtures for tests. Zero duplication of rules.
- `infra/provisioning` and the seed data for the test site.
- The Agents Toolkit MCP walkthrough's project layout (`appPackage/declarativeAgent.json`,
  `ai-plugin.json`, `manifest.json`) and its Entra SSO steps.
- Azure sample "Remote MCP Functions with .NET / TypeScript" for hosting and the OBO auth tool as a
  pattern for the on-behalf-of exchange.

## Risks in our code

- `upsertEntry` reads all entries of every affected contract to recompute totals; a five-day booking
  does that five times. Fine for the web part, noticeable from a tool call. A `book_days` tool should
  batch per contract, or `shared-core` needs a range variant later. Do not change `shared-core` while
  the web part work is in flight; wrap for now.
- The overlap choice must never be guessed by the agent. The `needs_choice` result is the safeguard;
  test it explicitly.
- Dates in chat are ambiguous ("01.12" = 1 December in Bulgarian, 12 January in US). Instructions
  pin dd.mm and the agent echoes the resolved ISO dates before booking.
- Both the agent and the web part can write the same day at the same time. The service already
  deletes-then-adds in one batch, so the result is last-writer-wins without duplicates; acceptable,
  document it.
- `compose.yml` needs an `nm-<package>` volume for any new package (dev-environment.md), so adding
  `packages/mcp-contract-calendar` touches shared dev infrastructure. Needs a human-reviewed change.

## Skip

- Copilot in SharePoint skills for the booking action (no custom code, licence per user, site-only).
- The first-party SharePoint MCP server and Work IQ mutations as the write path (preview, generic
  CRUD, not documented for the Agents Toolkit route).
- Upgrading or building anything on `.agent` files.
- A .NET MCP server; it only makes sense if the team wants the kit's .NET workflow more than rule
  reuse.

## Handover to the architect

### Decided so far

| # | Decision | By | Basis |
|---|---|---|---|
| D1 | The agent gets its business logic from a custom MCP server, not from a generic SharePoint tool, skill or Copilot Studio flow | research verdict | "Why a generic SharePoint tool is not enough" |
| D2 | MCP server in TypeScript, reusing `shared-core` (`SharePointDataService`, `deriveRoles`, `rules.ts`) without changes | research verdict | rule reuse, ADR-003, ADR-008 |
| D3 | Front end of the agent: declarative agent built with Microsoft 365 Agents Toolkit, MCP plugin, Entra SSO | research verdict | "Proposed architecture" |
| D4 | Server calls SharePoint with an on-behalf-of delegated token, never app-only | research verdict | permissions plus audit, see "Audit" |
| D5 | Hosting: Azure Container Apps, one replica always warm (recommended, Functions Flex is the fallback) | recommendation, owner to confirm | "Hosting" |
| D6 | Audit in three layers; our own per-tool-call audit event to a dedicated Log Analytics table | recommendation, owner to confirm | "Audit" |
| D7 | No Microsoft 365 Copilot licence on the dev tenant for now; test unlicensed | owner, 2026-10-22 | tenant check in "How to test" |
| D8 | The SharePoint page placement waits for the Agent Chat web part; nothing is built on `.agent` files | owner, 2026-10-22 | `.agent` retirement March 2027 |

### Constraints the architect inherits

- Do not modify `packages/wp-contract-calendar` or `packages/shared-core` while the web part work is
  in flight. Wrap `shared-core` from the new package instead.
- A new package needs an `nm-<name>` volume in `compose.yml` and `.devcontainer/devcontainer.json`
  (see `docs/dev-environment.md`). That is shared dev infrastructure; get it reviewed.
- Requirements for full audit with traceability through Purview come from the owner and are
  non-negotiable for production.

### Suggested ADRs (next free numbers in `architecture/adr/`)

| ADR | Title | Records |
|---|---|---|
| 0010 | Custom MCP server as the agent's action layer | D1, D2 |
| 0011 | Declarative agent via Agents Toolkit with Entra SSO and on-behalf-of to SharePoint | D3, D4 |
| 0012 | Host the MCP server on Azure Container Apps | D5 |
| 0013 | Three-layer audit for agent actions | D6 |

The TOGAF phases that need an update: C (application: new MCP server and agent components),
D (technology: Container Apps, Entra app registration, Log Analytics), and Requirements Management
(audit and traceability requirement).

### Still open (owner input needed)

1. Year resolution for "01.12 to 05.12": next occurrence inside an active contract, or always ask.
2. Default entry type when unspecified: on-site full day (proposed).
3. Are production contractors members or guests of the tenant? Guest access to declarative agents
   and Copilot Chat is not confirmed by the pages read; this can block the whole channel.
4. Azure subscription and resource group for the server and Log Analytics.
5. Code location: new packages in this monorepo (`packages/mcp-contract-calendar`,
   `packages/agent-contract-calendar`) or a separate repository.
6. Audit retention target. Audit Standard is 180 days, E5 users get one year, longer needs Audit
   Premium. Our own Log Analytics table can be set independently.
7. Whether tool calls must also land inside Purview (Graph `contentActivities`, partly
   pay-as-you-go) or Log Analytics is acceptable for layer 3.
8. Phase 2 scope: server-side timesheet PDF to a document library, MCP Apps month-grid widget.

### To verify on the dev tenant before design is final

- The SharePoint `ListItem*` audit record for an agent-made change shows our app's client id.
- Whether Copilot forwards a conversation or request id to the MCP server (log request headers once).
- `CopilotInteraction` records for the sideloaded agent show `AISystemPlugin` with our plugin.
- Cold start plus on-behalf-of plus a five-day `book_days` stays under the action timeout.

## Sources

- Upgrade agents in SharePoint and OneDrive (pasted; Agent Chat web part, `.agent` retirement March 2027): https://learn.microsoft.com/sharepoint/upgrade-sharepoint-agents
- Extend Copilot in SharePoint with skills (no custom code, lists, licence): https://learn.microsoft.com/sharepoint/copilot-in-sharepoint-skills
- Declarative agents overview (pasted): https://learn.microsoft.com/microsoft-365/copilot/extensibility/overview-declarative-agent
- Build a plugin for a declarative agent from an MCP server (Agents Toolkit 6.12+, auth types, sideload, test in Copilot Chat): https://learn.microsoft.com/microsoft-365/copilot/extensibility/build-mcp-plugins
- Configure Microsoft Entra SSO authentication (auth config, identifierUris, token store client id, OBO 401 tip): https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso
- MCP and API plugins for declarative agents (limits: 5 plugins injected, >10 tools degrade, 10 s timeout): https://learn.microsoft.com/microsoft-365/copilot/extensibility/overview-plugins
- Set up your development environment (capability-by-licence table, developer mode licensed only, sandbox kinds, sideloading): https://learn.microsoft.com/microsoft-365/copilot/extensibility/prerequisites
- Use developer mode to test and debug agents (Agents Toolkit F5, debug panel): https://learn.microsoft.com/microsoft-365/copilot/extensibility/debugging-agents-vscode
- Microsoft 365 Developer Program FAQ (commerce-enabled sandboxes, no conversion, 60-day rule, eligibility): https://learn.microsoft.com/office/developer-program/microsoft-365-developer-program-faq
- Purchase Copilot licences from your Developer Program sandbox: https://learn.microsoft.com/office/developer-program/purchase-copilot-licenses
- SharePoint MCP server reference, Copilot Studio (preview, backward-compat note): https://learn.microsoft.com/microsoft-copilot-studio/mcp-sharepoint-tools
- Work IQ MCP tool reference (mutations blocked by default by tenant policy): https://learn.microsoft.com/microsoft-365/copilot/extensibility/work-iq/mcp/tool-reference
- Build or reuse MCP servers (BYO MCP route does not support Microsoft 365 declarative agents; WIQD server requirements): https://learn.microsoft.com/microsoft-365/copilot/extensibility/build-reuse-mcp-servers
- Publish a Copilot Studio agent to SharePoint (SharePoint channel, billing): https://learn.microsoft.com/microsoft-copilot-studio/publication-add-bot-to-sharepoint
- Host MCP SDK servers on Azure Functions (C#; TypeScript template linked from it): https://learn.microsoft.com/azure/azure-functions/scenario-host-mcp-server-sdks
- Remote MCP Functions samples with Entra auth and OBO: https://github.com/Azure-Samples/remote-mcp-functions-dotnet and https://github.com/Azure-Samples/remote-mcp-functions-typescript
- Audit logs for Copilot and AI applications (CopilotInteraction fields, AISystemPlugin, ConnectedAIAppInteraction billing): https://learn.microsoft.com/purview/audit-copilot
- Dynamic tool discovery, audit section (agents with MCP plugins audited under workload Copilot): https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery
- Audit log activities, SharePoint list activities and the app@sharepoint user: https://learn.microsoft.com/purview/audit-log-activities
- Search the audit log (retention 180 days standard, one year for E5): https://learn.microsoft.com/purview/audit-search
- Purview APIs for custom AI apps (contentActivities, processContent): https://learn.microsoft.com/purview/developer/use-the-api
- Choose an Azure service for your MCP server: https://learn.microsoft.com/azure/container-apps/mcp-choosing-azure-service
- Azure Functions hosting options and Flex Consumption always-ready instances: https://learn.microsoft.com/azure/azure-functions/functions-scale
- SharePoint agent web part, roadmap 481512 (the existing `.agent` web part): https://mc.merill.net/message/RM481512
- In-repo: the monorepo design document of 2026-10-22 (not published), `packages/shared-core/src/data/SharePointDataService.ts`, `architecture/adr/0008-one-calendar-entry-per-contractor-per-date.md`, `docs/dev-environment.md`
