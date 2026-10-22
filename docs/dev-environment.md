# Dev environment

All Node tooling runs in the `docker.io/m365pnp/spfx:1.23.2` container via Podman. No Node install is needed on the host. SPFx 1.23 uses the Heft toolchain (`@rushstack/heft` with the `@microsoft/spfx-web-build-rig`), not gulp.

## Podman machine (Windows)

```powershell
podman machine init
podman machine start
```

The repo is bind-mounted into the container, so the WSL machine must see the drive the repo lives on. Drives such as `F:` are normally auto-mounted under `/mnt/f`; if the bind mount fails, confirm `podman machine ssh ls /mnt/f` lists the repo.

## First run

```powershell
podman compose run --rm fix-perms   # once, after the named volumes are created
.\scripts\podman.ps1 install
```

## Commands

```powershell
.\scripts\podman.ps1 fix-perms
.\scripts\podman.ps1 shell
.\scripts\podman.ps1 install
.\scripts\podman.ps1 build
.\scripts\podman.ps1 test
.\scripts\podman.ps1 serve wp-contract-calendar   # npm run serve -w @orpheussystems/wp-contract-calendar
.\scripts\podman.ps1 package
.\scripts\podman.ps1 trust-dev-cert
```

Or directly: `podman compose run --rm <service>`. To serve one web part from a shell: `npm run serve -w @orpheussystems/wp-contract-calendar`.

## Container user

The compose services run as uid `1000:1000` (the image's `node` user), with `HOME=/home/spfx`. The Windows bind mount (drvfs over 9p) is owned by uid 1000 and refuses `chmod`/`fchmod` from any other uid, which breaks `fs.copyFile` and therefore Heft's copy steps (`EPERM: operation not permitted, copyfile ...`).

Named volumes are created owned by root or the image's default user (`spfx`, uid 1001), so uid 1000 cannot write to them until `fix-perms` runs. `fix-perms` runs as root and does `chown -R 1000:1000` on `/home/spfx/.npm`, `/home/spfx/.rushstack` and every `node_modules` volume. `/home/spfx` itself is not writable by uid 1000. Only those mounted subfolders are.

The devcontainer uses `containerUser`/`remoteUser` `node` (uid 1000). Its volumes need the same one-time `chown`.

## Dev certificate

```powershell
.\scripts\podman.ps1 trust-dev-cert
```

That runs `heft --unmanaged trust-dev-cert` in the web part package. The cert is stored in the `rushstack` volume (`/home/spfx/.rushstack`), so it survives container restarts. Inside Linux Heft cannot trust the cert automatically. Copy `/home/spfx/.rushstack/rushstack-ca.pem` out of the container and import it once into the host's trusted root store, for example via `certmgr.msc`.

## Heft notes

- Package scripts call `heft --unmanaged ...`. Heft's version selector only looks for `<package>/node_modules/@rushstack/heft`, and npm workspaces hoist it to the root `node_modules`. `--unmanaged` uses the hoisted copy.
- The web part `tsconfig.json` overrides `outDir`, `rootDir`, `rootDirs`, `include` and `typeRoots`. The rig's values are relative to the rig's install folder and point outside the package when the rig is hoisted.
- Keep a single TypeScript version across the workspace (`~5.8.0`). If two versions are installed, Heft's lint step fails with `Parsing error: Cannot read properties of undefined (reading 'kind')`.

## Hosted workbench

`https://<tenant>.sharepoint.com/_layouts/15/workbench.aspx`

## Linux note

On SELinux hosts, append `:Z` to the bind mount in `compose.yml` (`.:/usr/app/spfx:Z`).

## node_modules live in named volumes

`node_modules` directories are mounted from named volumes (`nm-root`, `nm-shared-core`, `nm-shared-ui`, `nm-wp-contract-calendar`), not from the bind-mounted repo. Why: `npm install` fails with `EPERM` on `chmod` when it writes bin links onto the Windows bind mount.

- The host never sees `node_modules`; editor tooling on the host has no installed types. Use the container or the devcontainer.
- A new package under `packages/` needs its own `nm-<name>` volume line in `compose.yml` (the `x-spfx` volumes, the `fix-perms` chown list and the top-level `volumes:`) and in `.devcontainer/devcontainer.json` (`mounts`).
- Reset volumes:
  1. `podman volume ls` to check names, then `podman volume rm <name>`, for example `podman volume rm monorepo_nm-root`.
  2. `podman compose run --rm fix-perms`
  3. `.\scripts\podman.ps1 install`
