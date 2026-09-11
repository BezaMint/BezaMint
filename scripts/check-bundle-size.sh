#!/usr/bin/env bash
#
# Enforce a budget on the JavaScript the browser is asked to download.
#
# Next.js reports per-route "First Load JS" during a build, but nothing fails
# when that number grows: a new import, a dependency that stops tree-shaking, or
# a component moved from a server to a client boundary all increase the payload
# silently, and the first person to notice is a user on a slow connection. This
# script turns that into a build-time failure, the same way
# `check-wasm-size.sh` does for the contracts.
#
# The budget is deliberately close to the current size: it exists to catch
# regressions, not to bless the status quo. When a change legitimately needs more
# room, raise the budget in the same commit and say why.
#
# Usage:
#   scripts/check-bundle-size.sh [path/to/.next]
#
# Defaults to apps/web/.next, relative to the repository root.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${1:-$ROOT_DIR/apps/web/.next}"

# Total uncompressed bytes of the client JavaScript under .next/static. Measured
# from a clean production build; see the commit that introduced this budget.
BUDGET_BYTES=2100000

purple='\033[0;35m'
red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
reset='\033[0m'

if [ ! -d "$BUILD_DIR/static" ]; then
  echo -e "${red}error:${reset} no production build found at $BUILD_DIR"
  echo "Build the frontend first: pnpm --filter @bezamint/web run build"
  exit 1
fi

total=0
count=0
while IFS= read -r file; do
  size=$(wc -c <"$file" | tr -d ' ')
  total=$((total + size))
  count=$((count + 1))
done < <(find "$BUILD_DIR/static" -type f -name '*.js' | sort)

if [ "$count" -eq 0 ]; then
  echo -e "${red}error:${reset} found no JavaScript under $BUILD_DIR/static"
  exit 1
fi

# Compressed size is what a user actually transfers; reported for context but not
# budgeted, because gzip output varies with the zlib version and would make the
# check non-deterministic across runner images.
gzipped=$(find "$BUILD_DIR/static" -type f -name '*.js' -print0 |
  xargs -0 -r gzip -c 2>/dev/null | wc -c | tr -d ' ')

human() {
  awk -v bytes="$1" 'BEGIN { printf "%.2f MiB", bytes / 1048576 }'
}

pct=$((total * 100 / BUDGET_BYTES))

echo -e "${purple}Client JavaScript${reset}: $count files"
echo "  uncompressed: $(human "$total") ($total bytes, ${pct}% of budget)"
echo "  gzipped:      $(human "$gzipped") ($gzipped bytes)"
echo "  budget:       $(human "$BUDGET_BYTES") ($BUDGET_BYTES bytes)"

if [ "$total" -gt "$BUDGET_BYTES" ]; then
  over=$((total - BUDGET_BYTES))
  echo -e "\n${red}Bundle size check failed:${reset} ${over} bytes over budget." >&2
  echo "Reduce the payload or, if the growth is intentional, raise BUDGET_BYTES" >&2
  echo "in $0 and explain why in the commit message." >&2
  exit 1
fi

echo -e "\n${green}Bundle is within budget.${reset}"
