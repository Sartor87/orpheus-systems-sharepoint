# 4. Client-side PDF generation with pdfmake

## Date: 2026-10-22

## Status

Accepted

---

## Problem

The timesheet is a one-page landscape A4 document (one page per 12 months)
with a header of two label rows, a month × day grid (columns 1–31) whose
cells show hours (`8.00` / `4.00`) with blue on-site, yellow off-site and grey
blocked fills, per-month and grand totals, and three signature boxes. It must
match the reference layout exactly. The solution has no server component.

---

## Decision

We will generate the PDF **in the browser with pdfmake** inside
`shared-ui/pdf`, chosen for table layout control and because it avoids
canvas-to-image blurring. `jsPDF` + `autotable` is the recorded fallback if
bundle size exceeds SPFx guidance. Output is downloaded as
`Timesheet_<ContractCode>_<from>_<to>.pdf`; period defaults to the contract
span and can be trimmed. Saving to a document library is a documented
extension point, not built now.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| ✅ **pdfmake** | Declarative document model with table support | Precise table layout; vector text; no server | Bundle size |
| jsPDF + autotable | Imperative PDF with table plugin | Smaller bundle | Less layout control; fallback only |
| HTML → canvas → image → PDF | Render DOM, rasterise | Easy to match the on-screen look | Blurry output; large files |
| Server-side generation (Azure Function, Power Automate) | Build PDF outside the browser | Could also store the file | Introduces hosting, auth and cost; out of scope |

---

## Consequences

**Positive:**
- No hosting; works in workbench and production alike.
- The PDF model builder is pure logic and unit-testable.

**Negative / Trade-offs:**
- Fonts and colours must be embedded/declared in the bundle.
- Bundle size needs watching.

**Risks:**
| Risk ID | Description | Impact (E/H/M/L) | Mitigation |
|---------|-------------|------------------|------------|
| R1 | pdfmake pushes the web part bundle over SPFx guidance | M | Switch to jsPDF + autotable; supersede this ADR |
| R2 | Layout drifts from the reference image (not committed) | M | Design §6.5 is the full description; verify against it at gate G-5 |

---

## Related

- Related ADRs: ADR-003 (data for the builder)
- Related requirements: FR-14, FR-15, NFR-11
- Related documents: design §6.5, §9, §10; Phase C (application); roadmap RM-3
- TOGAF phase: C — Application Architecture
- Decision maker(s): Kiril Iliev (owner)
- Stakeholders: Builder; contract managers and contractors; approving organisation (signs the output)
