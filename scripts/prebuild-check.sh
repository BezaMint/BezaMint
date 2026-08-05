#!/bin/bash
set -e
echo "Prebuild environment check..."
REQUIRED_VARS=(NEXT_PUBLIC_STELLAR_RPC_URL NEXT_PUBLIC_STELLAR_NETWORK)
for v in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!v:-}" ]; then
    echo "Warning: $v is not set (using default)"
  fi
done
echo "Prebuild check passed."
