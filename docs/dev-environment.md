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
