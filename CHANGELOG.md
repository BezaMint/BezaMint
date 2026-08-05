# Changelog

All notable changes to BezaMint are documented in this file.

## [0.1.0] - 2026-08-05

### Added

- Five Soroban smart contracts: NFT, Collection, Royalty, Creator, Factory
- Next.js 15 frontend with Freighter wallet integration
- IPFS metadata pinning via Pinata
- Real-time contract event streaming via `useContractEvents`
- Comprehensive error handling with 9 categorized error types
- 145 passing tests (55 contract + 90 frontend)
- CI/CD pipeline with GitHub Actions (CI, Release, Security)
- Deployed contracts on Stellar Testnet with on-chain verification

### Fixed

- NFT `mint` compile error (counter used before declaration)
- NFT `transfer` borrow-of-moved-value compile error
- Creator `update_profile` undefined variable reference
- Admin-gated minting now recipient-gated so users can mint with their wallets
- Collection update/archive now verify caller owns the collection
- Duplicate test definitions across all 5 contract crates
- Literal `\n` corruption in IPFS upload route and UI barrel file
- Duplicate `MintStatus` type export in shared package
- Broken `('use client')` directive in CollectionGrid
- ESLint config migrated to flat config (ESLint 9 + eslint-config-next 15)

### Added (docs)

- GitHub issue templates (bug report + feature request)
- Pull request template
- `cliff.toml` for git-cliff changelog generation
- Sitemap route, robots.txt, OpenGraph/Twitter metadata
- Global `loading.tsx`, `error.tsx`, and `not-found.tsx` pages
