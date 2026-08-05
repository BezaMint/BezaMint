#!/bin/bash
set -e
echo "Checking pnpm-lock.yaml consistency..."
pnpm install --frozen-lockfile --offline 2>&1 || { echo "Lockfile is out of date. Run: pnpm install"; exit 1; }
echo "Lockfile is consistent."
