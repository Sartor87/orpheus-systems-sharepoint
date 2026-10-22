# Requirements Management

Living requirements log with traceability to phases and ADRs. Source: design
document of 2026-10-22 unless noted. Status: **Confirmed** (stated in the
design), **Builder** (explicitly left to the builder), **Open** (design is
silent).

## 1. Functional requirements

| ID | Requirement | Source | Phase | ADR | Status |
|----|-------------|--------|-------|-----|--------|
| FR-01 | Contractor sees only own contracts; marks days on-site / off-site, full or half | §6.1 | B, C-app | ADR-005 | Confirmed |
| FR-02 | On overlap days the contractor chooses which contract the day counts against; the day is moved, never duplicated | §6.1, §6.2 | B, C-data | ADR-008 | Confirmed |
| FR-03 | Contract manager creates/edits only contracts they manage, via the form customizer; read-only on days | §6.1 | B, C-app | ADR-005 | Confirmed |
| FR-04 | Site admin edits any contract, maintains Holidays, configures the web part | §6.1 | B | — | Confirmed |
| FR-05 | Three lists with dedicated content types: Contracts, CalendarEntries, Holidays, columns as §6.2 | §6.2 | C-data | ADR-006 | Confirmed |
| FR-06 | Weekends blocked by default (configurable); holidays for the contract's country or `*` blocked | §6.2, §6.4 | B, C-app | — | Confirmed |
| FR-07 | `IDataService` with Local (fixtures) and SharePoint (PnPjs v4) implementations; selected in `onInit`; injected via context | §6.3 | C-app | ADR-003 | Confirmed |
| FR-08 | Web part property pane: list pickers filtered by content type, `useLocalData`, demo user, months to show, weekend blocking, approving-organisation label (default "Client approval"), service-provider label (default "Service provider") | §6.4 | C-app | — | Confirmed |
| FR-09 | Header with contract selector and metadata strip in PDF-header order; selection-type radio; Monday-first month grids; click toggles; same type removes | §6.4 | C-app | — | Confirmed |
| FR-10 | Stats panel: full/half counts, used vs target, remaining, warning colour when over | §6.4 | C-app | — | Confirmed |
| FR-11 | Managers get read-only view plus Generate timesheet | §6.4 | C-app | — | Confirmed |
| FR-12 | Contractors also get Generate timesheet | §6.4, §9 | C-app | — | Builder (recommended yes) |
| FR-13 | Optimistic UI with rollback on error | §6.4 | C-app | — | Confirmed |
| FR-14 | PDF: landscape A4, one page per 12 months, header rows, 1–31 grid with hours and colours, per-month and grand totals, three signature boxes | §6.5 | C-app | ADR-004 | Confirmed |
| FR-15 | PDF period defaults to contract span, trimmable; file `Timesheet_<ContractCode>_<from>_<to>.pdf` | §6.5 | C-app | ADR-004 | Confirmed |
| FR-16 | Application customizer header (dark bar, wordmark, role-filtered menu from properties: My calendar · Contracts · Holidays) and footer (kicker, support mail, version) | §6.6, §6.9 | C-app | — | Confirmed |
| FR-17 | Field customizer on `RemainingDays`: two bars, remaining text, amber ≥ 80 %, red over; reads item columns only | §6.7 | C-app | — | Confirmed |
| FR-18 | Service keeps `OnSiteUsedDays` / `OffSiteUsedDays` current on every entry write | §6.7 | C-data, C-app | ADR-003 | Confirmed |
| FR-19 | Form customizer: two-column layout, people pickers, validation (regex configurable, date order, 0.5 steps), overlap notice, Display form with timesheet link | §6.8 | C-app | — | Confirmed |
| FR-20 | Idempotent provisioning script with `-SiteUrl`, `-Country`, `-WhatIf`; creates content types, lists, indexes, `RemainingDays` binding, form binding, calendar page with lists preselected, starter holidays, customizer properties | §6.9 | D, F | ADR-006 | Confirmed |
| FR-21 | Calendar page honours `contractId` query parameter | §6.9 | C-app | — | Confirmed |
| FR-22 | Fixtures: one active contract, bridge pair with 2-week overlap, half days, holidays for BG and `*`, two demo users | §6.3 | C-data | ADR-003 | Confirmed |
| FR-23 | Role derivation order: Contractor → manager → Owners group; roles can combine | §7 | B, C-app | ADR-005 | Confirmed |

