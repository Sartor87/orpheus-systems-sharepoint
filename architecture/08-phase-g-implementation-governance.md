# Phase G — Implementation Governance

## 1. Review gates

| Gate | When | Who | Checks |
|------|------|-----|--------|
| G-1 Design approval | Before building | Owner | Design document status moves from "awaiting approval" to approved; open items in design §11 answered or explicitly deferred |
| G-2 Clean-room check | After WP-0 / orphan branch | Owner | The case-insensitive hygiene grep from design §8 returns nothing in tree and history; author and licence set |
| G-3 Build gate | Every CI run | GitHub Actions | Container build and `package` succeed; `.sppkg` artefacts uploaded |
| G-4 Architecture conformance | Before tenant deployment | Owner | Checklist in §2 |
| G-5 Tenant verification | After provisioning | Owner | Each package exercised on the real site; both roles; PDF matches §6.5 layout |
| G-6 Public release | Before making the repo public | Owner | README complete with screenshots; anti-goals re-checked |

> ⚠️ **Open:** No reviewer other than the owner is named. If a second pair of
> eyes is wanted for G-2 and G-6, record it here.

## 2. Compliance checklist (mutable)

| # | Check | ADR / source | Status |
|---|-------|--------------|--------|
| C1 | Every package builds inside `m365pnp/spfx:1.23.2`; no Node on the host required | ADR-002 | ☐ |
| C2 | Each SPFx package is a standard Yeoman project; shared packages via workspace symlinks and path mapping | ADR-001 | ☐ |
| C3 | Build order `shared-core` → `shared-ui` → SPFx packages via TypeScript project references | ADR-001 | ☐ |
| C4 | No component talks to SharePoint directly; all access via `IDataService` chosen in `onInit` and injected via context | ADR-003 | ☐ |
| C5 | `LocalDataService` fixtures contain one active contract, a bridge pair with 2-week overlap, half days, holidays for BG and `*`, two demo users | ADR-003 | ☐ |
| C6 | One entry per contractor per date is enforced in the service; overlap dialog moves, never duplicates | ADR-008 | ☐ |
| C7 | Visibility filters: `Contractor eq me` / `ContractManager eq me`; role derivation order as design §7 | ADR-005 | ☐ |
| C8 | PDF generated client-side; layout per design §6.5; file name `Timesheet_<ContractCode>_<from>_<to>.pdf` | ADR-004 | ☐ |
| C9 | Bundle size within SPFx guidance, or fallback to jsPDF recorded in an ADR update | ADR-004 | ☐ |
| C10 | Provisioning via `Provision-OrpheusSite.ps1`, idempotent, `-WhatIf` supported, no Feature Framework `elements.xml` for lists | ADR-006 | ☐ |
| C11 | Public repo history starts from the orphan branch | ADR-007 | ☐ |
| C12 | Approving-organisation and service-provider labels are web part properties with neutral defaults | Design §2 anti-goals, §6.4 | ☐ |
| C13 | No real client or previous employer named in code, fixtures, docs, screenshots or history | Design §2, §8 | ☐ |
| C14 | Theme tokens from `shared-ui/theme` used by every artefact | Design §6.6 | ☐ |
| C15 | Field customizer reads only the item's own columns | Design §6.7 | ☐ |
| C16 | Form customizer validation rules BR-6, overlap notice BR-7 | Design §6.8 | ☐ |
| C17 | Unit tests exist for data services, period / overlap / totals logic and the PDF model builder | Design §9 | ☐ |
| C18 | `ContractCalendar.aspx` honours `contractId`; Display form and header menu deep-link to it | Design §6.9 | ☐ |
| C19 | Menu is My calendar · Contracts · Holidays; role-filtered | Design §6.9 | ☐ |
| C20 | `.devcontainer` uses the same image as `podman-compose.yml` | ADR-002 | ☐ |

## 3. Handling deviations

1. A deviation found at any gate is recorded as a line in this file with the
   gate, the finding and the decision (fix, accept, or raise an ADR).
2. A deviation that changes a recorded decision supersedes the ADR (Phase H).
3. Items "left to the builder" (design §9) are not deviations; the builder's
   choice is recorded in the relevant phase document or ADR when made.

| Date | Gate | Finding | Decision |
|------|------|---------|----------|
| — | — | — | — |

## 4. Definition of done for the iteration

All goals G1–G6 of Phase A met; all gates passed; all checklist items ticked
or explicitly deferred with a note.
