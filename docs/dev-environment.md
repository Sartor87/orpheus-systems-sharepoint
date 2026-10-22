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
.\scripts\podman.ps1 serve ext-app-customizer
.\scripts\podman.ps1 serve ext-field-customizer
.\scripts\podman.ps1 serve ext-form-customizer
.\scripts\podman.ps1 package
.\scripts\podman.ps1 trust-dev-cert
```

Or directly: `podman compose run --rm <service>`. To serve one package from a shell: `npm run serve -w @orpheussystems/<package>`. Only one package can be served at a time (all use port 4321).

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

## Debugging the extensions

`serve` runs with `--nobrowser` and prints the debug query string of the `default` configuration in `config/serve.json`. The container listens on `0.0.0.0`; in the browser use `localhost`. Replace `{tenantDomain}` and `{site}` with your test site, open the URL and choose **Load debug scripts**.

Every extension URL starts with the same debug prefix:

```text
?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&noredir=true&loadSPFX=true
```

| Extension | Page | Extra query parameters |
|---|---|---|
| Application customizer (`30930118-2d09-49f4-bdc4-fb2c9b4af49e`) | any site page, e.g. `SitePages/Home.aspx` | `&customActions={"30930118-2d09-49f4-bdc4-fb2c9b4af49e":{"location":"ClientSideExtension.ApplicationCustomizer","properties":{"contractsListUrl":"Lists/Contracts","calendarPageUrl":"SitePages/ContractCalendar.aspx","showFooter":true}}}` |
| Field customizer (`a7721b49-8c3e-48c7-ac67-69408fcc6a03`) | `Lists/Contracts/AllItems.aspx` (view with the `RemainingDays` column) | `&fieldCustomizers={"RemainingDays":{"id":"a7721b49-8c3e-48c7-ac67-69408fcc6a03","properties":{}}}` |
| Form customizer, New (`9ec4e23b-5adb-4be5-af3a-85f46fa4fc27`) | `_layouts/15/SPListForm.aspx` | `&componentId=9ec4e23b-5adb-4be5-af3a-85f46fa4fc27&PageType=8&RootFolder=/sites/{site}/Lists/Contracts` |
| Form customizer, Edit | `_layouts/15/SPListForm.aspx` | `&componentId=9ec4e23b-5adb-4be5-af3a-85f46fa4fc27&PageType=6&RootFolder=/sites/{site}/Lists/Contracts&ID=<item id>` |
| Form customizer, Display | `_layouts/15/SPListForm.aspx` | `&componentId=9ec4e23b-5adb-4be5-af3a-85f46fa4fc27&PageType=4&RootFolder=/sites/{site}/Lists/Contracts&ID=<item id>` |

JSON values must be URL-encoded when typed by hand; the URL `serve` prints is already encoded. The form customizer's `serve.json` also has named configurations `contractNew`, `contractEdit` and `contractDisplay` with the same values.

The browser probes the legacy `http://localhost:4321/temp/manifests.js` and logs a CORS error; it is harmless.

## Packaging

```powershell
.\scripts\podman.ps1 package
```

Builds the shared packages, then runs `heft build --production` and `heft package-solution --production` in every package that has a `package` script. Output, one per package: `packages/<package>/sharepoint/solution/<package>.sppkg` — `wp-contract-calendar`, `ext-app-customizer`, `ext-field-customizer`, `ext-form-customizer`. Packaging all four needs more than the default 2 GB Podman VM; give it at least 6 GB (`podman machine stop; podman machine set --memory 6144; podman machine start`).

## Linux note

On SELinux hosts, append `:Z` to the bind mount in `compose.yml` (`.:/usr/app/spfx:Z`).

## node_modules live in named volumes

`node_modules` directories are mounted from named volumes (`nm-root`, `nm-shared-core`, `nm-shared-ui`, `nm-wp-contract-calendar`, `nm-ext-app-customizer`, `nm-ext-field-customizer`, `nm-ext-form-customizer`), not from the bind-mounted repo. Why: `npm install` fails with `EPERM` on `chmod` when it writes bin links onto the Windows bind mount.

- The host never sees `node_modules`; editor tooling on the host has no installed types. Use the container or the devcontainer.
- A new package under `packages/` needs its own `nm-<name>` volume line in `compose.yml` (the `x-spfx` volumes, the `fix-perms` chown list and the top-level `volumes:`) and in `.devcontainer/devcontainer.json` (`mounts`).
- Reset volumes:
  1. `podman volume ls` to check names, then `podman volume rm <name>`, for example `podman volume rm monorepo_nm-root`.
  2. `podman compose run --rm fix-perms`
  3. `.\scripts\podman.ps1 install`
