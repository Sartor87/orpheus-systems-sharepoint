# ADR-001: SPFx 1.23.2 on an npm-workspaces monorepo

**Date:** 2026-10-22
**Status:** `Accepted`
**TOGAF Phase:** D — Technology Architecture
**Decision Maker(s):** Kiril Iliev (owner)
**Stakeholders:** Builder; public repository visitors

---

## Context

The repository must become a public SPFx monorepo holding four extensions, a
web part and two shared libraries, and every package must build, bundle and
package to `.sppkg`. The existing repository already uses npm workspaces but
does not build. SPFx 1.23.2 is the latest stable release as of 2026-10-22;
1.24 is RC only. The SPFx toolchain expects each solution to be a standard
Yeoman-generated project.

> 📝 **Assumption:** Staying on the Yeoman project shape keeps the SPFx
> upgrade path (`m365 spfx project upgrade` or equivalent) usable per package.

---

## Decision

We will build on **SPFx 1.23.2** with **npm workspaces** as the monorepo
mechanism. Each SPFx package remains a standard Yeoman-generated project;
shared packages (`@orpheussystems/shared-core`, `@orpheussystems/shared-ui`)
are added via workspace symlinks and TypeScript path mapping in
`tsconfig.base.json`. Build order is enforced with TypeScript project
references: `shared-core` → `shared-ui` → the four SPFx packages. Top-level
scripts: `build`, `serve:<pkg>`, `package` (all `.sppkg` with `--ship`),
`clean`, `provision`. Packages are named `@orpheussystems/<name>`.

---

## Considered Options

| Option | Summary | Pros | Cons |
|--------|---------|------|------|
| ✅ **SPFx 1.23.2 + npm workspaces** | Latest stable; existing convention | Stable toolchain; no extra tooling; Yeoman shape preserved | Workspaces offer less orchestration than dedicated monorepo tools |
| SPFx 1.24 RC | Newer | Newer features | Release candidate; not acceptable for a public showcase |
| pnpm / Yarn / Nx / Turborepo | Alternative monorepo tooling | Richer caching and task graphs | Not the existing convention; extra tooling inside the container; not required at this size |
| Separate repositories per solution | No monorepo | Simplest per package | Shared code duplication; the point is one coherent suite |

---

## Consequences

**Positive:**
- One `npm ci` installs the whole workspace inside the container.
- Shared models, services and theme live once and are consumed by every solution.
- Each solution still looks like a normal SPFx project to the toolchain.

**Negative / Trade-offs:**
- Build order depends on project references being maintained correctly.
- Version pinned to 1.23.2; a bump touches every package and ADR-002's image tag.

**Risks:**
| Risk ID | Description | Impact (E/H/M/L) | Mitigation |
|---------|-------------|------------------|------------|
| R1 | SPFx bundler mishandles symlinked workspace packages | M | Path mapping in `tsconfig.base.json`; verified by the clean-clone build gate |
| R2 | SPFx 1.24 GA soon after release makes 1.23.2 look dated | L | Supersede this ADR at the bump; the container tag makes the upgrade one-line for the environment |

---

## Related

- Related ADRs: ADR-002 (container), ADR-003 (shared-core seam)
- Related requirements: NFR-02
- Related documents: design §3, §4; Phase D
