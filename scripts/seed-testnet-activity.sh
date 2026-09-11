#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BezaMint — seed real on-chain activity on a deployed testnet
# ─────────────────────────────────────────────────────────────
# A deployment with zero mints is indistinguishable from a broken one: every
# read route (`/api/nfts`, `/api/collections`, `/api/stats`, the activity feed)
# derives from indexed events, so an unseeded deployment returns `200 OK` with
# empty arrays. This script makes the deployment answer with real data.
#
# What it does
#   1. Refuses to run against mainnet, and refuses to run without a funded key
#   2. Reads the deployed contract IDs from apps/web/.env.local
#   3. For each document in demo/metadata/collections/, creates a collection and
#      batch-mints that collection's tokens through factory.mint_batch_with_royalty,
#      which mints, files the token under the collection and records its royalty
#      terms in one atomic invocation
#   4. Writes demo/seed-manifest.json recording collection ids, token ids and tx
#      hashes, and prints explorer links
#
# Idempotent: a collection whose metadata URI is already on chain is skipped, so
# re-running after a partial failure does not create duplicates.
#
# Usage
#   bash scripts/seed-testnet-activity.sh
#   SEED_KEY_NAME=deployer bash scripts/seed-testnet-activity.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${SEED_ENV_FILE:-$ROOT/apps/web/.env.local}"
MANIFEST="$ROOT/demo/seed-manifest.json"

# The contract caps a batch at 25 and rejects an empty or oversized batch by
# name, so a collection larger than this is split across transactions.
MAX_BATCH_MINT=25

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE not found. Deploy first: bash scripts/deploy.sh"
  exit 1
fi

# Read one KEY=value out of the env file. Values contain spaces and semicolons
# (the network passphrase does), so the file cannot simply be `source`d — an
# unquoted `;` would start a new command.
env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | head -1
}

NETWORK="${NEXT_PUBLIC_STELLAR_NETWORK:-$(env_value NEXT_PUBLIC_STELLAR_NETWORK)}"
RPC_URL="${NEXT_PUBLIC_STELLAR_RPC_URL:-$(env_value NEXT_PUBLIC_STELLAR_RPC_URL)}"
PASSPHRASE="${NEXT_PUBLIC_STELLAR_PASSPHRASE:-$(env_value NEXT_PUBLIC_STELLAR_PASSPHRASE)}"
FACTORY_ID="${NEXT_PUBLIC_FACTORY_CONTRACT_ID:-$(env_value NEXT_PUBLIC_FACTORY_CONTRACT_ID)}"
COLLECTION_ID="${NEXT_PUBLIC_COLLECTION_CONTRACT_ID:-$(env_value NEXT_PUBLIC_COLLECTION_CONTRACT_ID)}"
NFT_ID="${NEXT_PUBLIC_NFT_CONTRACT_ID:-$(env_value NEXT_PUBLIC_NFT_CONTRACT_ID)}"
EXPLORER="${NEXT_PUBLIC_EXPLORER_URL:-$(env_value NEXT_PUBLIC_EXPLORER_URL)}"

# Seeding is a testnet-only operation. There is no flag that overrides this: a
# mistaken mainnet run would create real collections and burn real fees under a
# key that should never be pointed at production by a demo script.
case "$NETWORK" in
  testnet | futurenet | local | standalone) ;;
  *)
    echo "❌ Refusing to seed network '$NETWORK'. This script only touches test networks."
    exit 1
    ;;
esac

for pair in "FACTORY:$FACTORY_ID" "COLLECTION:$COLLECTION_ID" "NFT:$NFT_ID"; do
  name="${pair%%:*}"
  value="${pair#*:}"
  if [ -z "$value" ]; then
    echo "❌ ${name}_CONTRACT_ID is not set in $ENV_FILE. Deploy first."
    exit 1
  fi
done

# Same CLI-name resolution as scripts/deploy.sh: `soroban` became `stellar`.
if command -v soroban >/dev/null 2>&1; then
  CLI="soroban"
elif command -v stellar >/dev/null 2>&1; then
  CLI="stellar"
else
  echo "❌ No Stellar/Soroban CLI on PATH. See scripts/deploy.sh for install options."
  exit 1
fi

SEND_ARGS=()
if [ "$CLI" = "stellar" ]; then
  SEND_ARGS=(--send=yes)
fi

