#!/usr/bin/env bash
# Builds @quartile/react and drops a tarball into sibling site checkouts, until the package is on npm.
# Usage: scripts/pack-for-sites.sh [site-dir ...]   (defaults to ../quartile-landing-page ../quartile-doc)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
sites=("$@")
if [ ${#sites[@]} -eq 0 ]; then sites=("$root/../quartile-landing-page" "$root/../quartile-doc"); fi

pnpm --dir "$root" --filter @quartile/react build >/dev/null
tmp="$(mktemp -d)"
(cd "$root/packages/react" && pnpm pack --pack-destination "$tmp" >/dev/null)
tarball="$(ls "$tmp"/*.tgz)"
for site in "${sites[@]}"; do
  mkdir -p "$site/vendor"
  rm -f "$site"/vendor/quartile-react-*.tgz
  cp "$tarball" "$site/vendor/"
  # Sample data, refreshed for a site that keeps a copy
  if [ -f "$site/src/data/kestrel.ts" ]; then cp "$root/apps/gallery/src/data/kestrel.ts" "$site/src/data/kestrel.ts"; fi
  # Markdown guides, for a site that renders them (it opts in by having content/library)
  if [ -d "$site/content/library" ]; then
    rm -rf "$site/content/library/language.md" "$site/content/library/guides"
    mkdir -p "$site/content/library/guides"
    cp "$root/docs/language.md" "$site/content/library/language.md"
    cp "$root"/docs/guides/*.md "$site/content/library/guides/"
  fi
  # The agent skill, for a site that serves it (it opts in by having content/skill)
  if [ -d "$site/content/skill" ]; then cp "$root/skills/quartile/SKILL.md" "$site/content/skill/SKILL.md"; fi
  echo "packed $(basename "$tarball") -> $site/vendor"
done
rm -rf "$tmp"
