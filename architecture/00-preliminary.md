# Preliminary Phase

**Initiative:** Orpheus Systems SPFx Monorepo
**Owner / sponsor:** Kiril Iliev <kiril.iliev@orpheussystems.com>, Orpheus Systems
**Status:** scaffold, derived from the approved design of 2026-10-22

## 1. Architecture capability

Orpheus Systems is a software architecture consultancy (Sofia, Bulgaria, EU).
There is no separate architecture board; the owner is architect, builder and
approver. The architecture capability for this initiative is therefore
lightweight:

- Architecture artefacts are Markdown in this repository under `architecture/`.
- Decisions are recorded as ADRs under `architecture/adr/`.
- The design document under `docs/superpowers/specs/` is the originating
  statement of work; this folder is the structured, maintained view of it.

> ⚠️ **Open:** The design does not name any reviewer other than the owner. If a
> second reviewer (e.g. a peer architect) is wanted for the public release, name
> them here and in Phase G.

## 2. Tailored ADM

All ADM phases are included, but scaled to a single-owner, single-product
repository:

| Phase | In scope | Tailoring note |
|-------|----------|----------------|
| Preliminary | Yes | This document plus `principles/`. |
| A — Vision | Yes | Vision, stakeholders, drivers, constraints, system context, risks. |
| B — Business | Yes | Roles, capabilities, processes and business rules of contract day tracking. |
| C — Data | Yes | The three SharePoint lists, content types, entity model, fixtures. |
| C — Application | Yes | Packages, the five SPFx artefacts, `IDataService`, container view. |
| D — Technology | Yes | SPFx 1.23.2 toolchain, Podman, CI, SharePoint Online. |
| E — Opportunities & Solutions | Yes | Work packages and roadmap (holiday agent, permission hardening, PDF storage). |
| F — Migration | Yes | From the current non-building skeleton to the public repo; provisioning and deployment order. Not a data migration. |
| G — Governance | Yes | Review gates, compliance checklist, definition of done. |
| H — Change management | Yes | Change triggers, ADR lifecycle, roadmap intake. |
| Requirements Management | Yes | Requirements log with traceability. |

## 3. Governance model

| Concern | Answer |
|---------|--------|
| Who approves the architecture | The owner. |
| Where decisions are recorded | `architecture/adr/` (one file per decision). |
| Where changes are tracked | Git history of this folder; the public repo starts from a fresh orphan branch (ADR-007). |
| Tool of record | The Git repository itself (public GitHub `orpheussystems/sharepoint`). |
| Formality | Lightweight; documents are updated when a decision or a roadmap item changes. |

## 4. Existing standards and patterns reused

- SPFx 1.23.2 toolchain and Yeoman project shape (ADR-001).
- PnP community tooling: `m365pnp/spfx` container image (ADR-002), PnPjs v4
  for data access (ADR-003), PnP PowerShell site templates for provisioning
  (ADR-006).
- Fluent UI React, the version shipped with SPFx 1.23, with Orpheus theme
  tokens over it.
- npm workspaces, already the convention in the repository.

## 5. Reference frameworks

- TOGAF ADM (this folder's structure).
- SPFx guidance from Microsoft for bundle size and extension types; the
  design names bundle-size guidance as the trigger for the pdfmake → jsPDF
  fallback (ADR-004).

> ⚠️ **Open:** No cloud well-architected framework is adopted; the solution is
> SharePoint Online only with no additional Azure hosting. Revisit if the
> holiday agent (Phase E) introduces a hosted component.
