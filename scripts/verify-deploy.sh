#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# BezaMint — Verify Deployed Contracts
# ─────────────────────────────────────────────────────────────
# Checks that the contract IDs in apps/web/.env.local respond to
# read-only Soroban RPC queries, proving they are live on Testnet and
# that initialization actually ran (total_supply etc. would not respond
# otherwise).
#
# Usage:
#   BEZAMINT_SOURCE_KEY="deployer" bash scripts/verify-deploy.sh
#
# BEZAMINT_SOURCE_KEY may be a keyring name or a raw secret key; it is
# only used as the fee-paying source of the read-only invokes.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

NETWORK="testnet"
RPC_URL="${NEXT_PUBLIC_STELLAR_RPC_URL:-https://soroban-testnet.stellar.org}"
PASSPHRASE="Test SDF Network ; September 2015"
ENV_FILE="apps/web/.env.local"
SOURCE_KEY="${BEZAMINT_SOURCE_KEY:-deployer}"

CLI_ARGS=(--rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE" --network "$NETWORK")

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE not found. Run scripts/deploy.sh first." >&2
  exit 1
fi

echo "🔍 Verifying deployed Soroban contracts against $RPC_URL"
echo "────────────────────────────────────────────────────────────"

# Contract IDs expected to exist in the env file
CONTRACTS=(nft collection royalty creator factory)
FAILURES=0

for contract in "${CONTRACTS[@]}"; do
  ID_VAR="NEXT_PUBLIC_$(echo "$contract" | tr '[:lower:]' '[:upper:]')_CONTRACT_ID"
  CONTRACT_ID=$(grep -E "^${ID_VAR}=" "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]')

  if [ -z "$CONTRACT_ID" ]; then
    echo "⚠️  $contract: $ID_VAR not set — skipping"
    continue
  fi

  # Query a read-only method that only answers once initialized
  case "$contract" in
    nft)        METHOD="total_supply";;
    collection) METHOD="total_collections";;
    royalty)    METHOD="is_initialized";;
    creator)    METHOD="total_creators";;
    factory)    METHOD="get_nft_contract";;
  esac

  if soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source "$SOURCE_KEY" \
    "${CLI_ARGS[@]}" \
    -- "$METHOD" >/dev/null 2>&1; then
    echo "✅ $contract: $CONTRACT_ID responds to $METHOD()"
  else
    echo "❌ $contract: $CONTRACT_ID did not respond to $METHOD()"
    FAILURES=$((FAILURES + 1))
  fi
done

echo "────────────────────────────────────────────────────────────"

# Cross-contract wiring: the Factory's whole point is that its sub-calls
# authenticate as the Royalty admin, so verify the hand-off actually happened.
FACTORY_ID=$(grep -E "^NEXT_PUBLIC_FACTORY_CONTRACT_ID=" "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]')
ROYALTY_ID=$(grep -E "^NEXT_PUBLIC_ROYALTY_CONTRACT_ID=" "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]')
if [ -n "$FACTORY_ID" ] && [ -n "$ROYALTY_ID" ]; then
  ROYALTY_ADMIN=$(soroban contract invoke \
    --id "$ROYALTY_ID" \
    --source "$SOURCE_KEY" \
    "${CLI_ARGS[@]}" \
    -- get_admin 2>/dev/null | tr -d '"' | tr -d '[:space:]')
  if [ "$ROYALTY_ADMIN" = "$FACTORY_ID" ]; then
    echo "✅ wiring: Royalty admin is the Factory"
  else
    echo "❌ wiring: Royalty admin is '$ROYALTY_ADMIN', expected the Factory '$FACTORY_ID'"
    echo "   Run scripts/deploy.sh (or factory.set_contracts) to complete the hand-off."
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "⚠️  wiring: contract ids missing from $ENV_FILE — skipping check"
fi

echo "────────────────────────────────────────────────────────────"
if [ "$FAILURES" -eq 0 ]; then
  echo "✅ All configured contracts verified on Stellar Testnet."
else
  echo "❌ $FAILURES contract(s) failed verification."
  exit 1
fi