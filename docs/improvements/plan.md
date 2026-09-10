# BezaMint — 250 High-Impact Improvement Plan

Tracked execution plan covering 50 improvements in each of five areas: **Frontend**, **Backend/API**, **Smart Contracts**, **Codebase/Tooling**, and **General/Docs**. Work is executed in batches of 20; each improvement is one commit; each batch is pushed to `main` after it is complete and green.

Legend: `[x]` done · `[ ]` pending

---

## A. Frontend (50)

- [x] F01 Wire creator profile page to real on-chain data (remove MOCK_CREATOR)
- [x] F02 Wire collection detail page to real `get_collection` + NFTs (remove MOCK_COLLECTION)
- [x] F03 Add NFT detail route (`/nft/[id]`) with token data, owner, metadata, royalty
- [x] F04 Wire search to real data with loading/empty states (replace MOCK_RESULTS)
- [x] F05 Centralize explorer URL building from config (fix hardcoded testnet links)
- [x] F06 RoyaltyConfig: precise basis-point entry synced with slider
- [x] F07 Wallet-disconnected guard on mint + friendly connect prompt
- [x] F08 TransactionStatus success deep-links (explorer + asset page)
- [x] F09 Mint wizard: create a collection inline before minting into it
- [x] F10 Client-side image compression/WebP before IPFS upload
- [x] F11 Retry with exponential backoff on IPFS upload
- [x] F12 AttributeEditor inline validation (non-empty, dedupe, max count)
- [x] F13 Explore "Verified Creators"/"Recently Minted" cards wired to real data
- [x] F14 MobileMenu accessible dialog (focus trap, Escape, aria-expanded)
- [x] F15 Nav active states with `aria-current="page"`
- [x] F16 Theme toggle with persisted preference + `prefers-color-scheme`
- [x] F17 Consistent focus-visible rings across inputs/buttons
- [x] F18 Per-route error boundaries with reset UI
- [x] F19 Toast action buttons (e.g. "Open explorer")
- [x] F20 Collection grid pagination
- [x] F21 Dashboard disconnected-state CTA
- [x] F22 Copy-to-clipboard on all address displays with feedback
- [x] F23 Image skeleton shimmer + broken-image fallback
- [x] F24 Add app icon + opengraph-image assets
- [x] F25 Pause `useContractEvents` polling when tab hidden
- [x] F26 Optimistic UI for collection create/archive with rollback
- [x] F27 Mint form fee/balance estimation warning
- [x] F28 i18n layer: extract strings + locale plumbing
- [x] F29 `aria-live` announcements for transaction status
- [x] F30 Design tokens doc + raw-hex lint guard
- [x] F31 SearchFilters wired to actually filter results
- [x] F32 WalletContext provider tests
- [x] F33 MintForm component tests (validation, royalties, disabled submit)
- [x] F34 useTransaction hook tests (abort, retry, success)
- [x] F35 SearchBar debounced input + keyboard support
- [x] F36 CollectionSelector empty/count states
- [x] F37 Profile page: load real creator data
- [x] F38 Dashboard stat cards: real data with loading skeletons
- [x] F39 Collections page: real data + pagination
- [x] F40 ActivityTimeline: on-chain/API-backed events, not mocks
- [x] F41 Sidebar: collapse state persisted
- [x] F42 Verify page: real verification flow + states
- [x] F43 Settings page: env/contract status check UI
- [x] F44 Shared format helpers consolidated (formatBps, formatXlm, truncate)
- [x] F45 Header wallet menu: balance refresh + error states
- [x] F46 EmptyState applied across all list/result views
- [x] F47 Loading skeletons on all dynamic pages
- [x] F48 Metadata resolver: robust IPFS/gateway fallback in UI
- [x] F49 CreatorCard/CollectionCard: clickable + verified badges consistent
- [x] F50 Accessible form labels + `aria-describedby` on all inputs

## B. Backend / API (50)

