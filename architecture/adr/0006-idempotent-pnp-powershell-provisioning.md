# 6. Idempotent PnP PowerShell provisioning instead of Feature Framework

## Date: 2026-10-22

## Status

Accepted

---

## Problem

The solutions assume three lists with content types and indexes, a
`RemainingDays` column bound to the field customizer, the `Orpheus Contract`
content type bound to the form customizer, a modern page hosting the calendar
web part with the lists preselected, a starter holiday set, and application
customizer properties carrying list and page URLs. Two mechanisms were checked.

---

## Decision

We will provision with an **idempotent PnP PowerShell script**,
`Provision-OrpheusSite.ps1`, wrapping a PnP site template
(`Invoke-PnPSiteTemplate`, re-runnable). It runs from PowerShell 7 on the
host, needs no Node, and takes `-SiteUrl`, `-Country`, `-WhatIf`. It
provisions, in order: content types and the three lists with indexes;
`RemainingDays` with the field customizer bound; the content type bound to
the form customizer; `ContractCalendar.aspx` with the web part and lists
preselected; starter holidays for the country; application customizer
registration with the Contracts list and calendar page URLs.

Feature Framework (`elements.xml` inside the `.sppkg`) is **not** used for
lists.

![Provisioning steps of the idempotent script](diagrams/0006-idempotent-pnp-powershell-provisioning-1.svg)

```mermaid
flowchart TB
  RUN["Provision-<br/>OrpheusSite.ps1<br/>idempotent<br/>PowerShell 7.4 on the host<br/>no Node<br/>-SiteUrl -ClientId -WhatIf"] --> TPL["PnP site template<br/>Invoke-PnPSiteTemplate"]
  TPL --> S1["Lists<br/>content types,<br/>the three lists, indexes,<br/>list validation"]
  S1 --> S5["Starter data, optional<br/>-SeedDemoData -Country:<br/>contracts, entries, holidays"]
  S1 --> INS["-InstallSolutions<br/>OrpheusSolutions.psm1<br/>Invoke-OrpheusSolutionInstall"]
  S5 --> INS
  INS --> A1["1. Four .sppkg into the<br/>site collection App Catalog;<br/>empty manifest: clean<br/>reinstall, own -Confirm gate"]
  A1 --> A2["2. OrpheusChrome<br/>header custom action"]
  A2 --> A3["3. RemainingDays bound to<br/>the field customizer"]
  A3 --> A4["4. Orpheus Contract bound<br/>to the form customizer"]
  A4 --> A5["5. Orpheus Contract Managers<br/>group, Contribute"]
  A5 --> A6["6. SitePages/ContractCalendar.aspx<br/>web part wired to<br/>the three lists"]
  A6 -.->|"re-run: every step<br/>reports Unchanged"| RUN
  FF["Feature Framework<br/>elements.xml in .sppkg"] -.-x|"not used for lists<br/>or the header"| S1
```

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| ✅ **PnP PowerShell site template script** | Re-runnable script on the host | Idempotent; can create page, place web part, bind customizers, write properties; `-WhatIf` | Separate step after `.sppkg` deployment; needs PnP PowerShell on the host |
| Feature Framework in `.sppkg` | `elements.xml` list and content-type definitions | Ships with the solution | Site-scoped; runs only on first install; cannot re-run to upgrade a schema; cannot create the page, place the web part or bind customizers |
| Manual setup | Click through SharePoint UI | No tooling | Not repeatable; violates clean-clone goal in spirit |
| Site designs / site scripts | Tenant-level JSON | Native | Limited actions; cannot bind customizers or place web part with properties as needed |

---

## Consequences

**Positive:**
- One script creates everything the solutions assume and can be re-run to
  repair or upgrade.
- Deep links (`contractId`), menu URLs and customizer properties are written
  consistently.

**Negative / Trade-offs:**
- Two-step deployment: app catalog upload, then script.
- Script depends on component IDs of the deployed solutions.

**Risks:**
| Risk ID | Description | Impact (E/H/M/L) | Mitigation |
|---------|-------------|------------------|------------|
| R1 | Script run before solutions are in the app catalog fails to bind customizers | M | Documented order in Phase F; `-WhatIf` |
| R2 | Destructive schema changes not handled by re-run | M | Open item OR-09; treat column removals as manual steps |

---

## Amendments

**2026-10-23** — The decision stands; it is **partly implemented**.

- Built: `Provision-OrpheusSite.ps1` applies `template.xml` and creates the
  site columns, the three content types, the three lists and their indexes,
  sets the Contracts list validation, and with `-SeedDemoData` seeds the demo
  contracts, entries and the holidays of `-Country` plus the `*` ones. It also
  needs `-ClientId` (an app registration of your own; PnP PowerShell no longer
  ships a shared one).
- Not built yet: binding the field customizer to `RemainingDays`, binding the
  form customizer to `Orpheus Contract`, the `ContractCalendar.aspx` page with
  the web part, and the application customizer registration. Until they are,
  these are manual steps in `docs/deployment.md`.
- Starter holidays come only with `-SeedDemoData`; there is no separate
  holiday step.
- Optional schema for timesheet templates is a second idempotent script,
  `Add-TimesheetTemplateColumns.ps1` (ADR-010); the agent's `Vendor` column and
  HR group come from its own setup script (ADR-013).

**Amendment (2026-10-23)** — The decision stands; it is now **fully
implemented** (Plan 3). The "Not built yet" bullet above no longer applies.

- `Provision-OrpheusSite.ps1 -InstallSolutions` hands over to the module
  `infra/provisioning/OrpheusSolutions.psm1` (`Invoke-OrpheusSolutionInstall`)
  after the lists and the optional seed. In order, it: installs the four
  `.sppkg` files into the **site collection** App Catalog (`-Scope Site`) and
  checks every component manifest, doing a clean reinstall when one stays
  empty (gated by its own `-Confirm` prompt); registers the `OrpheusChrome`
  header custom action once; binds the field customizer to
  `Contracts.RemainingDays`; binds the form customizer to `Orpheus Contract`;
  creates the `Orpheus Contract Managers` group with Contribute; creates or
  updates `SitePages/ContractCalendar.aspx` with the web part wired to the
  three lists.
- The page, the custom action and the bindings come from the module, not from
  `template.xml`.
- The run is idempotent: a re-run on a provisioned site reports `Unchanged` for
  every step. `-WhatIf` sends no write.
- The application customizer package has no feature (`features` removed,
  `skipFeatureDeployment: true`); it no longer registers itself, and the
  provisioning step registers it. Feature Framework is now used for neither
  the lists nor the header.
- Consequence "two-step deployment" is reduced to one script run after the
  packages are built; the site still needs a site collection App Catalog,
  which a SharePoint administrator creates once (`docs/deployment.md`). Risk R1
  is handled by the module installing the solutions before it binds them.

---

## Related

- Related ADRs: ADR-002 (no Node on host), ADR-005 (default permissions)
- Related requirements: FR-05, FR-20
- Related documents: design §6.9; Phase D §4; Phase F
- TOGAF phase: D — Technology Architecture
- Decision maker(s): Kiril Iliev (owner)
- Stakeholders: Site admins; builder