## 2. Non-functional and repository requirements

| ID | Requirement | Source | Phase | ADR | Status |
|----|-------------|--------|-------|-----|--------|
| NFR-01 | Builds, bundles and packages from a clean clone with only Podman installed | §2 G2 | D | ADR-002 | Confirmed |
| NFR-02 | SPFx 1.23.2; Node 22.14+ in container; npm workspaces; PnPjs 4.22; Fluent UI as shipped | §3 | D | ADR-001 | Confirmed |
| NFR-03 | No previous-employer or real-client identifiers in tree, history, docs, screenshots; design §8 hygiene grep clean | §2, §8 | A, G | ADR-007 | Confirmed |
| NFR-04 | Configurable labels with neutral defaults for any organisation name | §2 anti-goals | C-app | — | Confirmed |
| NFR-05 | Realistic fixture data | §2 anti-goals | C-data | — | Confirmed |
| NFR-06 | MIT licence © 2026 Orpheus Systems; `package.json` author/repository/homepage | §8 | A | — | Confirmed |
| NFR-07 | README: what it is, screenshots, Podman quick start, package table, data model, provisioning, deployment, roadmap | §8 | E, F | — | Confirmed |
| NFR-08 | CI builds in the container and uploads `.sppkg` artefacts | §8 | D | — | Confirmed |
| NFR-09 | Scripts work from PowerShell and from bash inside the container | §3 | D | — | Confirmed |
| NFR-10 | English only; strings structure allows adding languages | §2 non-goals | C-app | — | Confirmed |
| NFR-11 | Bundle size within SPFx guidance | §6.5, §9 | D | ADR-004 | Builder |
| NFR-12 | Unit tests for data services, period / overlap / totals, PDF model builder; UI snapshots optional | §9 | G | — | Builder |
| NFR-13 | SharePoint Online only | §2 non-goals | D | — | Confirmed |

## 3. Open requirements (design is silent)

| ID | Question | Where it matters |
|----|----------|------------------|
| OR-01 | Confirm org/repo + npm scope reading of "orpheussystems.sharepoint" | Phase A constraints; package names |
| OR-02 | Footer kicker wording; Orpheus logo SVG availability | Application customizer |
| OR-03 | Behaviour of `Modality = Hybrid` and of `Status = Closed` | Business rules |
| OR-04 | Timeline, budget, effort | Phases A, E |
| OR-05 | Availability, RTO/RPO, monitoring, scale | Phase D |
| OR-06 | Retention, deletion, GDPR handling of names in a public demo | Phase C data |
| OR-07 | Deployment automation to the app catalog; tenant-scoped vs site-scoped catalog; CI secrets | Phase D, F |
| OR-08 | PnP PowerShell authentication method | Phase D |
| OR-09 | Schema evolution once real data exists | Phase F |
| OR-10 | Second reviewer for public release | Preliminary, Phase G |
| OR-11 | `RemainingDays` column type and formula | Phase C data |
| OR-12 | Designs for the three roadmap items | Phase E, H |

## 4. Traceability summary

| ADR | Requirements |
|-----|--------------|
| ADR-001 | NFR-02 |
| ADR-002 | NFR-01, NFR-09 |
| ADR-003 | FR-07, FR-18, FR-22 |
| ADR-004 | FR-14, FR-15, NFR-11 |
| ADR-005 | FR-01, FR-03, FR-23 |
| ADR-006 | FR-05, FR-20 |
| ADR-007 | NFR-03 |
| ADR-008 | FR-02 |