- [x] B01 Minimal on-chain event indexer (mints, transfers, collections, creators)
- [x] B02 `GET /api/nfts` endpoint backed by indexer/chain
- [x] B03 `GET /api/collections` endpoint with filters
- [x] B04 `GET /api/creators` endpoint with filters
- [x] B05 Upload route: file-size cap enforcement
- [x] B06 Upload route: MIME type allowlist
- [x] B07 Upload route: per-IP rate limiting
- [x] B08 Health route: Pinata + RPC reachability checks
- [x] B09 Structured logger with request IDs and durations
- [x] B10 Central error-normalization module for Soroban/Horizon errors
- [x] B11 Metadata caching with TTL (HTTP cache headers + memory)
- [x] B12 Rate-limiting middleware for all API routes
- [x] B13 Boot-time env/contract-ID validation with clear errors
- [x] B14 `GET /api/wallet/transactions` history endpoint
- [x] B15 Pinata key rotation guidance + startup presence check
- [x] B16 Upload route: request-body schema validation (400s, no 500s)
- [x] B17 CORS allowlist middleware
- [x] B18 ISR/revalidate strategy for public pages
- [x] B19 Server-side metadata JSON schema validation
- [x] B20 `GET /api/search` endpoint (NFTs/collections/creators)
- [x] B21 `GET /api/stats` platform stats endpoint
- [x] B22 `GET /api/wallet/balance` (XLM + balances)
- [x] B23 Consistent error envelope `{ error: { code, message } }`
- [x] B24 Request logging middleware (method, path, status, duration)
- [x] B25 Shared pagination helper for API list endpoints
- [x] B26 API route unit tests with mocked chain/IPFS
- [x] B27 Metadata proxy route with caching + validation
- [x] B28 Upload route: verify pinata CID integrity
- [x] B29 Indexer schema documentation
- [x] B30 Timeout + abort handling for all outbound fetches
- [ ] B31 Graceful degradation when PINATA_JWT missing
- [ ] B32 API docs (endpoints, request/response, errors)
- [ ] B33 Cache-busting/revalidation endpoint for metadata
- [ ] B34 Health endpoint: version + commit SHA
- [ ] B35 Security headers on API responses
- [ ] B36 Rate-limiter store with LRU eviction + tests
- [ ] B37 Upload route: deduplicate identical metadata (content hash)
- [ ] B38 Server-side validation of Stellar addresses in API params
- [ ] B39 `/api/ipfs/pin` explicit pin endpoint
- [ ] B40 Metadata resolver: IPFS gateway fallback chain (pinata → ipfs.io → local)
- [ ] B41 Indexer: backfill + cursor pagination
- [ ] B42 API key auth for write endpoints (optional, env-gated)
- [ ] B43 Logger: redact secrets from logs
- [ ] B44 Upload route: concurrent upload guard (per-user in-flight limit)
- [ ] B45 `/api/verify` creator-verification admin endpoint
- [ ] B46 Response compression (gzip/brotli) middleware
- [ ] B47 Error telemetry hook (basic event log) in API layer
- [ ] B48 Startup config dump (sanitized) for debugging
- [ ] B49 API contract tests via route handlers (no server needed)
- [ ] B50 Rate limit headers exposed (X-RateLimit-*)

## C. Smart Contracts (50)

