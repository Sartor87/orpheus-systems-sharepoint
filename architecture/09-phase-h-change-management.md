# Phase H — Architecture Change Management

## 1. Change triggers

| Trigger | Example | Expected handling |
|---------|---------|-------------------|
| New SPFx release | SPFx 1.24 reaches GA | Update ADR-001 (supersede with new version), bump container image tag in ADR-002, re-run clean-clone build |
| Bundle-size breach | pdfmake pushes the web part over SPFx guidance | Switch to jsPDF + autotable; supersede ADR-004 |
| Security requirement | Contractors must not see each other's rows via list UI | Pick up RM-2 permissions hardening; supersede ADR-005 |
| Multi-country use | Holidays needed for more than one country | Pick up RM-1 holiday agent; new ADR for the agent runtime |
| Record-keeping need | Signed timesheets must be stored with the contract | Pick up RM-3 PDF storage in a document library; new ADR |
| Schema change | New column or list | Update Phase C data document and provisioning script together; re-run script |
| Owner's open items answered | npm scope confirmed; logo SVG supplied; kicker wording fixed | Close the `⚠️ Open` notes in Phase A / Phase C application |
| Builder decisions | Contractor timesheet button; fixture content; Fluent UI choices | Record in the phase documents; ADR only if it constrains future work |

## 2. Change process

1. Describe the change and its trigger in a short note (issue or PR in the
   public repository).
2. Decide whether it is a **simplification** (update documents in place) or a
   **re-architecture** (new ADR, possibly superseding an existing one).
3. Update the affected phase documents, the ADR index and the requirements log
   in the same change set as the code.
4. Re-run the Phase G checklist items the change touches.

## 3. ADR lifecycle

`Proposed → Accepted → (Deprecated | Superseded by ADR-NNN)`

- An ADR is never edited to say something different; it is superseded.
- Minor corrections (typos, links) may be edited in place.
- The index in `adr/README.md` is the single list of current and historical
  decisions.

## 4. Review cadence

> ⚠️ **Open:** No periodic review cadence is stated. Suggested: revisit this
> folder at each SPFx version bump and whenever a roadmap item starts.

## 5. Roadmap intake

The three roadmap items from the design (holiday agent per country,
permissions hardening, PDF storage in a document library) are tracked in
Phase E §3. Each starts with its own ADR and an update to the affected phase
documents (Phase C data and application for all three; Phase D if a hosted
component appears).

## 6. Change request template

```markdown
### Change request

- **Title:**
- **Trigger:** (see §1)
- **Affected documents / ADRs:**
- **Simplification or re-architecture:**
- **Proposed decision:**
- **Impact on Phase G checklist items:**
- **Decision / date / by:**
```
