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
  # Sample data shared by every demo
  if [ -d "$site/src/data" ]; then cp "$root/apps/gallery/src/data/kestrel.ts" "$site/src/data/kestrel.ts"; fi
  echo "packed $(basename "$tarball") -> $site/vendor"
done
rm -rf "$tmp"
