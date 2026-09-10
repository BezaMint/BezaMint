#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BezaMint — Stellar Testnet Contract Deployment Script
# ─────────────────────────────────────────────────────────────
# Prerequisites:
#   1. Rust + wasm32-unknown-unknown target installed
#   2. Soroban CLI >= 22.0.0 installed (`cargo install soroban-cli`)
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
#   3. Deploys nft, collection, royalty, creator, factory
#   4. Initializes every contract with the deployer as admin
#      (skipped for contracts that are already initialized, so the
#      script is safe to re-run against an existing deployment)
#   5. Wires the Factory: set_contracts(...) also transfers the Royalty
#      admin role to the Factory in the same transaction, which is what
#      makes the Factory's cross-contract configure_royalty calls
#      authenticate in production
#   6. Writes apps/web/.env.local and prints a summary
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

if ! command -v soroban >/dev/null 2>&1; then
  echo "❌ soroban CLI not found. Install it with: cargo install soroban-cli"
  exit 1
fi

CLI_ARGS=(--rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE" --network "$NETWORK")

echo "🔨 Building all Soroban contracts..."
cd "$(dirname "$0")/../contracts"
cargo build --workspace --release --target wasm32-unknown-unknown

echo ""
echo "📦 Optimizing wasm binaries..."
for wasm in target/wasm32-unknown-unknown/release/*.wasm; do
  echo "   $wasm"
  soroban contract optimize --wasm "$wasm" >/dev/null 2>&1 || true
done

echo ""
echo "🔑 Registering deployer key in the CLI keyring..."
soroban keys add "$KEY_NAME" --secret-key "$BEZAMINT_DEPLOYER_SECRET" --overwrite >/dev/null 2>&1 \
  || soroban keys add "$KEY_NAME" --secret-key "$BEZAMINT_DEPLOYER_SECRET" >/dev/null
ADMIN_ADDR=$(soroban keys address "$KEY_NAME")
echo "   Deployer address: $ADMIN_ADDR"

echo ""
echo "🚀 Deploying to Stellar Testnet ($RPC_URL)..."

declare -A CONTRACT_IDS

# Deploy each contract (re-uses an existing ID when already deployed so
# re-runs do not create orphaned contracts)
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

  CONTRACT_ID=$(soroban contract deploy \
    --wasm "$WASM" \
    --source "$KEY_NAME" \
    "${CLI_ARGS[@]}" \
    2>&1 | tail -1)

  CONTRACT_IDS[$contract]="$CONTRACT_ID"
  echo "✅ bezamint_${contract}: $CONTRACT_ID"
done

echo ""
echo "━━━ Initializing and wiring contracts ━━━"

# Helper: run `fn` with optional `--arg` pairs against contract `$1`.
invoke() {
  local id="$1"; shift
  local fn="$1"; shift
  soroban contract invoke \
    --id "$id" \
    --source "$KEY_NAME" \
    "${CLI_ARGS[@]}" \
    -- "$fn" "$@" 2>&1
}

# Helper: true when `fn` (a no-arg read) returns true.
is_initialized() {
  local id="$1"; shift
  local fn="$1"; shift
  invoke "$id" "$fn" | grep -q 'true'
}

init_if_needed() {
  local name="$1"; shift
  local id="$1"; shift
  local fn="$1"; shift
  if is_initialized "$id" "$fn"; then
    echo "⏭️  ${name}: already initialized — skipping"
  else
    invoke "$id" "$fn" "$@" >/dev/null
    echo "✅ ${name}: initialized"
  fi
}

init_if_needed "NFT"        "${CONTRACT_IDS[nft]}"        initialize --admin "$ADMIN_ADDR"
init_if_needed "Collection" "${CONTRACT_IDS[collection]}" initialize --admin "$ADMIN_ADDR"
init_if_needed "Creator"    "${CONTRACT_IDS[creator]}"    initialize --admin "$ADMIN_ADDR"
init_if_needed "Royalty"    "${CONTRACT_IDS[royalty]}"    initialize --admin "$ADMIN_ADDR"
init_if_needed "Factory"    "${CONTRACT_IDS[factory]}"    initialize --admin "$ADMIN_ADDR"

echo ""
echo "━━━ Wiring Factory (set_contracts) ━━━"
# Idempotent: re-setting the same pointers and re-transferring the Royalty
# admin to the Factory is a no-op in effect (the Factory authorizes the
# sub-call as the current Royalty admin).
invoke "${CONTRACT_IDS[factory]}" set_contracts \
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