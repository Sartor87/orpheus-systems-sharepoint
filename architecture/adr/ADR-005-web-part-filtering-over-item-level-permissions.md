# ADR-005: Visibility by filtering in the web part rather than item-level permissions

**Date:** 2026-10-22
**Status:** `Accepted`
**TOGAF Phase:** C — Application Architecture (security model)
**Decision Maker(s):** Kiril Iliev (owner)
**Stakeholders:** Contractors, contract managers, site admins

---

## Context

Contractors should see only their own contracts and managers only the ones
they manage. SharePoint can enforce this with item-level permissions, but
that requires breaking inheritance per item (event receiver or flow), makes
provisioning heavier, and the service also needs to update
`OnSiteUsedDays` / `OffSiteUsedDays` on Contracts on every entry write.

---

## Decision

We will keep all three lists at **site-default permissions** this iteration
and enforce visibility **by filtering in the web part / data service**:
contractors get `Contractor eq me`, managers get `ContractManager eq me`.
Role is derived at runtime in order: appears as `Contractor` on at least one
contract → contractor; appears as `ContractManager` → manager; member of the
site Owners group → admin; roles can combine. Contractors therefore hold
Contribute on Contracts; the form customizer, not permissions, keeps them out
of contract editing. This is agreed to be sufficient for now.

**Recorded alternative (hardening option, not built):** per-item permission
breaking on Contracts and CalendarEntries via a provisioning-time event
receiver or Power Automate, plus a read-restricted view for the lists. Tracked
as risk R-SEC-1 and roadmap item RM-2.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| ✅ **Filtering in the data service** | Site-default permissions; role-based OData filters | Simple provisioning; service can maintain used-days columns; adequate for a demo/portfolio tenant | Users with list UI access can read or edit others' rows; relies on the form customizer for contract editing |
| Item-level permissions (event receiver / Power Automate) | Break inheritance per item on create | Enforced by the platform | Extra moving parts; used-days writes need a privileged writer; re-provisioning complexity |
| Separate lists per contractor | Partition by user | Platform-enforced | Does not scale; web part list picker becomes per user |
| Read-restricted views only | Hide rows in views | Easy | Not a security boundary |

---

## Consequences

**Positive:**
- Provisioning stays one idempotent script (ADR-006).
- Used-days columns can be updated by the contractor's own session.

**Negative / Trade-offs:**
- Not a security boundary; acceptable only where users are trusted or data is
  demo data.

**Risks:**
| Risk ID | Description | Impact (E/H/M/L) | Mitigation |
|---------|-------------|------------------|------------|
| R-SEC-1 | A contractor reads or edits another contractor's rows via the list UI | H | Hardening path above; pick up RM-2 before any multi-tenant or sensitive use |

---

## Related

- Related ADRs: ADR-003, ADR-006
- Related requirements: FR-01, FR-03, FR-23
- Related documents: design §6.2, §7; Phase A risk register; Phase E RM-2
