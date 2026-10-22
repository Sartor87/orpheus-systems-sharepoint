# Architecture amendments for the contract agent

For the owner, to apply when `feat/contract-agent` is merged. Existing ADRs and the TOGAF phase
documents were not edited on this branch, to avoid conflicts with the parallel web part and
HTML-timesheet sessions. This file lists what each of them should gain.

## New ADRs to number

The six ADRs are committed as `architecture/adr/XXXX-<slug>.md` with title `# X. ...` and Status
`Proposed`. At merge: assign the next free numbers (after the HTML-timesheet ADR, if it is numbered
first), rename the files and the diagram files in `architecture/adr/diagrams/`, replace `X.` in each
title, and update the cross-references between them (they refer to each other by file name).

## Amendments

| Document | Amendment |
|---|---|
| `architecture/adr/0000-index.md` | Add six rows: Custom MCP server in TypeScript as the agent's action layer (C, application); Declarative agent with Entra SSO and on-behalf-of to SharePoint (C, application / D); Vendor as a text column and an HR read-only group (C, data); Azure target: API Management in front of Container Apps, Terraform (D); Dev tunnel for the agent demo (D); Three-layer audit for agent actions (Requirements Management / D). Status `Proposed` unless the owner accepts them at merge. Keep "holiday agent runtime" in the candidates; this agent does not maintain holidays. |
| ADR 0003, `IDataService` with Local and SharePoint implementations | Add a third consumer: the MCP server (`packages/mcp-contract-calendar`) creates a `SharePointDataService` per request from an `SPFI` built with the user's on-behalf-of token, and uses `LocalDataService` in tests and in `DATA_MODE=local`. Note that all agent writes go through `upsertEntry` / `deleteEntry`, so the invariants of ADR 0008 hold for agent writes too. |
| ADR 0005, filtering over item-level permissions | Add: the same filtering is enforced server-side for the agent (OData pre-filter plus an in-memory re-check per item), and writes by anyone other than the contract's contractor are refused by the server. Add the HR role: members of the `Orpheus HR` SharePoint group (Read) see all contracts, read only. The Contribute-on-Contracts gap is unchanged by the agent. |
| `architecture/03-phase-c-data-architecture.md` | Contracts gains `Vendor` (internal name `Vendor`, Text 255, DisplayName `Vendor (service provider)`, group `Orpheus Systems`, ID `{582b1c53-77a2-4a1b-918f-14e0b9eaff06}`, site column with a FieldRef on `Orpheus Contract`). Add the `Orpheus HR` group to the security groups. Add the 002xxx demo series next to the 001xxx seed. In "Query patterns", add the agent's queries: contracts by viewer role with `Vendor`, manager lookup by name or email. |
| `architecture/04-phase-c-application-architecture.md` | Package catalog: `mcp-contract-calendar` (MCP server, Node 22, TypeScript) and `agent-contract-calendar` (Agents Toolkit project, no build). Container view: Copilot Chat, declarative agent, MCP server, SharePoint. Component description for the six tools. Security model: HR role, server-side write check. Integration points: Copilot Chat over MCP with Entra SSO. |
| `architecture/05-phase-d-technology-architecture.md` | Technology stack: MCP TypeScript SDK, Express 5, jose, msal-node, Agents Toolkit, dev tunnels. Deployment topology: now, local Podman service `mcp` on port 8787 behind a persistent dev tunnel; later, the Azure target (API Management, Container Apps with `minReplicas: 1`, managed identity, Key Vault, Log Analytics, Terraform). Security and secrets: the server's app registration and its OBO credential are separate from the provisioning app. Note the Node memory caps for container runs. |
| `architecture/10-requirements-management.md` | Add requirements: agent books, removes and reads days with the web part's rules (traces to the MCP server ADR); HR read-only access to all contracts (Vendor and HR ADR); full audit with traceability for agent actions (three-layer audit ADR; the owner's non-negotiable production requirement). Add the open items: guest contractors, Azure subscription, audit retention target and whether tool calls must land in Purview. |

## Overlap with the HTML-timesheet branch

- Both branches create the same `Vendor` column with the same field ID. Whichever setup script runs
  first creates it; the other reports it unchanged. When the main provisioning template absorbs the
  column (plan 3), both scripts' column steps become no-ops.
- The HTML-timesheet branch's `getContractTemplateData` and `TEMPLATE_DATA_SELECT` in `shared-core`
  also read `Vendor`. After merge, `packages/mcp-contract-calendar/src/sharepoint/vendorQuery.ts`
  (`VENDOR_CONTRACT_SELECT`, `mapVendorContract`) may reuse them instead of keeping its own select.

## Known risks to record in existing documents

| Risk | Where it belongs | Note |
|---|---|---|
| `SharePointDataService.upsertEntry` deletes the sibling entry and adds the new one in one batch, but the batch is not transactional: the delete can succeed while the add fails, leaving the day empty | ADR 0008 (risks), `03-phase-c-data-architecture.md` | Affects the web part and the agent. `book_days` reports the day as failed. Fix in `shared-core` (add first, or verify and restore). |
| Large lists need indexes on the filtered columns | `03-phase-c-data-architecture.md` (query patterns), ADR 0006 | Contracts `Contractor`, `ContractManager`, `Status` are already indexed by `infra/provisioning`; `Title` is not, and the agent setup script filters on it with `startswith`. Add an index on `Vendor` if vendor filters run on a large list. |
| Guest contractors are not verified with declarative agents and Copilot Chat | `10-requirements-management.md` (open requirements) | Can block the channel for contractors who are guests. |
| With dynamic tool discovery the plugin manifest carries no per-function confirmation hint for write tools | `04-phase-c-application-architecture.md` (security model) | Mitigated by instructions and the server-side write check; consider MCP tool annotations. |
| Agent audit events record booked days by contract and date, not by SharePoint item id | Three-layer audit ADR (already noted), `10-requirements-management.md` | Planned fix in the server. |
