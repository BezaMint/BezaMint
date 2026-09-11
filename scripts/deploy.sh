#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BezaMint — Stellar Testnet Contract Deployment Script
# ─────────────────────────────────────────────────────────────
# Prerequisites:
#   1. Rust + wasm32-unknown-unknown target installed
#   2. The Stellar CLI installed (`stellar`) or its predecessor Soroban CLI
#      (`soroban`). They are the same tool under two names; this script uses
#      whichever is on PATH.
#   3. A Stellar testnet account with XLM (fund via Friendbot)
#   4. The account secret key stored in BEZAMINT_DEPLOYER_SECRET env var
#
# Usage:
#   export BEZAMINT_DEPLOYER_SECRET="S..."
#   bash scripts/deploy.sh
#
# What it does, in order:
#   1. Builds and optimizes all five contracts to wasm
#   2. Registers the deployer key in the CLI keyring
#   3. Deploys nft, collection, royalty, creator, factory, passing the deployer
#      as each contract's constructor argument. Initialization happens inside
#      the deployment transaction, so there is no window in which an observer
#      could initialize a contract as themselves (which is exactly what the
#      previous deploy-then-initialize sequence allowed).
#   4. Verifies that the constructors actually ran
#   5. Wires the Factory: set_contracts(...) also transfers the Royalty
#      admin role to the Factory in the same transaction, which is what
#      makes the Factory's cross-contract configure_royalty calls
#      authenticate in production
#   6. Writes apps/web/.env.local and prints a summary
#
# Each run deploys fresh contract instances and rewrites apps/web/.env.local.
# It does not detect or reuse a previous deployment.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

NETWORK="testnet"
RPC_URL="https://soroban-testnet.stellar.org"
PASSPHRASE="Test SDF Network ; September 2015"
KEY_NAME="deployer"

# Validate prerequisites
if [ -z "${BEZAMINT_DEPLOYER_SECRET:-}" ]; then
  echo "❌ BEZAMINT_DEPLOYER_SECRET environment variable is required"
  echo "   export BEZAMINT_DEPLOYER_SECRET=\"S...\""
  exit 1
fi

# The CLI was renamed: `soroban` up to v21, `stellar` from v22 onwards, same
# tool. Resolve it once so the rest of the script is name-agnostic, and fail with
# install guidance rather than a bare "command not found".
if command -v soroban >/dev/null 2>&1; then
  CLI="soroban"
elif command -v stellar >/dev/null 2>&1; then
  CLI="stellar"
else
  echo "❌ No Stellar/Soroban CLI found on PATH."
  echo "   Install one of:"
  echo "     cargo install stellar-cli --locked      # current name"
  echo "     cargo install soroban-cli --locked      # historical name"
  echo "   or download a release binary:"
  echo "     https://github.com/stellar/stellar-cli/releases"
  exit 1
fi
echo "ℹ️  Using the '$CLI' CLI ($($CLI --version 2>/dev/null | head -1))"

# From v22 onwards `contract invoke` only simulates unless `--send=yes` is
# passed, so a mutating call would report success while changing nothing. Reads
# are left unsent deliberately: simulating them is free and sufficient.
SEND_ARGS=()
if [ "$CLI" = "stellar" ]; then
  SEND_ARGS=(--send=yes)
fi