CLI_ARGS=(--rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE" --network "$NETWORK")
KEY_NAME="${SEED_KEY_NAME:-deployer}"

if ! "$CLI" keys address "$KEY_NAME" >/dev/null 2>&1; then
  echo "❌ Key '$KEY_NAME' is not in the CLI keyring."
  echo "   Run scripts/deploy.sh first, or set SEED_KEY_NAME to a registered key."
  exit 1
fi
CALLER="$("$CLI" keys address "$KEY_NAME")"
echo "ℹ️  Seeding as $CALLER on $NETWORK"
echo "ℹ️  Factory $FACTORY_ID"

# ── Helpers ──────────────────────────────────────────────────

# Read a value from a contract. Reads are simulated, which is free: they will
# never change state, so there is nothing to send.
read_contract() {
  local id="$1" fn="$2"
  shift 2
  "$CLI" contract invoke \
    --id "$id" \
    --source "$KEY_NAME" \
    "${CLI_ARGS[@]}" \
    -- "$fn" "$@" 2>/dev/null
}

# The CLI prints a banner line for a simulated read before the value, so extract
# the last line that is a bare integer rather than trusting the first line.
read_u64() {
  read_contract "$1" "$2" "${@:3}" | grep -E '^[0-9]+$' | tail -1
}

# Call a mutating function and echo the transaction hash it produced. The CLI
# does not return a call's value when it sends, so callers that need the created
# id read it back from the owning contract's counter instead.
send() {
  local id="$1" fn="$2"
  shift 2
  local out
  out="$("$CLI" contract invoke \
    --id "$id" \
    --source "$KEY_NAME" \
    "${CLI_ARGS[@]}" \
    "${SEND_ARGS[@]}" \
    -- "$fn" "$@" 2>&1)" || {
    echo "❌ $fn failed:" >&2
    echo "$out" >&2
    return 1
  }
  printf '%s\n' "$out" | grep -oE '(tx|transaction)[/ =:]+[0-9a-f]{64}' | grep -oE '[0-9a-f]{64}' | tail -1
}

# Read `metadata_uri` out of a collection's `get_collection` result. The CLI
# prints the struct as compact JSON.
collection_uri() {
  local id="$1"
  read_contract "$COLLECTION_ID" get_collection --id "$id" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=s.match(/\{.*\}/);try{process.stdout.write(m?JSON.parse(m[0]).metadata_uri:"")}catch{process.stdout.write("")}})'
}

# Read `royalties` (basis points) and the token URIs for a collection document.
# The demo metadata and the on-chain royalty terms come from one file, so the
# figure shown in the UI and the figure the contract enforces cannot drift.
plan_collection() {
  local slug="$1"
  local dir="$ROOT/demo/metadata"
  node -e '
    const fs = require("node:fs");
    const path = process.argv[1];
    const slug = process.argv[2];
    const base = "https://raw.githubusercontent.com/BezaMint/BezaMint/main";
    const doc = JSON.parse(fs.readFileSync(`${path}/collections/${slug}.json`, "utf8"));
    const tokens = fs
      .readdirSync(`${path}/tokens`)
      .filter((f) => f.startsWith(`${slug}-`) && f.endsWith(".json"))
      .sort()
      .map((f) => `${base}/demo/metadata/tokens/${f}`);
    process.stdout.write(
      [doc.royalties, `${base}/demo/metadata/collections/${slug}.json`, ...tokens].join("\n") + "\n",
    );
  ' "$dir" "$slug"
}

