# Continuous integration

GitHub Actions proves on every push and pull request to `main` that the monorepo builds, tests and packages, and that no tenant data or secrets are committed. A `v*` tag also publishes the four `.sppkg` files as a GitHub Release. Nothing is deployed to a tenant.

## Workflows

| File | Trigger | What it does |
|---|---|---|
| `.github/workflows/build.yml` | `workflow_call` only | The pipeline. Called by the two workflows below. |
| `.github/workflows/ci.yml` | push / pull request to `main`, manual | Runs `build.yml`. A newer run on the same ref cancels the older one. |
| `.github/workflows/release.yml` | tag `v*` | Runs `build.yml`, then creates a release for the tag with the four `.sppkg` files attached. A tag containing `-` (for example `v1.2.0-rc.1`) becomes a pre-release. |

All workflows run with `permissions: contents: read`. Only the release's `publish` job gets `contents: write`, which it needs to create the release.

### Job `node` (Build, test, package)

Runs on `ubuntu-latest` inside `docker.io/m365pnp/spfx:1.23.2`, the dev image, so Node, npm and Heft are the same as in local runs. The container runs as root because the image's default user cannot write to the runner's workspace and cache paths.

| Step | Command |
|---|---|
| Hygiene | `npm run hygiene` (before `npm ci`: it needs only git and node) |
| Install | `npm ci`, with the npm cache restored by `actions/cache` (key: hash of `package-lock.json`) |
| Build shared packages | `npm run build:shared` |
| Typecheck MCP server | `npm run typecheck` |
| Package | `npm run package:solutions`: `heft build --production` + `package-solution --production` in each SPFx package |
| Test | `npm run test:all`: the `scripts/ci` tests, then every workspace's `test`, one package at a time |
| Upload | artifact `sppkg` (14 days): `packages/*/sharepoint/solution/*.sppkg` |

Package runs before the tests on purpose. Heft writes the `*.module.scss` typings to `temp/sass-ts`, and the `wp-contract-calendar` suites that import a component with a `.module.scss` file fail to compile under ts-jest until those typings exist. On a fresh clone, build or package once before `test:all`.

`NODE_OPTIONS=--max-old-space-size=3072` is set for the job. The runner has more memory than the shared Podman VM, and the production webpack builds need it.

### Job `powershell` (PowerShell tests)

Runs on `ubuntu-latest` with `pwsh` (Linux minutes are cheaper than Windows, and the tests pass on Linux). It installs PnP.PowerShell 3.x and Pester 5.5+ from the PowerShell Gallery, then runs `scripts/ci/run-pester.ps1`:

- `infra/provisioning/tests/*.Tests.ps1`: self-contained runners (no Pester), run as scripts. Each must exit 0.
- `packages/*/setup/*.Tests.ps1`: Pester 5 suites.

PnP.PowerShell is only loaded to satisfy `#Requires`. The tests replace every PnP cmdlet with a fake, so nothing reaches a tenant.

## Hygiene

`scripts/ci/hygiene.js` lists tracked files with `git ls-files` and checks them in Node, so the result does not depend on which regex engine the local git was built with. It fails on:

| Rule | Matches | Allowed |
|---|---|---|
| `tenant-host` | `<label>.sharepoint.com` | `<tenant>`, `{tenantDomain}`, `$Var` before the dot, `x`, labels starting with `contoso` |
| `onmicrosoft-host` | `<label>.onmicrosoft.com` | same as above |
| `banned-name` | names of earlier employers and clients, at a word start (`reason` does not match) | none. The list is stored ROT13-encoded so the names never appear in plain text. |
| `jwt` | `eyJ…` followed by three long base64url parts | SVG files (base64 in rendered Mermaid diagrams looks like a JWT) |
| `github-token` | `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_` and `github_pat_` tokens | SVG files |
| `env-file` | a tracked `.env` or `.env.*` | names ending in `.sample` |
| `superpowers-path` | anything under `docs/superpowers/` or `.superpowers/` | none |

