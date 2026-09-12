#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BezaMint — end-to-end smoke test
# ─────────────────────────────────────────────────────────────
# Exercises the running app over HTTP, against a real RPC and real contracts.
#
# Why this exists alongside the unit suite
# ----------------------------------------
# The unit tests mock the RPC and mock the contract reader. That is the right way
# to test decoding, caching and error mapping, but it means an entire class of
# defect is invisible to them: the app talking to a live chain. Every one of the
# following shipped broken while the suite was green --
#
#   * the event filter was rejected by the RPC, so four routes answered 500
#   * the cold-start ledger window sat outside the event retention period, so the
#     feed was permanently empty
#   * contract values arrived as `bigint`, which JSON cannot serialize, so three
#     routes answered 500 as soon as there was any data to return
#
# -- and each of them only appears when the app is pointed at a seeded network.
# This script is the check that would have caught all three in a single run.
#
# Usage
#   bash scripts/smoke-test.sh                       # http://localhost:3000
#   SMOKE_BASE_URL=https://my-deployment bash scripts/smoke-test.sh
#
# Exit code is non-zero if any expectation fails.
#
# Two tiers
# ---------
# The script asserts two different kinds of thing, and they have different
# remedies. The readiness tier -- liveness, readiness, RPC reachable, all five
# contracts wired, input validation -- is about the code that was deployed. The
# data tier -- a positive supply, indexed events, non-empty list routes -- is
# about the *environment* that code was pointed at: it only holds on a seeded
# deployment, and it depends on the contract ids the host has configured rather
# than on anything in this repository.
#
# SMOKE_REQUIRE_SEEDED=1 (the default) gates on both, which is what a local run
# against a seeded deployment wants. SMOKE_REQUIRE_SEEDED=0 gates on the
# readiness tier alone and reports the data tier as warnings, so an automated
# check against a deployment whose environment CI cannot inspect reports the
# gap loudly without going permanently red -- a check that always fails is a
# check nobody reads.
# ─────────────────────────────────────────────────────────────

set -uo pipefail

BASE_URL="${SMOKE_BASE_URL:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}"
REQUIRE_SEEDED="${SMOKE_REQUIRE_SEEDED:-1}"

PASSED=0
FAILED=0
FAILURES=()
WARNED=0
WARNINGS=()

# `body` and `status` are set by `request`.
body=""
status=""

request() {
  local path="$1"
  local timeout="${SMOKE_TIMEOUT:-60}"
  local out
  out="$(curl -sS --max-time "$timeout" -w '\n%{http_code}' "$BASE_URL$path" 2>&1)" || {
    body="$out"
    status="000"
    return 1
  }
  status="${out##*$'\n'}"
  body="${out%$'\n'*}"
}

check() {
  local label="$1"
  local condition="$2" # "true"/"false" as a string from the caller's test
  if [ "$condition" = "1" ]; then
    PASSED=$((PASSED + 1))
    printf '  \033[32m✓\033[0m %s\n' "$label"
  else
    FAILED=$((FAILED + 1))
    FAILURES+=("$label")
    printf '  \033[31m✗\033[0m %s\n' "$label"
  fi
}

# Assert an HTTP status. A 5xx is always a failure, whatever else passes.
check_status() {
  local label="$1" expected="$2"
  check "$label (HTTP $status)" "$([ "$status" = "$expected" ] && echo 1 || echo 0)"
}

# Assert something that is only true of a seeded deployment. Downgraded to a
# warning when SMOKE_REQUIRE_SEEDED=0, so the readiness tier can still gate.
check_data() {
  local label="$1"
  local condition="$2"
  if [ "$REQUIRE_SEEDED" = "1" ]; then
    check "$label" "$condition"
  elif [ "$condition" = "1" ]; then
    PASSED=$((PASSED + 1))
    printf '  \033[32m✓\033[0m %s\n' "$label"
  else
    WARNED=$((WARNED + 1))
    WARNINGS+=("$label")
    printf '  \033[33m!\033[0m %s \033[33m(data tier: not gated)\033[0m\n' "$label"
  fi
}

# POST a JSON body, optionally claiming to come from `origin` and/or presenting
# an API key, recording `body` and `status` exactly as `request` does.
post_json() {
  local path="$1" data="$2" origin="${3:-}" api_key="${4:-}"
  local timeout="${SMOKE_TIMEOUT:-60}"
  local args=(
    -sS --max-time "$timeout" -X POST
    -H 'content-type: application/json' -d "$data"
    -w $'\n%{http_code}'
  )
  [ -n "$origin" ] && args+=(-H "Origin: $origin")
  [ -n "$api_key" ] && args+=(-H "x-api-key: $api_key")

  local out
  out="$(curl "${args[@]}" "$BASE_URL$path" 2>&1)" || {
    body="$out"
    status="000"
    return 1
  }
  status="${out##*$'\n'}"
  body="${out%$'\n'*}"
}

# Query the JSON body with a node expression that must evaluate truthy.
# Using node rather than grep keeps the assertions about values, not formatting.
json_ok() {
  local expression="$1"
  printf '%s' "$body" | node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk)).on("end", () => {
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        process.exit(1);
      }
      try {
        process.exit(Function("data", `return Boolean(${process.argv[1]})`)(value) ? 0 : 1);
      } catch {
        process.exit(1);
      }
    });
  ' "$expression" >/dev/null 2>&1 && echo 1 || echo 0
}

echo "Smoke testing $BASE_URL"
echo ""

# ── Liveness and readiness ───────────────────────────────────
echo "health"
request "/api/health/live"
check_status "GET /api/health/live" "200"
check "liveness reports ok" "$(json_ok 'data.status === "ok"')"

