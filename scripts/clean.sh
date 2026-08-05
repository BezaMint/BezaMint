#!/bin/bash
set -e
echo "Cleaning BezaMint..."
rm -rf apps/web/.next apps/web/dist
rm -rf contracts/target
rm -rf node_modules apps/web/node_modules packages/shared/node_modules
echo "Clean complete."