- [ ] C01 [nft] Add `transfer_from` so approvals are usable
- [ ] C02 [collection] Remove unused `_admin` params from `add_nft`/`remove_nft`
- [ ] C03 [factory] `mint_with_royalty` also adds NFT to the collection
- [ ] C04 [collection] Reject duplicate token IDs in `add_nft`
- [ ] C05 [collection] Single shared MAX constant; efficient `remove_nft`
- [ ] C06 [collection] Pagination for `get_collections_by_creator`
- [ ] C07 [nft] Add `tokens_of_owner` enumeration with pagination
- [ ] C08 [royalty] `pay_royalty` payout mechanism on transfer
- [ ] C09 [royalty] Creator-gated `update_royalty` (admin for freeze)
- [ ] C10 [royalty] Validate recipient shares sum to 100
- [ ] C11 [royalty] Per-collection royalty inheritance fallback
- [ ] C12 [factory] `set_contracts`: reject zero addresses; safe re-point
- [ ] C13 [factory] Emit royalty-configured event in `mint_with_royalty`
- [ ] C14 [creator] URL scheme whitelist (http/https/ipfs/data)
- [ ] C15 [creator] Social-link platform whitelist
- [ ] C16 [nft] Optional `metadata_hash` commitment verified on mint
- [ ] C17 [nft] Transfer clears all approvals + emits standardized event
- [ ] C18 [nft] `burn` cleans up approvals
- [ ] C19 [nft] Reject zero address in `transfer`/`approve`
- [ ] C20 [contracts] Consistent panic-message format across crates
- [ ] C21 [contracts] Admin-owned upgradeability (Upgradable pattern)
- [ ] C22 [contracts] Storage versioning helper + read checks
- [ ] C23 [collection] `update_collection` re-validates URI (empty/≤512)
- [ ] C24 [nft] Per-collection configurable max supply
- [ ] C25 [factory] `mint_batch_with_royalty` batch mint
- [ ] C26 [collection] Archive guard enforced on factory mint path
- [ ] C27 [nft] `token_uri`/`token_metadata` view helpers
- [ ] C28 [royalty] Single source of truth for basis-point constant
- [ ] C29 [contracts] Boundary tests (511/512/513-char URIs; supply caps)
- [ ] C30 [contracts] ABI/interface JSON export wired into CI
- [ ] C31 [nft] Maintain per-owner token count (O(1) `balance_of`)
- [ ] C32 [nft] Safe query helpers (token exists, zero-address guards)
- [ ] C33 [collection] `get_collections_by_creator` excludes archived (test)
- [ ] C34 [creator] `update_profile` validates display name + bio lengths
- [ ] C35 [creator] `set_social_links` validates link URLs
- [ ] C36 [collection] `remove_nft` syncs `NftCollection` mapping (already) + tests
- [ ] C37 [factory] `create_collection_for_creator` accepts display name
- [ ] C38 [royalty] `get_royalty` with explicit fallback semantics
- [ ] C39 [nft] `transfer_from` + `set_approval_for_all` integration tests
- [ ] C40 [collection] Event assertions across all mutations
- [ ] C41 [contracts] `is_initialized` guards on all mutating functions
- [ ] C42 [nft] Metadata URI scheme validation at mint
- [ ] C43 [royalty] Zero-recipient config = 100% to creator, documented
- [ ] C44 [factory] Getters with descriptive panic messages
- [ ] C45 [contracts] Clippy-clean workspace + `#![deny(warnings)]` in CI
- [ ] C46 [contracts] Rustdoc on all public functions
- [ ] C47 [nft] `transfer` royalty-hook callback (factory-registered)
- [ ] C48 [contracts] Fuzz/property-style tests for counters and arithmetic
- [ ] C49 [royalty] `configure_royalty` rejects frozen re-configure for collection
- [ ] C50 [contracts] Contract README with interface table + deploy steps

## D. Codebase / Tooling (50)

- [ ] K01 CI: wire `check-lockfile.sh` + `prebuild-check.sh` into workflow
- [ ] K02 CI: Node version matrix (20/22)
- [ ] K03 CI: coverage thresholds enforced
- [ ] K04 CI: bundle-size budget check
- [ ] K05 CI: shared-package typecheck job (explicit)
- [ ] K06 CI: dependabot auto-merge policy for patch bumps
- [ ] K07 CI: stale.yml — exempt good-first-issue from closing
- [ ] K08 CI: multi-stage Dockerfile for web app
- [ ] K09 scripts: `deploy.sh` gains `--dry-run` + rollback docs
- [ ] K10 CI: contract ABI export job (fails on drift)
- [ ] K11 CI: E2E Playwright smoke test job
- [ ] K12 CI: release triggered by conventional-commit tags with changelog
- [ ] K13 next.config.js: security headers + image config
- [ ] K14 root package.json: consolidate scripts + docs
- [ ] K15 scripts: `set -euo pipefail` hardening across shell scripts
- [ ] K16 turbo.json: correct cache outputs for contracts/wasm
- [ ] K17 .env.example: add missing vars (creator/royalty hashes documented)
- [ ] K18 .gitignore: ignore contract target artifacts + wasm outputs
- [ ] K19 .gitattributes: normalize line endings for shell/toml
- [ ] K20 eslint.config.mjs: typed lint rules + next plugin tuned
- [ ] K21 vitest.config.ts: coverage thresholds + reporters
- [ ] K22 tsconfig: strict + noUncheckedIndexedAccess review
- [ ] K23 shared package: exports map verified + types tests
- [ ] K24 Remove dead/demo assets from repo (demo-video.mp4 → releases/LFS)
- [ ] K25 husky hooks: add pre-push test gate (opt-in)
- [ ] K26 commitlint: enforce conventional commits locally
- [ ] K27 CODEOWNERS: accurate ownership map
- [ ] K28 PR template: checklists for contracts/frontend/security
- [ ] K29 Issue templates: add bug/feature labels guidance
- [ ] K30 scripts/prebuild-check.sh: validate env + contract IDs
- [ ] K31 scripts/verify-deploy.sh: assert wasm hashes match env
- [ ] K32 scripts/clean.sh: remove all generated artifacts safely
- [ ] K33 dependency audit: pin + document security posture
- [ ] K34 .npmrc: workspaces + engine strictness
- [ ] K35 vercel.json: headers + caching rules
- [ ] K36 CHANGELOG.md: automate via git-cliff config
- [ ] K37 cliff.toml: conventional-commit → changelog mapping
- [ ] K38 CI: `pnpm audit` gates (no continue-on-error for high)
- [ ] K39 CI: workflow concurrency + caching for cargo/pnpm
- [ ] K40 CI: frontend build uses `--frozen-lockfile` + typecheck
- [ ] K41 Root README: quickstart accuracy + badges
- [ ] K42 .editorconfig: cover rust/toml/yaml
- [ ] K43 Remove duplicate devDeps (eslint-config-next etc.) where redundant
- [ ] K44 Add `contract:abi` script exporting interfaces
- [ ] K45 Add `db:reset`/`dev:reset` convenience scripts
- [ ] K46 next-env.d.ts / typecheck in CI for web explicitly
- [ ] K47 License headers policy + MIT LICENSE check
- [ ] K48 Add `.nvmrc`/`.node-version` sync (both exist — document)
- [ ] K49 CI: upload test/coverage artifacts for visibility
- [ ] K50 Add root `Makefile`-style task aliases (or document pnpm scripts)

