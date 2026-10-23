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
| [ADR-010](0010-html-template-timesheet.md) | HTML template for the timesheet PDF | Accepted | 2026-10-22 | C (application) |
| [ADR-011](0011-custom-mcp-server-in-typescript.md) | Custom MCP server in TypeScript as the agent's action layer | Accepted | 2026-10-22 | C (application) |
| [ADR-012](0012-declarative-agent-entra-sso-obo.md) | Declarative agent with Entra SSO and on-behalf-of to SharePoint | Accepted | 2026-10-22 | C (application) / D |
| [ADR-013](0013-vendor-column-and-hr-group-for-the-agent.md) | Vendor text column and HR read-only group, owned by the agent setup script | Accepted | 2026-10-22 | C (data) |
| [ADR-014](0014-three-layer-audit-for-agent-actions.md) | Three-layer audit for agent actions | Accepted | 2026-10-22 | Requirements / D |
| [ADR-015](0015-dev-tunnel-for-the-agent-demo.md) | Dev tunnel for the agent demo | Accepted | 2026-10-22 | D |
| [ADR-016](0016-azure-target-apim-container-apps-terraform.md) | Azure target: API Management in front of Container Apps, Terraform | Proposed | 2026-10-22 | D |
| [ADR-017](0017-sharepoint-placement-waits-for-agent-chat-web-part.md) | SharePoint placement of the agent waits for the Agent Chat web part | Accepted | 2026-10-23 | E / F |

Lifecycle: `Proposed → Accepted → (Deprecated | Superseded by NNNN)`. See
Phase H for the change process. Candidate future ADRs (not yet written):
holiday agent runtime, permissions hardening mechanism, document-library PDF
storage, jsPDF fallback if triggered.
