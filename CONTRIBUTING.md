# Contributing

Thank you for helping improve the Orpheus Systems SharePoint solutions.

## Licence and attribution

By contributing, you agree that your contribution is licensed under the [Apache License 2.0](LICENSE).

Keep the [NOTICE](NOTICE) file in any redistribution or derivative work (Apache-2.0, Section 4(d)). Pull requests that remove or weaken it are not accepted. [ADR 0009](architecture/adr/0009-apache-2-0-with-notice.md) explains the reasoning.

## Before you start

- For anything larger than a small fix, open an issue first and describe the problem and the change you have in mind.
- Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Development environment

All Node tooling runs in the PnP SPFx container through Podman, so no Node install is needed on the host. Setup, commands and troubleshooting are in [docs/dev-environment.md](docs/dev-environment.md). What CI runs, and how to run the same steps locally, is in [docs/ci.md](docs/ci.md).

## How changes are made

- **Tests first.** Write a failing test, watch it fail, then make it pass. Every package has Jest tests, and the PowerShell scripts have Pester tests.
- **Keep the domain rules in `shared-core`.** The web part, the extensions and the MCP server must apply the same rules from the same code: one entry per contractor per date, blocked weekends and holidays, and used days recomputed after every write.
- **SharePoint dates.** Read date-only values with `isoToDateKey`. Never use `new Date(x).toISOString().slice(0, 10)`.
- **No tenant data.** Do not commit tenant URLs, tenant or client ids, secrets or personal accounts. Use placeholders such as `<tenant>`. `npm run hygiene` checks this, and CI fails on any finding.
- **Architecture decisions** go in `architecture/adr/` as `NNNN-short-slug.md`. Use the header `# N. Title` / `## Date: YYYY-MM-DD` / `## Status` / `## Problem`, and include a Mermaid diagram. Add the ADR to `architecture/adr/0000-index.md`.
- **Commits** use [Conventional Commits](https://www.conventionalcommits.org/), for example `fix(shared-core): ...` or `docs: ...`.

## Pull requests

1. Branch from `main`.
2. Make sure `npm run hygiene`, `npm run test:all`, `npm run typecheck` and the Pester tests pass in the container.
3. Describe what changed and why, and link the issue.

## Contact

Questions about white-label builds, customisation or support: kiril.iliev@orpheussystems.com.