Findings print as `path:line: [rule] abc****`. The match itself is redacted so the CI log does not leak it again.

**When hygiene fails:** replace the value with a placeholder (`<tenant>`, `{tenantDomain}`). If a secret was committed, rotate it first; removing it from the file does not remove it from history.

**Writing a test sample** that would trip a rule: build the string by concatenation (`'acme' + '.sharepoint.com'`), as `scripts/ci/hygiene.test.js` does, so the test file passes its own scan.

## Reproduce locally

All commands run in the dev container (see [dev-environment.md](dev-environment.md)). Keep the memory cap from the Podman notes.

```powershell
podman compose run --rm shell
```

Then, inside the container:

```bash
export NODE_OPTIONS=--max-old-space-size=1536
npm run hygiene
npm run build:shared
npm run typecheck
npm run package:solutions   # also generates the scss typings the tests need
npm run test:all
```

`hygiene` needs a git repository inside the container. In a `git worktree` the `.git` file points at a Windows path the container cannot read. Either run it from the main checkout, or mount the main `.git` and point git at the worktree's metadata:

```powershell
podman compose run --rm -v "F:/path/to/MonoRepo/.git:/main.git:ro" `
  -e GIT_DIR=/main.git/worktrees/<worktree> -e GIT_WORK_TREE=/usr/app/spfx `
  -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0='*' `
  shell npm run hygiene
```

PowerShell tests, on the host or in `mcr.microsoft.com/powershell:7.4-ubuntu-22.04`:

```powershell
Install-Module PnP.PowerShell -MinimumVersion 3.0.0 -MaximumVersion 3.999.999 -Scope CurrentUser
Install-Module Pester -MinimumVersion 5.5.0 -Scope CurrentUser -SkipPublisherCheck
pwsh -NoProfile -File scripts/ci/run-pester.ps1
```

Lint the workflows:

```powershell
podman run --rm -v "${PWD}:/repo" -w /repo docker.io/rhysd/actionlint:1.7.12 -no-color
```

## Root scripts

| Script | What it does |
|---|---|
| `build` | `build:shared`, then `build` in every other workspace (the shared packages are compiled once) |
| `build:shared` / `test:shared` | build or test `shared-core` and `shared-ui` |
| `test:all` | `test:ci`, then `test` in every workspace, one at a time, with `--maxWorkers=2` |
| `test:ci` | `node --test` over `scripts/ci/*.test.js` |
| `typecheck` | `tsc --noEmit` in `mcp-contract-calendar` |
| `hygiene` | the leak scan above |
| `package` | `build:shared`, then `package:solutions` |
| `package:solutions` | production `package` in every workspace that has one |

`scripts/ci/run-workspaces.js <script> [--skip a,b] [-- args]` runs one script per workspace in sequence. It keeps going after a failure and exits 1 at the end, so one run shows every failing package.

## Adding a package

1. Create `packages/<name>/package.json`. The `packages/*` workspace glob picks it up.
2. Give it the scripts CI should run: `test` (jest), `build`, and for an SPFx solution `package`. The runner skips scripts a package does not define. If `test` is not jest, make sure it accepts `--maxWorkers=2` or ignores extra arguments.
3. For an SPFx solution, the release expects exactly four `.sppkg` files. Update the count in `.github/workflows/release.yml`.
4. PowerShell tests: put Pester suites in `packages/<name>/setup/*.Tests.ps1`. Anything elsewhere needs a line in `scripts/ci/run-pester.ps1`.
5. Local dev only: add the `nm-<name>` volume to `compose.yml` and `.devcontainer/devcontainer.json` (see dev-environment.md). CI does not use the volumes.

## First run

These workflows have been linted with actionlint and the steps were run locally in the containers, but they have not run on GitHub yet. The first real run happens when the owner pushes to `main`. Things to watch on that run:

- the `container:` job running as root (checkout, cache and `git` safe.directory);
- memory during `package:solutions`;
- the npm cache hit on the second run.