CLI_ARGS=(--rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE" --network "$NETWORK")

echo "🔨 Building all Soroban contracts..."
cd "$(dirname "$0")/../contracts"
cargo build --workspace --release --target wasm32-unknown-unknown

echo ""
echo "📦 Optimizing wasm binaries..."
for wasm in target/wasm32-unknown-unknown/release/*.wasm; do
  # `contract optimize` writes "<name>.optimized.wasm" beside its input, and this
  # glob matches whatever is already in the directory -- so without this guard a
  # second run optimizes the previous run's output, producing
  # "<name>.optimized.optimized.wasm" and another level per run. Nothing consumes
  # those files (the deploy step below looks for exactly one `.optimized`
  # suffix), but they accumulate, and `check-wasm-size.sh` refuses to pass when it
  # finds a wasm artifact it has no budget for -- so the second run of this script
  # left the size gate failing on a tree that was fine.
  case "$wasm" in
    *.optimized*) continue ;;
  esac
  echo "   $wasm"
  # `contract optimize` is deprecated in newer releases (the build already
  # optimizes) and its absence is not fatal: the loop below falls back to the
  # unoptimized artifact when no `.optimized.wasm` was produced.
  "$CLI" contract optimize --wasm "$wasm" >/dev/null 2>&1 || true
done

echo ""
echo "🔑 Registering deployer key in the CLI keyring..."
# Register the key. The two CLIs spell this differently and the difference is
# not cosmetic: in `stellar` (v22+) `--secret-key` is a boolean that reads the
# secret from stdin, while in `soroban` it takes the secret as its value. Passing
# the value in the modern CLI is a hard error, and passing none in the old one
# opens an interactive prompt a CI run cannot answer.
if [ "$CLI" = "stellar" ]; then
  printf '%s\n' "$BEZAMINT_DEPLOYER_SECRET" |
    "$CLI" keys add "$KEY_NAME" --secret-key --overwrite >/dev/null 2>&1
else
  "$CLI" keys add "$KEY_NAME" --secret-key "$BEZAMINT_DEPLOYER_SECRET" --overwrite >/dev/null 2>&1 \
    || "$CLI" keys add "$KEY_NAME" --secret-key "$BEZAMINT_DEPLOYER_SECRET" >/dev/null 2>&1
fi
ADMIN_ADDR=$("$CLI" keys address "$KEY_NAME")
if [ -z "$ADMIN_ADDR" ]; then
  echo "❌ Could not register '$KEY_NAME' in the CLI keyring."
  exit 1
fi
echo "   Deployer address: $ADMIN_ADDR"

echo ""
echo "🚀 Deploying to Stellar Testnet ($RPC_URL)..."

declare -A CONTRACT_IDS

for contract in nft collection royalty creator factory; do
  echo ""
  echo "━━━ Deploying bezamint_${contract} ━━━"
  WASM="target/wasm32-unknown-unknown/release/bezamint_${contract}.wasm"
  OPT_WASM="${WASM%.wasm}.optimized.wasm"

  if [ ! -f "$WASM" ]; then
    echo "❌ Wasm not found: $WASM"
    exit 1
  fi
  # Use the optimized artifact when optimize produced one
  [ -f "$OPT_WASM" ] && WASM="$OPT_WASM"

  # Everything after `--` is passed to the contract's `__constructor`, so the
  # admin binding is created atomically with the contract instance itself.
  # Capture the id by shape rather than by "last line": the CLI prints progress
  # and warning lines on stderr and sometimes a banner on stdout, so taking the
  # final line can capture a log line and store a garbage contract address.
  CONTRACT_ID=$("$CLI" contract deploy \
    --wasm "$WASM" \
    --source "$KEY_NAME" \
    "${CLI_ARGS[@]}" \
    -- \
    --admin "$ADMIN_ADDR" \
    2>/dev/null | grep -oE 'C[A-Z0-9]{55}' | tail -1)

  if [ -z "$CONTRACT_ID" ]; then
    echo "❌ bezamint_${contract}: could not read a contract id from the deploy output"
    exit 1
  fi

  CONTRACT_IDS[$contract]="$CONTRACT_ID"
  echo "✅ bezamint_${contract}: $CONTRACT_ID"
done

echo ""
echo "━━━ Verifying constructor initialization ━━━"

# Helper: run a read-only `fn` with optional `--arg` pairs against contract `$1`.
invoke_read() {
  local id="$1"; shift
  local fn="$1"; shift
  "$CLI" contract invoke \
    --id "$id" \
    --source "$KEY_NAME" \
    "${CLI_ARGS[@]}" \
    -- "$fn" "$@" 2>&1
}

# Helper: run a state-changing `fn`. Must be sent explicitly on v22+.
invoke_send() {
  local id="$1"; shift
  local fn="$1"; shift
  "$CLI" contract invoke \
    --id "$id" \
    --source "$KEY_NAME" \
    "${CLI_ARGS[@]}" \
    "${SEND_ARGS[@]}" \
    -- "$fn" "$@" 2>&1
}

# Helper: true when `fn` (a no-arg read) returns true.
is_initialized() {
  local id="$1"; shift
  local fn="$1"; shift
  invoke_read "$id" "$fn" | grep -q 'true'
}

# Helper: the address `get_admin` reports. Extracted by shape rather than by
# stripping whitespace: newer CLIs print an informational banner
# ("Simulation identified as read-only…") on the same stream as the value, and
# whitespace-stripping concatenated the banner into the address.
get_admin_address() {
  local id="$1"
  invoke_read "$id" get_admin | grep -oE '[GC][A-Z0-9]{55}' | head -1
}

# There is no separate initialization step any more: the constructor ran inside
# the deployment transaction above. Assert that it did, and that it recorded the
# deployer as admin, rather than assuming it.
verify_initialized() {
  local name="$1"
  local id="$2"
  if ! is_initialized "$id" is_initialized; then
    echo "❌ ${name}: constructor did not initialize the contract"
    exit 1
  fi
  local recorded
  recorded=$(get_admin_address "$id")
  if [ "$recorded" != "$ADMIN_ADDR" ]; then
    echo "❌ ${name}: admin is '$recorded', expected the deployer '$ADMIN_ADDR'"
    exit 1
  fi
  echo "✅ ${name}: initialized by constructor, admin is the deployer"
}

verify_initialized "NFT"        "${CONTRACT_IDS[nft]}"
verify_initialized "Collection" "${CONTRACT_IDS[collection]}"
verify_initialized "Creator"    "${CONTRACT_IDS[creator]}"
verify_initialized "Factory"    "${CONTRACT_IDS[factory]}"
# Royalty is verified here too, before `set_contracts` deliberately hands its
# admin role to the Factory. verify-deploy.sh re-checks that hand-off afterwards.
verify_initialized "Royalty"    "${CONTRACT_IDS[royalty]}"

echo ""
echo "━━━ Wiring Factory (set_contracts) ━━━"
# Idempotent: re-setting the same pointers and re-transferring the Royalty
# admin to the Factory is a no-op in effect (the Factory authorizes the
# sub-call as the current Royalty admin).
invoke_send "${CONTRACT_IDS[factory]}" set_contracts \
  --nft "${CONTRACT_IDS[nft]}" \
  --collection "${CONTRACT_IDS[collection]}" \
  --royalty "${CONTRACT_IDS[royalty]}" \
  --creator "${CONTRACT_IDS[creator]}" >/dev/null
echo "✅ Factory wired; Royalty admin is now the Factory"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Deployed Contract Addresses (Stellar Testnet)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "NFT:        ${CONTRACT_IDS[nft]}"
echo "Collection: ${CONTRACT_IDS[collection]}"
echo "Royalty:    ${CONTRACT_IDS[royalty]}"
echo "Creator:    ${CONTRACT_IDS[creator]}"
echo "Factory:    ${CONTRACT_IDS[factory]}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Generate .env file
cat > ../apps/web/.env.local <<EOF
# BezaMint — Stellar Testnet Configuration
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_RPC_URL=$RPC_URL
NEXT_PUBLIC_STELLAR_PASSPHRASE=$PASSPHRASE

# Deployed Contract IDs
NEXT_PUBLIC_NFT_CONTRACT_ID=${CONTRACT_IDS[nft]}
NEXT_PUBLIC_COLLECTION_CONTRACT_ID=${CONTRACT_IDS[collection]}
NEXT_PUBLIC_ROYALTY_CONTRACT_ID=${CONTRACT_IDS[royalty]}
NEXT_PUBLIC_CREATOR_CONTRACT_ID=${CONTRACT_IDS[creator]}
NEXT_PUBLIC_FACTORY_CONTRACT_ID=${CONTRACT_IDS[factory]}

# The deploying account. Public information, and useful for attribution and
# for the explorer links in the README.
NEXT_PUBLIC_DEPLOYER_ADDRESS=$ADMIN_ADDR

# Explorer
NEXT_PUBLIC_EXPLORER_URL=https://stellar.expert/explorer/testnet

# App
NEXT_PUBLIC_APP_NAME=BezaMint
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF

echo ""
echo "✅ Generated apps/web/.env.local with deployed contract IDs"
echo ""
echo "🔍 Verifying deployment..."
cd ..
bash scripts/verify-deploy.sh
echo "✅ Deployment complete! Run 'pnpm dev' to start the application."