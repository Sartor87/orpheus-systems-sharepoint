# Model notes

Observations made while building the model on 2026-10-23. The TOGAF documents `01`, `02`, `06`,
`10` and `adr/0000-index.md` are not edited by this work; wave 4, task 7 owns those changes. Where
the model and a document disagree, the model follows the code and the difference is listed here.

## Discrepancies between the documents and the code

| # | Where | Document says | Code says | Model follows |
|---|---|---|---|---|
| N1 | `principles/architecture-principles.md`, P1 | `podman-compose.yml` | The file is `compose.yml` at the repository root | Code |
| N2 | `01-phase-a-architecture-vision.md` G3 and section 6, `07-phase-f-migration-planning.md` step 6 | "Five deployable SPFx artefacts", "Five `.sppkg` files" | Four SPFx solutions produce four `.sppkg` files; `release.yml` fails unless exactly four are found. The shared libraries are bundled, not packaged | Code: four `.sppkg` |
| N3 | `05-phase-d-technology-architecture.md` section 2 | Top-level npm scripts `build`, `serve:<pkg>`, `package`, `clean`, `provision`; compose services `shell`, `install`, `build`, `serve`, `package`, `mcp` | Root `package.json` has `build`, `build:shared`, `package`, `package:solutions`, `test:all`, `test:ci`, `typecheck`, `hygiene`, `clean`; no `serve:<pkg>` or `provision`. `compose.yml` also has `fix-perms` and `test` | Code |
| N4 | `README.md` (repository root), Architecture section | "the 16 architecture decision records" | 17 ADRs are committed on `public-main`; ADR 0018 is pending in the owner's checkout | Code |
| N5 | `adr/0000-index.md`, intro | "All decisions below ... are recorded here as **Accepted**" | ADR 0016 and ADR 0018 are Proposed; ADR 0017 and 0018 are dated 2026-10-23, not 2026-10-22 | ADR files |
| N6 | `04-phase-c-application-architecture.md` section 1 and `README.md` | The agent's "six tools" and "four read tools" | Matches `createMcpServer.ts`; recorded here only because ADR 0018 would add four more on a second endpoint, which keeps the first endpoint at six | Code |
| N7 | `01-phase-a-architecture-vision.md` section 5 (system context) | Context has no agent, Copilot, Entra or Purview; "Provisioning (PnP PowerShell 7 on host)" | The agent, Copilot Chat, Entra ID and Purview exist since WP-13; PnP PowerShell is version 3 on PowerShell 7.4 | Code and ADRs; the SuiteContext view shows only the suite's neighbours, the Landscape view shows everything |
| N8 | `02-phase-b-business-architecture.md` section 2 (roles) | Three roles: contractor, manager, site admin | The agent adds HR (members of the group named by `HR_GROUP`), read only, agent only (ADR 0013) | Code: HR is a person in the model, connected only to Copilot and the proposed oversight agent |
| N9 | `04-phase-c-application-architecture.md` section 5.3 | Footer carries a support mail link | True in code; the model does not repeat the address | Omitted on purpose |
| N10 | `adr/*.md` header, `adr/0000-index.md` intro ("Structurizr/adr-tools convention") | `## Date: YYYY-MM-DD` is the Structurizr-readable date | The Structurizr importer (image `structurizr/structurizr`, local v2026.09.19) did not read it: all 18 imported decisions carry the import time as their date. Title and status import correctly | Not changed here; the ADR template and the memory note on the convention should be checked against the importer before the next ADR |
| N11 | `adr/*.md`, Related sections | ADRs cite each other as `` `NNNN-slug.md` `` in backticks | The importer links decisions only through Markdown links `[text](NNNN-slug.md)`; the Decisions page shows no links between the 17 ADRs | Not changed here; a link form in the Related section would light up the graph |
| N12 | `adr/0000-index.md` | Index file in the ADR folder | Imported as decision 0, title "Architecture Decision Records", status Proposed (no `## Status` section) | Not changed here; harmless |

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

ADR 0018 was written in the owner's main checkout and not committed when this branch was created
from `public-main`. Its elements are in the model with the tag `Proposed`:

- container `agent-contract-oversight`,
- components `/mcp/oversight endpoint` and `domain: reconcile / health / audit` in the MCP server,
- external systems `PnP sharepoint-skills catalog` and `Graph store (GraphRAG)`,
- the relationships from the contract manager and HR to the oversight agent.

Once ADR 0018 is committed, `!adrs ../adr` picks it up without a change to the DSL. The health
thresholds (ADR 0018 decision 7) are still open; the model records the function, not the numbers.

## Open points carried over from the TOGAF documents

The `⚠️ Open` notes in Phases A, B, D and E (timeline, availability targets, deployment automation,
PnP PowerShell authentication method, guest contractors with Copilot) are unchanged by this model.
Nothing here resolves them.