## E. General / Docs (50)

- [ ] G01 ARCHITECTURE.md with data-flow diagram of the five contracts
- [ ] G02 Contract interface reference (functions, args, auth)
- [ ] G03 contracts/README.md local quickstart (build/test/deploy)
- [ ] G04 CONTRIBUTING.md triage, labels, self-assignment guide
- [ ] G05 FAQ.md (wallet, testnet funds, IPFS, common errors)
- [ ] G06 SECURITY.md: threat model + key rotation + reporting
- [ ] G07 README: fix inaccuracies, add feature table + screenshots
- [ ] G08 DEMO.md refresh against current flows
- [ ] G09 CODE_OF_CONDUCT.md polish
- [ ] G10 ISSUES.md status pass (mark resolved items)
- [ ] G11 Design tokens documentation (colors, spacing, typography)
- [ ] G12 API documentation page
- [ ] G13 Deployment guide (Vercel + self-host + contracts)
- [ ] G14 Testnet funding guide (Friendbot)
- [ ] G15 Freighter wallet setup guide
- [ ] G16 IPFS/Pinata setup + limits guide
- [ ] G17 Monorepo layout guide
- [ ] G18 Smart contract security review notes
- [ ] G19 Glossary of terms (NFT, Soroban, bps, etc.)
- [ ] G20 Troubleshooting guide
- [ ] G21 Versioning + changelog policy
- [ ] G22 Release process runbook
- [ ] G23 Environment setup guide (fresh clone → running app)
- [ ] G24 Code style guide (TS + Rust conventions)
- [ ] G25 Accessibility statement + practices
- [ ] G26 License/attribution notes
- [ ] G27 Roadmap doc
- [ ] G28 Data-flow diagrams (web → API → contracts)
- [ ] G29 Indexer schema doc (once B01 lands)
- [ ] G30 Upgrade/migration guide for contracts
- [ ] G31 Assets: move demo-video + screenshots policy
- [ ] G32 Community health files (.github/FUNDING.yml etc.)
- [ ] G33 GitHub topics + description accuracy
- [ ] G34 Social preview/OG image for the repo
- [ ] G35 Release-notes automation config
- [ ] G36 Tag/branch protection documentation
- [ ] G37 Dependency update policy (npm + cargo)
- [ ] G38 security.txt guidance for deployments
- [ ] G39 Contract addresses registry doc (per network)
- [ ] G40 Testnet faucet + funding runbook
- [ ] G41 Mainnet readiness checklist
- [ ] G42 Performance budget + Lighthouse target doc
- [ ] G43 Incident response runbook
- [ ] G44 Backup/recovery policy doc
- [ ] G45 On-chain data dictionary (storage keys, events)
- [ ] G46 Local development FAQ additions
- [ ] G47 Third-party service inventory (Pinata, Horizon, RPC)
- [ ] G48 Community/contributor recognition policy
- [ ] G49 Observability guide (logs, health, metrics)
- [ ] G50 Project meta: replace placeholder screenshots with real ones

---

## Execution rules

1. Batches of 20, one commit per improvement, no bundling.
2. Every improvement is tested (unit/component/contract/docs verified) before commit.
3. After each batch: `git push origin main`.
4. Detailed commit messages: what + why.
5. Committer/author: `MidstCodes <306365947+MidstCodes@users.noreply.github.com>`.
