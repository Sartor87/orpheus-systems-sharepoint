# Model notes

Observations made while building the model on 2026-10-23, revised the same day after the
provisioning (Plan 3), wave 2 role and CI changes and a documentation consistency pass. Where the
model and a document disagree, the model follows the code and the difference is listed here. Rows
marked **Resolved** stay for the record.

## Discrepancies between the documents and the code

| # | Where | Document says | Code says | Model follows |
|---|---|---|---|---|
| N1 | `principles/architecture-principles.md`, P1 | `podman-compose.yml` | The file is `compose.yml` at the repository root | Code |
| N2 | `01-phase-a-architecture-vision.md` G3 and section 6, `07-phase-f-migration-planning.md` step 6 | "Five deployable SPFx artefacts", "Five `.sppkg` files" | Four SPFx solutions produce four `.sppkg` files; `release.yml` fails unless exactly four are found. The shared libraries are bundled, not packaged | **Resolved** 2026-10-23: Phase A (G3, section 6) and Phase F (step 6, exit criteria) now say four |
| N3 | `05-phase-d-technology-architecture.md` section 2 | Top-level npm scripts `build`, `serve:<pkg>`, `package`, `clean`, `provision`; compose services `shell`, `install`, `build`, `serve`, `package`, `mcp` | Root `package.json` has `build`, `build:shared`, `package`, `package:solutions`, `test:all`, `test:ci`, `typecheck`, `hygiene`, `clean`; no `serve:<pkg>` or `provision`. `compose.yml` also has `fix-perms` and `test` | Code |
| N4 | `README.md` (repository root), Architecture section | "the 16 architecture decision records" | 18 ADRs are committed | **Resolved** 2026-10-23: the README says 18 and lists the statuses |
| N5 | `adr/0000-index.md`, intro | "All decisions below ... are recorded here as **Accepted**" | ADR 0016 and ADR 0018 are Proposed; ADR 0017 and 0018 are dated 2026-10-23, not 2026-10-22 | **Resolved** 2026-10-23: the intro now names the Proposed ones |
| N6 | `04-phase-c-application-architecture.md` section 1 and `README.md` | The agent's "six tools" and "four read tools" | Matches `createMcpServer.ts`; recorded here only because ADR 0018 would add four more on a second endpoint, which keeps the first endpoint at six | Code |
| N7 | `01-phase-a-architecture-vision.md` section 5 (system context) | Context has no agent, Copilot, Entra or Purview; "Provisioning (PnP PowerShell 7 on host)" | The agent, Copilot Chat, Entra ID and Purview exist since WP-13; PnP PowerShell is version 3 on PowerShell 7.4 | Code and ADRs; the SuiteContext view shows only the suite's neighbours, the Landscape view shows everything. The provisioning box and PnP PowerShell version in Phase A were corrected on 2026-10-23; the agent is still absent from the Phase A context |
| N8 | `02-phase-b-business-architecture.md` section 2 (roles) | Three roles: contractor, manager, site admin | The agent adds HR (members of the group named by `HR_GROUP`), read only, agent only (ADR 0013) | Code: HR is a person in the model, connected only to Copilot and the proposed oversight agent |
| N9 | `04-phase-c-application-architecture.md` section 5.3 | Footer carries a support mail link | True in code; the model does not repeat the address | Omitted on purpose |
| N10 | `adr/*.md` header, `adr/0000-index.md` intro ("Structurizr/adr-tools convention") | `## Date: YYYY-MM-DD` is the Structurizr-readable date | The Structurizr importer (image `structurizr/structurizr`, local v2026.09.19) did not read it: all 18 imported decisions carry the import time as their date. Title and status import correctly | Not changed here; the ADR template should be checked against the importer before the next ADR |
| N11 | `adr/*.md`, Related sections | ADRs cite each other as `` `NNNN-slug.md` `` in backticks | The importer links decisions only through Markdown links `[text](NNNN-slug.md)`; the Decisions page shows no links between the ADRs | Not changed here; a link form in the Related section would light up the graph |
| N12 | `adr/0000-index.md` | Index file in the ADR folder | Imported as decision 0, title "Architecture Decision Records", status Proposed (no `## Status` section) | Not changed here; harmless |
| N13 | ADR 0006 (decision text), Phase D section 4 before 2026-10-23 | The script itself provisions the page, the bindings and the application customizer registration; the solutions are uploaded by hand first | `Provision-OrpheusSite.ps1` applies only the list template and the seed; with `-InstallSolutions` the module `OrpheusSolutions.psm1` installs the four `.sppkg` into the site collection App Catalog, registers the header custom action, binds both customizers, creates `Orpheus Contract Managers` and the calendar page. The application customizer package has no feature | Code: `OrpheusSolutions.psm1` is its own container; ADR 0006 has an amendment and Phase D was updated |
| N14 | ADR 0005 (decision text) | Admin = member of the Owners group; manager = `ContractManager` on a contract | Admin also covers site collection admins (`IsSiteAdmin`); `Orpheus Contract Managers` members are managers and may create contracts; role derivation fails closed | Code; ADR 0005 has an amendment |
| N15 | `05-phase-d-technology-architecture.md` section 2 | CI "runs the container build; uploads `.sppkg` artefacts" | `build.yml` also runs the hygiene scan, tests and Pester; `release.yml` publishes `v*` releases; Dependabot monthly; a ruleset on `main` | Code: the `GitHub` system and the `ContinuousIntegration` deployment view. Phase D was updated |

## Assumptions in the model

- **A1.** `ext-field-customizer` imports only `shared-ui` (theme tokens). The TOGAF container view
  agrees; `RemainingDaysFieldCustomizer.ts` imports nothing from `shared-core`.
- **A2.** `ext-app-customizer` and `ext-form-customizer` read SharePoint directly through PnPjs
  with `shared-core`'s query builders and mappers, not through `IDataService`. Principle P3 ("no
  component talks to SharePoint directly") is therefore true for the web part and the MCP server,
  and true in spirit for the extensions because they reuse `shared-core/sharepoint`. The model
  shows the extensions' PnPjs calls as their own relationships to the lists.
- **A3.** The audit sink is modelled as a container of the agent system so that the demo (stdout
  or file) and the Azure target (Log Analytics table) can be shown as two deployments of the same
  thing.
- **A4.** The three SharePoint lists, the page, the template file, the App Catalog and the site
  groups are modelled as containers of the external SharePoint Online system. Structurizr allows
  it and the data architecture (Phase C) needs them as separate boxes.
- **A5.** The Owner / developer person stands for Orpheus Systems as builder and operator; the
  TOGAF stakeholder table lists the owner as "Decides". No individual is named.

## ADR 0018 (Contract Oversight agent)

ADR 0018 is committed with the status Proposed and stays at the decision level; nothing of it is
built. Its elements are in the model with the tag `Proposed`:

- container `agent-contract-oversight`,
- components `/mcp/oversight endpoint` and `domain: reconcile / health / audit` in the MCP server,
- external systems `PnP sharepoint-skills catalog` and `Graph store (GraphRAG)`,
- the relationships from the contract manager and HR to the oversight agent.

`!adrs ../adr` imports it with its status. The health thresholds (ADR 0018 decision 7) are still open; the model records the function, not the numbers.

## Open points carried over from the TOGAF documents

The `⚠️ Open` notes in Phases A, B, D and E (timeline, availability targets, deployment automation,
PnP PowerShell authentication method, guest contractors with Copilot) are unchanged by this model.
Nothing here resolves them.
