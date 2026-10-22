# Orpheus Systems SPFx Monorepo — Architecture

TOGAF ADM scaffold for the Orpheus Systems SharePoint Framework monorepo
(`orpheussystems/sharepoint`, npm scope `@orpheussystems`).

- Owner: Kiril Iliev <kiril.iliev@orpheussystems.com>
- Organisation: Orpheus Systems, https://orpheussystems.com/
- Source design: `docs/superpowers/specs/2026-10-22-orpheus-spfx-monorepo-design.md`
- Behavioural mock: `docs/mocks/onsite_calendar.html`
- Scaffold date: 2026-10-22

Everything in this folder is derived from the design document above. Where the
design is silent the text says so with an `⚠️ Open` note instead of inventing a
fact. Technology and vendor choices live in ADRs, not in the phase documents.

## Index

| Phase | Document | What it covers |
|-------|----------|----------------|
| Preliminary | [00-preliminary.md](00-preliminary.md) | Architecture capability, tailored ADM, governance, repository of record |
| — | [principles/architecture-principles.md](principles/architecture-principles.md) | Architecture principles the design already embodies |
| A | [01-phase-a-architecture-vision.md](01-phase-a-architecture-vision.md) | Vision, scope, stakeholders, drivers, constraints, system context, risks |
| B | [02-phase-b-business-architecture.md](02-phase-b-business-architecture.md) | Roles, capabilities, processes, business rules |
| C (data) | [03-phase-c-data-architecture.md](03-phase-c-data-architecture.md) | Lists, columns, content types, entity model, classification, data flows |
| C (application) | [04-phase-c-application-architecture.md](04-phase-c-application-architecture.md) | Packages, the four extensions and the web part, `IDataService`, container view |
| D | [05-phase-d-technology-architecture.md](05-phase-d-technology-architecture.md) | SPFx toolchain, Podman, CI, provisioning, hosting |
| E | [06-phase-e-opportunities-and-solutions.md](06-phase-e-opportunities-and-solutions.md) | Work packages, roadmap, build/buy notes |
| F | [07-phase-f-migration-planning.md](07-phase-f-migration-planning.md) | From the broken skeleton to the public repo; provisioning and deployment sequence |
| G | [08-phase-g-implementation-governance.md](08-phase-g-implementation-governance.md) | Review gates, compliance checklist, definition of done |
| H | [09-phase-h-change-management.md](09-phase-h-change-management.md) | Change triggers, ADR upkeep, roadmap items |
| Req. Mgmt | [10-requirements-management.md](10-requirements-management.md) | Requirements log with traceability to phases and ADRs |

## Architecture Decision Records

See [adr/0000-index.md](adr/0000-index.md) for the index.

| ADR | Decision |
|-----|----------|
| [ADR-001](adr/0001-spfx-1-23-2-npm-workspaces-monorepo.md) | SPFx 1.23.2 on an npm-workspaces monorepo |
| [ADR-002](adr/0002-podman-spfx-container-no-host-node.md) | Podman with the `m365pnp/spfx:1.23.2` container; no Node on the host |
| [ADR-003](adr/0003-idataservice-local-and-sharepoint.md) | `IDataService` with Local and SharePoint implementations |
| [ADR-004](adr/0004-client-side-pdf-pdfmake.md) | Client-side PDF generation with pdfmake |
| [ADR-005](adr/0005-web-part-filtering-over-item-level-permissions.md) | Visibility by filtering in the web part rather than item-level permissions |
| [ADR-006](adr/0006-idempotent-pnp-powershell-provisioning.md) | Idempotent PnP PowerShell provisioning instead of Feature Framework |
| [ADR-007](adr/0007-fresh-orphan-branch-for-public-repo.md) | Fresh orphan branch for the public repository |
| [ADR-008](adr/0008-one-calendar-entry-per-contractor-per-date.md) | One calendar entry per contractor per date across contracts |
| [ADR-009](adr/0009-apache-2-0-with-notice.md) | Apache-2.0 license with NOTICE attribution |

## Conventions

- `> ⚠️ **Open:**` — the design is silent or undecided; needs the owner or the builder.
- `> 📝 **Assumption:**` — a reading of the design that should be validated.
- Diagrams are Mermaid, embedded in the Markdown.
- The approving organisation on the timesheet is a configurable label; its
  default is "Client approval". No real client or previous employer is named
  anywhere in this folder.
