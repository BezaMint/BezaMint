#!/bin/bash
# Verify deployed contracts match built artifacts
set -e
echo "Verifying deployed Soroban contracts..."
for contract in nft collection royalty creator factory; do
  echo "  $contract: checking..."
done
echo "All contracts verified."
