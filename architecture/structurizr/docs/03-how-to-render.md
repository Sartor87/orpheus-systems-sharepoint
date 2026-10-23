# How to render

Everything runs in Podman; nothing is installed on the host (ADR 0002). The compose file next to
the DSL uses its own project name, `orpheus-structurizr`, so it never touches the SPFx services in
the root `compose.yml` project.

## Browse the diagrams, decisions and docs (Structurizr local mode)

From the repository root, PowerShell:

```powershell
podman compose -f architecture/structurizr/compose.yml up
```

Wait for the first page load (about 20 seconds on the 2 GiB Podman machine), then open
http://localhost:8080. The container runs `structurizr local`, the successor of Structurizr Lite.
It reads `workspace.dsl` from this folder, the ADRs from `architecture/adr` (mounted read-only next
to it so that `!adrs ../adr` resolves), the eleven TOGAF phase documents from `architecture/`
(each mounted read-only next to it, file by file, so that `!docs ../00-preliminary.md` and the
others resolve; mounting the whole `architecture/` folder would hide this data directory) and the
suite's model notes from `docs/`. It writes `workspace.json` and a
`.structurizr` folder next to the DSL; both are ignored by git (`architecture/structurizr/.gitignore`).
Stop with `Ctrl+C` or:

```powershell
podman compose -f architecture/structurizr/compose.yml down
```

Change the DSL, refresh the browser. Manual layout edits made in the browser are kept in
`workspace.json`; the committed source of truth stays the DSL, which uses `autolayout`.

If you add a TOGAF phase document, add both a `!docs` line in `workspace.dsl` and a volume line in
`compose.yml`.

Checked on 2026-10-23 after the documentation change: local mode starts with these mounts and
serves the workspace, documentation and decisions pages without errors. A JSON export of the same
DSL holds 17 views, 11 workspace documentation sections (Preliminary to Requirements Management,
in phase order), the three model notes on the suite system, and 19 decisions (the 18 ADRs plus
the index, see N12).

## Structurizr command line (validate and export)

Use the consolidated image `docker.io/structurizr/structurizr`. The older `structurizr/cli` image
is end-of-life: on 2026-10-23 it printed a deprecation banner and exited with code 0 without
validating anything, even for a broken file, so it must not be used as a check.

Validate the workspace:

```powershell
podman run --rm --memory 900m -e JAVA_TOOL_OPTIONS=-Xmx512m -v "${PWD}/architecture:/usr/local/structurizr:Z" docker.io/structurizr/structurizr:latest validate -workspace structurizr/workspace.dsl
```

A valid workspace prints nothing after the JVM banner and exits 0. A broken one prints an `ERROR`
line naming the DSL line and exits 1 (checked on 2026-10-23 with a relationship to a missing
element). Mounting the whole `architecture/` folder lets `../adr` and the `../NN-*.md` documents
resolve.

Export every view to Mermaid (or `plantuml`, `plantuml/c4plantuml`, `dot`, `json`):

```powershell
podman run --rm --memory 900m -e JAVA_TOOL_OPTIONS=-Xmx512m -v "${PWD}/architecture:/usr/local/structurizr:Z" docker.io/structurizr/structurizr:latest export -workspace structurizr/workspace.dsl -format mermaid -output structurizr/export
```

The export folder is ignored by git as well. The image in the repository README,
`views/SuiteContext.png`, is `export/structurizr-SuiteContext.mmd` rendered with
`ghcr.io/mermaid-js/mermaid-cli/mermaid-cli:11.4.2` (`-b white -w 1600 -c views/mmdc-config.json`; the
config's `themeCSS` gives the edge labels dark text on white, because the exported labels are
otherwise white on white). Re-render it when the suite's context changes. Rendered diagrams for the TOGAF documents are not
generated here; the phase documents keep their Mermaid sources, and ADRs keep their SVGs in
`architecture/adr/diagrams`.

The same two commands work from bash inside WSL with `$(pwd)` in place of `${PWD}`. On Linux the
`:Z` relabel is needed only with SELinux; it is harmless elsewhere.

## Memory on the Podman machine

The Podman machine on the developer host has 2 GiB. On 2026-10-23, three Structurizr containers
started in parallel made the machine restart twice and once left a half-pulled image with a broken
layer (`podman rmi` and pull again fixed it). Run one Structurizr container at a time; the compose
file and the commands above cap the JVM at 512 MB and the container at 900 MB. Other compose
projects (the SPFx `shell`, the agent's `mcp`) may be running at the same time and count against
the same 2 GiB. Do not run `wsl --shutdown` to recover; stop the single compose project with
`down` and wait until `podman info` answers again.

## Notes

- The ADR import takes the title from the first line (`# N. Title`) and the status from the line
  after `## Status`. It did **not** read the `## Date: YYYY-MM-DD` heading: every imported decision
  shows the import time as its date. The adr-tools layout the importer expects is a bare `Date:`
  line; see model note N10 before changing the ADR template.
- Links between decisions are detected only from Markdown links to another ADR file. The ADRs
  reference each other with file names in backticks, so the Decisions page shows no links. Model
  note N11.
- `0000-index.md` has no `## Status` and a different first line, so it appears as decision 0,
  "Architecture Decision Records", status Proposed. Harmless, but visible.
- Local mode is for viewing. It does not publish anywhere; the workspace stays on this machine.
