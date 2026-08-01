#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BezaMint — Stellar Testnet Contract Deployment Script
# ─────────────────────────────────────────────────────────────
# Prerequisites:
#   1. Rust + wasm32-unknown-unknown target installed
#   2. Soroban CLI >= 22.0.0 installed
#   3. A Stellar testnet account with XLM (fund via Friendbot)
#   4. The account secret key stored in BEZAMINT_DEPLOYER_SECRET env var
#
# Usage:
#   export BEZAMINT_DEPLOYER_SECRET="S..."
#   bash scripts/deploy.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

NETWORK="testnet"
RPC_URL="https://soroban-testnet.stellar.org"
PASSPHRASE="Test SDF Network ; September 2015"

# Validate prerequisites
if [ -z "${BEZAMINT_DEPLOYER_SECRET:-}" ]; then
  echo "❌ BEZAMINT_DEPLOYER_SECRET environment variable is required"
  echo "   export BEZAMINT_DEPLOYER_SECRET=\"S...\""
  exit 1
fi

echo "🔨 Building all Soroban contracts..."
cd "$(dirname "$0")/../contracts"
cargo build --workspace --release --target wasm32-unknown-unknown

echo ""
echo "📦 Optimizing wasm binaries..."
for wasm in target/wasm32-unknown-unknown/release/*.wasm; do
  soroban contract optimize --wasm "$wasm"
done

echo ""
echo "🚀 Deploying to Stellar Testnet ($RPC_URL)..."

declare -A CONTRACT_IDS

# Deploy each contract
for contract in nft collection royalty creator factory; do
  echo ""
  echo "━━━ Deploying bezamint_${contract} ━━━"
  WASM="target/wasm32-unknown-unknown/release/bezamint_${contract}.wasm"

  if [ ! -f "$WASM" ]; then
    echo "❌ Wasm not found: $WASM"
    exit 1
  fi

  CONTRACT_ID=$(soroban contract deploy \
    --wasm "$WASM" \
    --source "$BEZAMINT_DEPLOYER_SECRET" \
    --network "$NETWORK" \
    --rpc-url "$RPC_URL" \
    2>&1 | tail -1)

  CONTRACT_IDS[$contract]="$CONTRACT_ID"
  echo "✅ bezamint_${contract}: $CONTRACT_ID"
done

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
echo "✅ Deployment complete! Run 'pnpm dev' to start the application."
