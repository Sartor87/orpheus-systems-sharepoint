# Architecture Decision Records

Index of all ADRs for the Orpheus Systems SPFx monorepo. All decisions below
were taken in the design document of 2026-10-22 and are recorded here as
**Accepted**. Template: one file per decision, `NNNN-short-kebab-title.md` (Structurizr/adr-tools convention; the index is `0000-index.md`).

| ADR | Title | Status | Date | Phase |
|-----|-------|--------|------|-------|
| [ADR-001](0001-spfx-1-23-2-npm-workspaces-monorepo.md) | SPFx 1.23.2 on an npm-workspaces monorepo | Accepted | 2026-10-22 | D |
| [ADR-002](0002-podman-spfx-container-no-host-node.md) | Podman with `m365pnp/spfx:1.23.2`; no Node on the host | Accepted | 2026-10-22 | D |
| [ADR-003](0003-idataservice-local-and-sharepoint.md) | `IDataService` with Local and SharePoint implementations | Accepted | 2026-10-22 | C (application) |
| [ADR-004](0004-client-side-pdf-pdfmake.md) | Client-side PDF generation with pdfmake | Accepted | 2026-10-22 | C (application) |
| [ADR-005](0005-web-part-filtering-over-item-level-permissions.md) | Visibility by filtering in the web part rather than item-level permissions | Accepted | 2026-10-22 | C (application) |
| [ADR-006](0006-idempotent-pnp-powershell-provisioning.md) | Idempotent PnP PowerShell provisioning instead of Feature Framework | Accepted | 2026-10-22 | D |
| [ADR-007](0007-fresh-orphan-branch-for-public-repo.md) | Fresh orphan branch for the public repository | Accepted | 2026-10-22 | Preliminary / A |
| [ADR-008](0008-one-calendar-entry-per-contractor-per-date.md) | One calendar entry per contractor per date across contracts | Accepted | 2026-10-22 | C (data) |
| [ADR-009](0009-apache-2-0-with-notice.md) | Apache-2.0 license with NOTICE attribution | Accepted | 2026-10-22 | Preliminary |
| [ADR-010](0010-html-template-timesheet.md) | HTML template timesheet | Accepted | 2026-10-22 | Preliminary |

Lifecycle: `Proposed → Accepted → (Deprecated | Superseded by NNNN)`. See
Phase H for the change process. Candidate future ADRs (not yet written):
holiday agent runtime, permissions hardening mechanism, document-library PDF
storage, jsPDF fallback if triggered.
