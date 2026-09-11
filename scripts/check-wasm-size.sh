#!/usr/bin/env bash
#
# Enforce a size budget on the compiled Soroban contracts.
#
# Soroban enforces a hard maximum on the size of a contract's Wasm blob when it
# is uploaded to the network. Exceeding it is not a lint error — the upload
# transaction is simply rejected, so the failure only shows up at deploy time.
# This script turns that into a build-time failure and makes size growth
# explicit, because every byte of Wasm is paid for by every deployer of the
# contract and by every invocation that crosses the contract boundary.
#
# The per-contract budgets below are deliberately close to the current sizes:
# they exist to catch regressions, not to bless the status quo. When a change
# legitimately needs more room, raise the budget in the same commit and say why.
#
# Usage:
#   scripts/check-wasm-size.sh [path/to/wasm/dir]
#
# Defaults to contracts/target/wasm32-unknown-unknown/release.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_DIR="${1:-$ROOT_DIR/contracts/target/wasm32-unknown-unknown/release}"

# Soroban's network limit for an uploaded contract (64 KiB).
HARD_LIMIT=65536

# Per-contract budgets in bytes: name=budget
BUDGETS=(
  "bezamint_nft=45000"
  "bezamint_collection=40000"
  "bezamint_royalty=34000"
  "bezamint_creator=34000"
  "bezamint_factory=16000"
)

purple='\033[0;35m'
red='\033[0;31m'
green='\033[0;32m'
yellow='\033[0;33m'
reset='\033[0m'

if [ ! -d "$WASM_DIR" ]; then
  echo -e "${red}error:${reset} wasm output directory not found: $WASM_DIR"
  echo "Build the contracts first: pnpm run contract:build"
  exit 1
fi

failed=0
checked=0

for entry in "${BUDGETS[@]}"; do
  name="${entry%%=*}"
  budget="${entry##*=}"
  file="$WASM_DIR/$name.wasm"

  if [ ! -f "$file" ]; then
    echo -e "${red}error:${reset} missing artifact for $name ($file)"
    failed=1
    continue
  fi

  size=$(wc -c < "$file" | tr -d ' ')
  checked=$((checked + 1))

  if [ "$size" -gt "$HARD_LIMIT" ]; then
    echo -e "${red}FAIL${reset} $name: $size bytes exceeds the Soroban upload limit ($HARD_LIMIT bytes)"
    failed=1
  elif [ "$size" -gt "$budget" ]; then
    echo -e "${yellow}WARN${reset} $name: $size bytes exceeds the $budget byte budget"
    failed=1
  else
    pct=$((size * 100 / budget))
    echo -e "${green}ok${reset}   $name: $size bytes (${pct}% of $budget budget)"
  fi
done

# Any contract that produced a Wasm blob but is missing a budget would otherwise
# silently escape the check.
#
# `*.optimized.wasm` is excluded: it is a byproduct of `stellar contract optimize`
# (run by scripts/deploy.sh), not a contract this repository builds or deploys
# directly. Treating it as an unbudgeted artifact made the gate fail on any tree
# where the deploy script had been run, which trains people to ignore the gate
# rather than trust it.
while IFS= read -r file; do
  name="$(basename "$file" .wasm)"
  known=0
  for entry in "${BUDGETS[@]}"; do
    [ "${entry%%=*}" = "$name" ] && known=1
  done
  if [ "$known" -eq 0 ]; then
    echo -e "${yellow}WARN${reset} $name: no size budget declared in $0"
    failed=1
  fi
done < <(find "$WASM_DIR" -maxdepth 1 -name '*.wasm' ! -name '*.optimized.wasm' | sort)

if [ "$failed" -ne 0 ]; then
  echo -e "\n${red}Wasm size check failed.${reset} Optimize the contract or, if the growth is intentional, update BUDGETS in $0."
  exit 1
fi

echo -e "\n${green}All $checked contracts are within budget.${reset} (hard limit $HARD_LIMIT bytes)"
