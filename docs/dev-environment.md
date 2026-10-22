# Dev environment

All Node tooling runs in the `docker.io/m365pnp/spfx:1.23.2` container via Podman. No Node install is needed on the host.

## Podman machine (Windows)

```powershell
podman machine init
podman machine start
```

The repo is bind-mounted into the container, so the WSL machine must see the drive the repo lives on. Drives such as `F:` are normally auto-mounted under `/mnt/f`; if the bind mount fails, confirm `podman machine ssh ls /mnt/f` lists the repo.

## Commands

```powershell
.\scripts\podman.ps1 shell
.\scripts\podman.ps1 install
.\scripts\podman.ps1 build
.\scripts\podman.ps1 test
.\scripts\podman.ps1 serve wp-contract-calendar   # sets PKG=@orpheussystems/wp-contract-calendar
.\scripts\podman.ps1 package
```

Or directly: `podman compose run --rm <service>`.

## Dev certificate

Inside the container:

```bash
npx gulp trust-dev-cert
```

Then install `~/.rushstack/rushstack-cert.pem` (copy it out of the container) into the host browser/OS trust store once.

## Hosted workbench

`https://<tenant>.sharepoint.com/_layouts/15/workbench.aspx`

## Linux note

On SELinux hosts, append `:Z` to the bind mount in `compose.yml` (`.:/usr/app/spfx:Z`).

## node_modules live in named volumes

`node_modules` directories are mounted from named volumes (`nm-root`, `nm-shared-core`, `nm-shared-ui`, `nm-wp-contract-calendar`), not from the bind-mounted repo. Why: `npm install` fails with `EPERM` on `chmod` when it writes bin links onto the Windows bind mount.

- The host never sees `node_modules`; editor tooling on the host has no installed types. Use the container or the devcontainer.
- A new package under `packages/` needs its own `nm-<name>` volume line in both `compose.yml` (the `x-spfx` volumes and the top-level `volumes:`) and `.devcontainer/devcontainer.json` (`mounts`).
- Reset: `podman volume rm <name>` (for example `podman volume rm monorepo_nm-root`; check names with `podman volume ls`), then run `npm install` again.
