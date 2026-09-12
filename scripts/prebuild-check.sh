#!/usr/bin/env bash
#
# Pre-build configuration check for the web app.
#
# Runs before `next build` (see apps/web/package.json). It cannot fail the
# build for missing configuration, because CI and local development legitimately
# build without contract IDs — the app degrades gracefully and reports the gap at
# runtime through the startup validator. What it does fail on is a value that is
# present but wrong, because a typo in a contract ID or an RPC URL produces a
# bundle that looks configured and then fails in production.
#
#   missing value  -> warning (deployment is unconfigured, not broken)
#   malformed value -> error, exit 1
#
# Usage: scripts/prebuild-check.sh

set -uo pipefail

purple='\033[0;35m'
red='\033[0;31m'
yellow='\033[0;33m'
reset='\033[0m'

echo -e "${purple}Pre-build configuration check${reset}"

errors=0
warnings=0

CONTRACT_KEYS=(
  NEXT_PUBLIC_NFT_CONTRACT_ID
  NEXT_PUBLIC_COLLECTION_CONTRACT_ID
  NEXT_PUBLIC_ROYALTY_CONTRACT_ID
  NEXT_PUBLIC_CREATOR_CONTRACT_ID
  NEXT_PUBLIC_FACTORY_CONTRACT_ID
)

# A Soroban contract ID is 56 characters of base32 starting with 'C'.
CONTRACT_ID_RE='^C[A-Z2-7]{55}$'

for key in "${CONTRACT_KEYS[@]}"; do
  value="${!key:-}"
  if [ -z "$value" ]; then
    echo -e "${yellow}warn${reset}  $key is not set — contract features will be unavailable"
    warnings=$((warnings + 1))
  elif [[ ! $value =~ $CONTRACT_ID_RE ]]; then
    echo -e "${red}error${reset} $key=\"$value\" is not a valid Soroban contract ID (56-char base32 starting with C)"
    errors=$((errors + 1))
  fi
done

rpc="${NEXT_PUBLIC_STELLAR_RPC_URL:-}"
if [ -z "$rpc" ]; then
  echo -e "${yellow}warn${reset}  NEXT_PUBLIC_STELLAR_RPC_URL is not set — the app will use the network default"
  warnings=$((warnings + 1))
elif [[ ! $rpc =~ ^https?:// ]]; then
  echo -e "${red}error${reset} NEXT_PUBLIC_STELLAR_RPC_URL=\"$rpc\" must be an http(s) URL"
  errors=$((errors + 1))
fi

network="${NEXT_PUBLIC_STELLAR_NETWORK:-}"
if [ -n "$network" ] && [ "$network" != "testnet" ] && [ "$network" != "mainnet" ]; then
  echo -e "${red}error${reset} NEXT_PUBLIC_STELLAR_NETWORK=\"$network\" must be \"testnet\" or \"mainnet\""
  errors=$((errors + 1))
fi

# With a write key unset, a non-browser caller to a mutating route is not asked to
# authenticate. The middleware still refuses a mutating request that carries an
# untrusted Origin, so this is a weakening rather than an open door -- and it is
# still worth saying out loud in a production build log.
if [ -n "${CI:-}" ] && [ "${NODE_ENV:-}" = "production" ] && [ -z "${API_WRITE_KEY:-}" ]; then
  echo -e "${yellow}warn${reset}  API_WRITE_KEY is not set — non-browser callers to mutating API routes will not be asked for a key (browser callers are still checked by origin)"
  warnings=$((warnings + 1))
fi

if [ "$errors" -gt 0 ]; then
  echo -e "\n${red}Pre-build check failed with $errors error(s).${reset}"
  exit 1
fi

echo -e "${purple}Pre-build check passed${reset} (${warnings} warning(s))"
