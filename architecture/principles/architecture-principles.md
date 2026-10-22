# Architecture Principles

Principles extracted from the design document. Each one is already reflected
in a decision or constraint; the "Implications" column points to where.

| # | Principle | Statement | Rationale | Implications |
|---|-----------|-----------|-----------|--------------|
| P1 | Builds from a clean clone | Any machine with Podman installed must build, bundle and package every solution with no other prerequisites. | A build that only works on the author's machine is listed as an anti-goal. | ADR-002; `podman-compose.yml`; CI runs the same container. |
| P2 | Clean-room public code | Nothing in the working tree or the history identifies a previous employer or a real client. | Required for a public, portfolio-grade repository. | ADR-007; the case-insensitive hygiene grep from design §8 must return nothing; configurable labels on the timesheet. |
| P3 | One data access seam | No component talks to SharePoint directly; all reads and writes go through `IDataService`. | Lets the web part run with fixtures in the workbench and against real lists in production with the same UI code. | ADR-003; service chosen once in `onInit`, injected via React context. |
| P4 | Provisioning is repeatable | Site artefacts are created by a script that can be re-run safely. | Feature Framework runs once and cannot upgrade a schema or place pages and customizers. | ADR-006; `Provision-OrpheusSite.ps1` with `-WhatIf`. |
| P5 | Calendar entries belong to a contract | A day is always recorded against a specific contract, never only a person, and a contractor has at most one entry per date. | Bridge contracts overlap; counting must be unambiguous. | ADR-008; overlap dialog moves a day, never duplicates it. |
| P6 | Visibility is enforced where the data is read | Row visibility is implemented by role-based filtering in the data service, with permission hardening documented as a later option. | Sufficient for this iteration; keeps provisioning simple. | ADR-005; risk R-SEC-1 in Phase A. |
| P7 | Nothing leaves the browser that need not | The timesheet PDF is built client-side; no server component is introduced. | SPFx-only solution; no Azure Functions or other hosting required. | ADR-004. |
| P8 | Standard SPFx shape per package | Each SPFx package stays a standard Yeoman-generated project; the monorepo adds shared packages via workspace symlinks and path mapping. | Keeps compatibility with the SPFx toolchain and its upgrade path. | ADR-001; TypeScript project references `shared-core` → `shared-ui` → extensions. |
| P9 | One product look | Theme tokens (amber `#E0A83A`, dark `#0B0D10`, text greys, font stack) live in `shared-ui/theme` and are reused by every artefact. | The header, footer, web part and forms should read as one suite. | Phase C application architecture. |
| P10 | Credible demo data | Fixtures must look real: bridge contracts, half days, holidays for a country and for `*`. | A fake-looking demo is an anti-goal. | `LocalDataService` fixtures; Phase C data architecture. |
| P11 | Configurable labels, neutral defaults | Any label that could name an organisation is a web part property with a neutral default. | Anti-goal: identifying a real client. | Approving organisation defaults to "Client approval"; service provider defaults to "Service provider". |

> ⚠️ **Open:** The design does not state formal principles beyond the goals,
> non-goals and anti-goals in its §2. The table above is a reading of those;
> the owner should confirm it before the principles are treated as binding.
