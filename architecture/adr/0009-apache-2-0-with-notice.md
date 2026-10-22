# 9. Apache-2.0 license with NOTICE attribution

## Date: 2026-10-22

## Status

Accepted

---

## Problem

The repository was initially licensed under MIT, which only requires keeping
the copyright line. The owner wants authorship and contact details
(Orpheus Systems, Kiril Iliev) to travel with every redistribution and
derivative work, without deterring enterprise adopters of a public SharePoint
repository.

---

## Decision

The repository is licensed under the **Apache License 2.0**. `LICENSE` holds
the unmodified license text; a root `NOTICE` file carries the attribution.
Under Section 4(d), redistributions and Derivative Works must include a
readable copy of the NOTICE attribution. Every `package.json` declares
`"license": "Apache-2.0"`. The visible footer attribution in the SharePoint
extensions is appreciated but not required.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| ✅ **Apache-2.0 + NOTICE** | Permissive license with mandatory NOTICE retention | Easy enterprise adoption; attribution via NOTICE is mandatory for redistribution; explicit patent grant | Does not force publishing modifications or keeping the visible footer |
| MIT | Previous choice | Simplest, widely known | Keeps only the copyright line; no NOTICE mechanism |
| AGPL-3.0 with §7(b) attribution + commercial dual license | Strong copyleft with additional attribution terms | Strongest control over use and attribution; dual-licensing revenue path | Deters enterprise adoption; more legal overhead |

---

## Consequences

**Positive:**
- Attribution through NOTICE is a license obligation for redistribution.
- Adoption stays easy for enterprises.

**Negative / Trade-offs:**
- Modifications need not be published, and the visible footer may be removed.

**Risks:**
| Risk ID | Description | Impact (E/H/M/L) | Mitigation |
|---------|-------------|------------------|------------|
| R-LIC-1 | Downstream drops the NOTICE file | M | Section 4(d) makes this a license breach; keep NOTICE at the repo root |

---

## Related

- Related ADRs: ADR-007
- Related requirements: NFR-06
- Related documents: design §1, §8
- TOGAF phase: Preliminary
- Decision maker(s): Kiril Iliev (owner)
- Stakeholders: public repository users; Orpheus Systems