request "/api/health"
check_status "GET /api/health" "200"
check "RPC reachable" "$(json_ok 'data.checks.rpc.ok === true')"
# A single expression, not a statement list: this is spliced into a `return`.
check "all five contracts are wired" "$(json_ok '
  data.checks.contracts &&
  data.checks.contracts.nft === true &&
  data.checks.contracts.collection === true &&
  data.checks.contracts.royalty === true &&
  data.checks.contracts.creator === true &&
  data.checks.contracts.factory === true
')"
check "readiness reports every contract" "$(json_ok 'data.checks.contractsConfigured === true')"
check "indexer reports a refresh" "$(json_ok 'typeof data.checks.indexer.lastRefreshAt === "number" && data.checks.indexer.lastRefreshAt > 0')"

# ── Configuration surface ────────────────────────────────────
echo "config"
request "/api/config"
check_status "GET /api/config" "200"
check "config confirms contracts are configured" "$(json_ok 'data.data.contractsConfigured === true')"
check "config names the network" "$(json_ok 'typeof data.data.network === "string" && data.data.network.length > 0')"

# ── Indexer-backed reads ─────────────────────────────────────
# These are the assertions that fail on an unseeded or misconfigured deployment,
# and the ones the mocked tests cannot make.
echo "stats"
request "/api/stats"
check_status "GET /api/stats" "200"
check_data "NFT supply is a positive number" "$(json_ok 'typeof data.data.nftSupply === "number" && data.data.nftSupply > 0')"
check_data "collection count is a positive number" "$(json_ok 'typeof data.data.collections === "number" && data.data.collections > 0')"
check_data "indexer has ingested events" "$(json_ok 'data.data.indexer.eventCount > 0')"
check_data "recent mints were observed" "$(json_ok 'data.data.recentMints.count > 0')"

echo "tokens"
request "/api/nfts?limit=3"
check_status "GET /api/nfts" "200"
check_data "tokens are listed" "$(json_ok 'Array.isArray(data.data) && data.data.length > 0')"
check "tokens carry the fields the UI renders" "$(json_ok '
  data.data.every((n) =>
    typeof n.tokenId === "number" &&
    typeof n.metadataUri === "string" && n.metadataUri.length > 0 &&
    typeof n.txHash === "string" && n.txHash.length === 64
  )
')"

echo "collections"
request "/api/collections?limit=3"
check_status "GET /api/collections" "200"
check_data "collections are listed" "$(json_ok 'Array.isArray(data.data) && data.data.length > 0')"
check "collections carry the fields the UI renders" "$(json_ok '
  data.data.every((c) =>
    typeof c.id === "number" &&
    typeof c.metadataUri === "string" && c.metadataUri.length > 0 &&
    typeof c.nftCount === "number" &&
    typeof c.isArchived === "boolean"
  )
')"

echo "creators"
request "/api/creators?limit=3"
check_status "GET /api/creators" "200"
check "creator list is an array" "$(json_ok 'Array.isArray(data.data)')"

echo "search"
request "/api/search"
check_status "GET /api/search" "200"
check "search returns a data array" "$(json_ok 'Array.isArray(data.data)')"

# ── Input handling ───────────────────────────────────────────
# A rejected request must be rejected explicitly, not by crashing.
echo "validation"
request "/api/nfts?creator=not-an-address"
check_status "GET /api/nfts with a bad creator" "400"
check "bad input is reported as BAD_REQUEST" "$(json_ok 'data.error.code === "BAD_REQUEST"')"

request "/api/pagination-ish"
check_status "GET /api/pagination-ish (unknown route)" "404"

# ── Authorizing a mutating request ───────────────────────────
# A POST that another site's page could have originated must be refused, whatever
# the deployment's environment says: this is the code that was deployed, so it
# gates. Nothing here can succeed, so it spends no pinning quota and can run
# against production on every deploy -- which matters, because a mutating surface
# is exactly the kind that breaks silently when its authorization is reworked.
echo "authorization"
post_json "/api/ipfs/upload" '{"name":"smoke test"}' 'https://smoke-test.invalid'
check_status "POST /api/ipfs/upload from another origin" "403"
check "the refusal is reported as FORBIDDEN" "$(json_ok 'data.error.code === "FORBIDDEN"')"

# ── IPFS round trip (opt in) ─────────────────────────────────
# A minimal valid document, so the assertion is about the pinning path rather
# than about the schema. Opt-in because a successful run pins real content.
if [ "${SMOKE_IPFS_UPLOAD:-0}" = "1" ]; then
  echo "ipfs"
  post_json "/api/ipfs/upload" \
    '{"name":"BezaMint smoke test","description":"Pinned by scripts/smoke-test.sh"}' \
    "$BASE_URL" "${SMOKE_API_KEY:-}"
  check_status "POST /api/ipfs/upload from the app's own origin" "200"
  check_data "a real CID came back rather than a fallback URI" "$(json_ok '
    typeof data.cid === "string" && data.cid.length > 0 && data.fallback !== true
  ')"
fi

# ── Result ───────────────────────────────────────────────────
echo ""
if [ "$WARNED" -gt 0 ]; then
  echo -e "\033[33m$WARNED data-tier check(s) not satisfied\033[0m"
  for warning in "${WARNINGS[@]}"; do
    echo "  - $warning"
  done
  echo "  (expected on a deployment that is unseeded, or whose configured"
  echo "   contract set has aged out of the RPC's event retention window)"
  echo ""
fi

if [ "$FAILED" -gt 0 ]; then
  echo -e "\033[31m$FAILED failed\033[0m, $PASSED passed"
  echo ""
  echo "Failures:"
  for failure in "${FAILURES[@]}"; do
    echo "  - $failure"
  done
  exit 1
fi

echo -e "\033[32mAll $PASSED checks passed\033[0m"