echo ""
echo "=== Plan ==="
mapfile -t PLAN < <(printf '%s\n' "$ROOT"/demo/metadata/collections/*.json | sed 's#.*/##; s#\.json$##')
for slug in "${PLAN[@]}"; do
  mapfile -t info < <(plan_collection "$slug")
  echo "   $slug: $(( ${#info[@]} - 2 )) tokens, ${info[0]} bps royalty"
done

# ── Seed ─────────────────────────────────────────────────────

echo ""
echo "=== Existing state ==="
EXISTING=$(read_u64 "$COLLECTION_ID" total_collections)
EXISTING="${EXISTING:-0}"
SUPPLY_BEFORE=$(read_u64 "$NFT_ID" total_supply)
SUPPLY_BEFORE="${SUPPLY_BEFORE:-0}"
echo "   collections: $EXISTING"
echo "   tokens:      $SUPPLY_BEFORE"

# Collect the metadata URIs already on chain once, rather than per collection, so
# a re-run skips work it has already done instead of duplicating it.
declare -A SEEN_URIS=()
for ((id = 1; id <= EXISTING; id++)); do
  uri="$(collection_uri "$id")"
  [ -n "$uri" ] && SEEN_URIS["$uri"]=1
done

RECORDS=()

for slug in "${PLAN[@]}"; do
  mapfile -t info < <(plan_collection "$slug")
  bps="${info[0]}"
  collection_uri_value="${info[1]}"
  token_uris=("${info[@]:2}")

  echo ""
  echo "━━━ $slug ━━━"

  if [ -n "${SEEN_URIS[$collection_uri_value]:-}" ]; then
    echo "   ⏭  already seeded (metadata URI is on chain); skipping"
    continue
  fi

  echo "   creating collection…"
  create_hash="$(send "$FACTORY_ID" create_collection_for_creator --caller "$CALLER" --metadata_uri "$collection_uri_value")"
  collection_id="$(read_u64 "$COLLECTION_ID" total_collections)"
  echo "   collection id $collection_id  ${EXPLORER}/contract/${COLLECTION_ID}"
  [ -n "$create_hash" ] && echo "   tx ${EXPLORER}/tx/${create_hash}"

  minted_start=$(( $(read_u64 "$NFT_ID" total_supply) + 1 ))

  # Chunk to the contract's batch limit: an oversized batch is rejected whole, so
  # a drop larger than 25 must be split rather than attempted and failed.
  chunk_start=0
  while [ "$chunk_start" -lt "${#token_uris[@]}" ]; do
    chunk=("${token_uris[@]:chunk_start:MAX_BATCH_MINT}")
    chunk_start=$((chunk_start + MAX_BATCH_MINT))

    # `Vec<String>` crosses the CLI boundary as a JSON array passed as one argument.
    uris_json="$(printf '%s\n' "${chunk[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(s.trim().split("\n"))))')"
    args=(--caller "$CALLER" --to "$CALLER" --collection_id "$collection_id" --basis_points "$bps" --metadata_uris "$uris_json")

    echo "   minting ${#chunk[@]} token(s) in one transaction…"
    mint_hash="$(send "$FACTORY_ID" mint_batch_with_royalty "${args[@]}")"
    [ -n "$mint_hash" ] && echo "   tx ${EXPLORER}/tx/${mint_hash}"
  done

  minted_end="$(read_u64 "$NFT_ID" total_supply)"
  token_ids="$(node -e 'const [a,b]=process.argv.slice(1);const out=[];for(let i=+a;i<=+b;i++)out.push(i);process.stdout.write(JSON.stringify(out))' "$minted_start" "$minted_end")"
  echo "   token ids $minted_start..$minted_end"

  RECORDS+=("$(node -e '
    process.stdout.write(JSON.stringify({
      slug: process.argv[1],
      collectionId: Number(process.argv[2]),
      royaltyBasisPoints: Number(process.argv[3]),
      metadataUri: process.argv[4],
      createTx: process.argv[5] || null,
      mintTx: process.argv[6] || null,
      tokenIds: JSON.parse(process.argv[7]),
    }));
  ' "$slug" "$collection_id" "$bps" "$collection_uri_value" "$create_hash" "$mint_hash" "$token_ids")")
done

# ── Manifest ─────────────────────────────────────────────────

SUPPLY_AFTER="$(read_u64 "$NFT_ID" total_supply)"

node -e '
  const fs = require("node:fs");
  const [outPath, network, factory, collection, nft, explorer, before, after, ...records] =
    process.argv.slice(1);
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : null;
  const previous = existing && Array.isArray(existing.seeded) ? existing.seeded : [];
  const merged = [...previous];
  for (const raw of records) {
    const record = JSON.parse(raw);
    const at = merged.findIndex((entry) => entry.slug === record.slug);
    if (at >= 0) merged[at] = record;
    else merged.push(record);
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    network,
    explorer,
    contracts: { factory, collection, nft },
    tokensBefore: Number(before),
    tokensAfter: Number(after),
    seeded: merged,
  };
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
' "$MANIFEST" "$NETWORK" "$FACTORY_ID" "$COLLECTION_ID" "$NFT_ID" "$EXPLORER" "$SUPPLY_BEFORE" "$SUPPLY_AFTER" "${RECORDS[@]}"

echo ""
echo "=== Done ==="
echo "   tokens: $SUPPLY_BEFORE → $SUPPLY_AFTER"
echo "   manifest: ${MANIFEST#"$ROOT"/}"
echo "   collection: ${EXPLORER}/contract/${COLLECTION_ID}"
echo ""
echo "   The indexer picks these up on the next poll; give it a moment before"
echo "   checking /api/stats or the activity feed."
