#!/usr/bin/env bash
# Builds the architecture site for GitHub Pages.
#   $1  folder with the Mermaid views exported from architecture/structurizr/workspace.dsl
#   $2  output folder
# Only the TOGAF phases (architecture/NN-*.md) and the ADRs (architecture/adr/NNNN-*.md) become pages.
# They mirror the repository layout under <out>/architecture/, so relative links between them keep
# working after .md -> .html; links to any other file go to GitHub (see links.lua).
set -euo pipefail

VIEWS_DIR="${1:?views folder}"
OUT="${2:?output folder}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# owner/name; set by GitHub Actions, pass it yourself for a local build.
REPO="${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY=owner/name}"

rm -rf "$OUT"
mkdir -p "$OUT/architecture/adr"
cp -r architecture/adr/diagrams "$OUT/architecture/adr/diagrams"

title_of() { grep -m1 '^# ' "$1" | sed 's/^# //'; }
status_of() { awk '/^## Status/{f=1;next} /^## /{f=0} f&&/^(Proposed|Accepted|Deprecated|Superseded)/{print $1; exit}' "$1"; }
html_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
# A Markdown heading for the index: escaped, `code` spans kept as <code>.
title_html() { title_of "$1" | html_escape | sed -E 's/`([^`]+)`/<code>\1<\/code>/g'; }

# Renders one Markdown file of architecture/ to <out>/<same path>.html.
render() {
  local src="$1" rel depth root
  rel="${src%.md}.html"
  depth=$(awk -F/ '{print NF-1}' <<< "$rel")
  root=$(printf '../%.0s' $(seq 1 "$depth"))
  sed -e "s|{{ROOT}}|$root|g" -e "s|{{REPO}}|$REPO|g" "$HERE/nav.html" > "$OUT/.nav.html"
  pandoc "$src" --from gfm --to html5 --standalone \
    --metadata title="$(title_of "$src")" --metadata pagetitle="$(title_of "$src") | Orpheus Systems" \
    --metadata srcdir="$(dirname "$src")" --metadata repo="$REPO" \
    --lua-filter "$HERE/links.lua" \
    -H "$HERE/head.html" -B "$OUT/.nav.html" -A <(printf '</main>\n') \
    -o "$OUT/$rel"
}

for f in architecture/[0-9][0-9]-*.md architecture/adr/[0-9][0-9][0-9][0-9]-*.md; do
  case "$f" in */0000-*) continue ;; esac
  [ -f "$f" ] && render "$f"
done
rm -f "$OUT/.nav.html"

# Index: C4 views, TOGAF phases, ADRs.
{
  printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n'
  printf '<title>Architecture | Orpheus Systems Contract Calendar</title>\n'
  cat "$HERE/head.html"
  printf '</head><body>\n'
  sed -e 's|{{ROOT}}||g' -e "s|{{REPO}}|$REPO|g" "$HERE/nav.html"
  printf '<h1>Contract Calendar: architecture</h1>\n'
  printf '<p class="muted">Generated from <code>architecture/</code> on every change to <code>main</code>: the C4 views come from the Structurizr workspace, the documents from the TOGAF phases and the Architecture Decision Records. Built %s.</p>\n' "$(date -u +'%Y-%m-%d %H:%M UTC')"

  printf '<h2 id="views">C4 views</h2>\n'
  shopt -s nullglob
  views=("$VIEWS_DIR"/*.mmd)
  [ ${#views[@]} -gt 0 ] || { echo "No Mermaid views in $VIEWS_DIR" >&2; exit 1; }
  # Views in the order the workspace declares them (landscape down to deployment), with its description.
  # A view declaration reads: <kind> [scope] "Key" "Description" {
  shown=0
  while IFS=$'\t' read -r key desc; do
    mmd="$VIEWS_DIR/structurizr-$key.mmd"
    [ -f "$mmd" ] || continue
    printf '<div class="card"><h3>%s</h3><p class="muted">%s</p><pre class="mermaid">' "$key" "$(html_escape <<< "$desc")"
    html_escape < "$mmd"
    printf '</pre></div>\n'
    shown=$((shown + 1))
  done < <(grep -E '^\s*(systemLandscape|systemContext|container|component|dynamic|deployment)\s.*\{\s*$' architecture/structurizr/workspace.dsl \
            | sed -E 's/^[^"]*"([^"]+)"[[:space:]]+"([^"]*)".*/\1\t\2/')
  [ "$shown" -eq ${#views[@]} ] || { echo "Showing $shown of ${#views[@]} exported views; check the view declarations in workspace.dsl" >&2; exit 1; }

  printf '<h2 id="togaf">TOGAF phases</h2>\n<ul class="list">\n'
  for f in architecture/[0-9][0-9]-*.md; do
    [ -f "$f" ] || continue
    printf '<li><a href="%s">%s</a></li>\n' "${f%.md}.html" "$(title_html "$f")"
  done
  printf '</ul>\n'

  printf '<h2 id="adrs">Architecture Decision Records</h2>\n<ul class="list">\n'
  for f in architecture/adr/[0-9][0-9][0-9][0-9]-*.md; do
    case "$f" in */0000-*) continue ;; esac
    s=$(status_of "$f"); s=${s:-Unknown}
    printf '<li><a href="%s">%s</a><span class="status %s">%s</span></li>\n' "${f%.md}.html" "$(title_html "$f")" "$s" "$s"
  done
  printf '</ul>\n'
  printf '<footer class="site">Diagrams are rendered in the browser with Mermaid. Source: <a href="https://github.com/%s/tree/main/architecture">architecture/</a> · Apache-2.0 · <a href="https://orpheussystems.com/">Orpheus Systems</a></footer>\n' "$REPO"
  printf '</main></body></html>\n'
} > "$OUT/index.html"

touch "$OUT/.nojekyll"
echo "Site built in $OUT:"; find "$OUT" -name '*.html' | wc -l
