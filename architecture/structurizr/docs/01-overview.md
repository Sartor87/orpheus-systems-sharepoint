# Overview

This workspace is the C4 model of the Orpheus Systems **Contract Calendar for SharePoint**. It is
derived from the TOGAF ADM documents in `architecture/` and the code in `packages/`, `infra/`,
`.github/` and `compose.yml`. The TOGAF documents stay the narrative source; this model is the
structural one.

## Where the documentation lives

- **Workspace documentation** is the eleven TOGAF phase documents themselves,
  `architecture/00-preliminary.md` to `architecture/10-requirements-management.md`, imported in
  place with one `!docs` per file, in phase order. Nothing is copied. Each section takes its title
  from the file's first heading.
- **These three notes** (overview, model notes, how to render) are the documentation of the
  Contract Calendar suite system (`!docs docs` inside it). They describe the model, not the
  product, so they sit next to the DSL and are linked from the repository README.
- **Decisions** are the ADRs in `architecture/adr`, imported with `!adrs ../adr`.

## What is modelled

| Software system | Status | Where it comes from |
|---|---|---|
| Contract Calendar suite | Built | SPFx 1.23.2 web part, three extensions, two shared libraries (`packages/`) |
| Contract Calendar agent | Built, demo through a dev tunnel | `agent-contract-calendar`, `mcp-contract-calendar`, ADR 0011 to 0015 |
| Provisioning scripts | Built | `Provision-OrpheusSite.ps1` and `OrpheusSolutions.psm1` (`-InstallSolutions`), `Add-TimesheetTemplateColumns.ps1` in `infra/provisioning`; `Setup-AgentDemo.ps1` in `packages/mcp-contract-calendar/setup` |
| SharePoint Online | External, decomposed | Lists, page, template file, site collection App Catalog, groups (Owners, `Orpheus Contract Managers`, `Orpheus HR`) |
| GitHub | External, CI | Repository, GitHub Actions (`ci.yml`, `build.yml`, `release.yml`), Dependabot, the ruleset on `main` |
| Copilot Chat, Entra ID, Purview, dev tunnel relay | External | ADR 0012, 0014, 0015 |
| Contract Oversight agent, `/mcp/oversight`, PnP skills, graph store | **Proposed** (dashed) | ADR 0018, decision level only; nothing built |
| Azure target (API Management, Container Apps, Key Vault, Log Analytics) | **Proposed** (dashed) | ADR 0016, roadmap RM-4 |

## Views

| View key | Answers |
|---|---|
| `Landscape` | Who and what is around the suite and the agent |
| `SuiteContext`, `AgentContext` | The two system contexts (Phase A section 5, ADR 0011 to 0018) |
| `SuiteContainers`, `AgentContainers` | Packages and the lists they touch (Phase C application, section 3) |
| `SharePointSite` | What provisioning creates and who reads or writes each list and group |
| `SharedCoreComponents`, `SharedUiComponents`, `WebPartComponents`, `McpServerComponents` | Inside the four packages that carry the logic |
| `MarkADay`, `GenerateTimesheet` | Business processes 4.1 and 4.3 (Phase B) |
| `BookDaysViaAgent` | SSO, on-behalf-of, shared rules and the three audit layers in one flow |
| `ProductionSite`, `AgentDemo`, `AgentAzureTarget` | Deployment: SPFx on a site, the agent demo, the proposed Azure target (Phase D section 3) |
| `ContinuousIntegration` | GitHub Actions: the build, Pester and release jobs; never deploys to a tenant (`docs/ci.md`) |

## Role rules in the model

- Admin: a site collection admin (`IsSiteAdmin`) or a member of the associated Owners group.
- Contract manager: manages at least one contract, or is a member of `Orpheus Contract Managers`
  (Contribute). May create contracts; edits only the contracts they manage.
- HR: a member of `Orpheus HR`; agent only, read-only.
- If role derivation fails, no role is granted (fail closed).

These live in the person descriptions, the `rules` and `spQueries / spMappers / listLookup`
components of `shared-core`, the form customizer and the `Site groups` container.

## Conventions

- Tag `Proposed` (dashed border, 60 percent opacity) marks anything from a Proposed ADR. Nothing
  tagged Proposed exists in the code.
- Tag `Demo` (dotted border) marks demo-only infrastructure. Tag `CI` marks GitHub.
- Tag `Data store` (cylinder) marks lists, files and the audit sink.
- Colours follow the product tokens: amber for the suite, SharePoint blue for the agent, timesheet
  yellow for scripts, grey for external systems.
- Relationships inside the suite are TypeScript imports or PnPjs REST; the technology is stated on
  each one. Implied relationships between parents are created by Structurizr, so a container view
  shows `wp-contract-calendar -> shared-core` even though the model only states component-level
  relationships.
- No tenant, user or secret appears here. The CI hygiene check (`scripts/ci/hygiene.js`) scans this
  folder like every other tracked file.

## ADRs

The ADRs in `architecture/adr` are imported with `!adrs ../adr` and appear under **Decisions**.
Title and status come from the fixed header (`# N. Title`, `## Status`); the date heading is not
read by the importer (model note N10). ADR 0011 to 0015 and 0017 are Accepted; ADR 0016 and 0018
are Proposed, and the elements they introduce carry the `Proposed` tag.
