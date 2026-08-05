# BezaMint — 100 Contributor Issues

A curated backlog of 100 issues an open source contributor can pick up. Each issue is
grounded in the actual codebase, includes a difficulty rating and suggested labels, and
ends with explicit acceptance criteria so a PR can be verified objectively.

**How to file these as GitHub issues**

Each entry below is written to be copied directly into a GitHub issue. Use the suggested
labels (create them first: `good-first-issue`, `contracts`, `frontend`, `backend`, `tests`,
`ci`, `docs`, `enhancement`, `bug`, `security`, `performance`, `accessibility`, `i18n`).

---

## A. Smart Contracts (30 issues)

### 1. [nft] `transfer_from` is missing — approvals cannot be used
- **Labels:** `contracts`, `enhancement` · **Difficulty:** Medium
- **Problem:** `approve`, `set_approval_for_all`, `is_approved`, and `is_approved_for_all`
  exist in `contracts/nft/src/lib.rs`, but there is no `transfer_from`. This means an
  approved operator can never actually move a token, so the entire approval system is dead
  code in practice.
- **Acceptance criteria:** `transfer_from(spender, from, to, token_id)` that requires the
  spender to be approved (per-token or for-all) and performs a normal transfer; unit tests
  for per-token approval, for-all approval, unapproved-spender rejection, and ownership
  invariants.

### 2. [collection] `add_nft`/`remove_nft` have an unused `_admin` parameter
- **Labels:** `contracts`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** In `contracts/collection/src/lib.rs`, `add_nft` and `remove_nft` accept
  `_admin: Address` but ignore it (the code reads the stored admin instead). The parameter
  is misleading — callers believe their address authorizes the call.
- **Acceptance criteria:** Remove the unused parameter, update the frontend service calls
  in `apps/web/src/services/contracts.ts`, and fix any tests that pass the extra argument.

### 3. [collection] NFTs minted via the Factory are never added to a collection
- **Labels:** `contracts`, `bug`, `enhancement` · **Difficulty:** Medium
- **Problem:** `factory.mint_with_royalty` mints the NFT but never calls
  `collection.add_nft`, so `get_nfts_in_collection` stays empty even after successful
  mints. The collection↔NFT link is broken end-to-end.
- **Acceptance criteria:** Factory mints with a collection_id and then invokes `add_nft`
  on the Collection contract; integration test in `contracts/factory/src/test.rs` proves
  `get_nfts_in_collection` returns the minted token.

### 4. [collection] `add_nft` allows duplicate token IDs
- **Labels:** `contracts`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `add_nft` pushes `token_id` onto `NftsInCollection` without checking whether
  it is already present, so the same token can appear twice in a collection.
- **Acceptance criteria:** `add_nft` returns early (or panics with a clear message) when the
  token is already in the collection; regression test for the duplicate case.

### 5. [collection] `remove_nft` is O(n) and leaks storage entries
- **Labels:** `contracts`, `performance` · **Difficulty:** Medium
- **Problem:** `remove_nft` rebuilds the entire `Vec` by iterating — O(n) per removal — and
  `MAX_NFTS_PER_COLLECTION` is declared twice (dead code in `remove_nft`).
- **Acceptance criteria:** Constant-time-ish removal or documented trade-off; single shared
  `MAX_NFTS_PER_COLLECTION` constant; test that removal keeps order and count correct.

### 6. [collection] `get_collections_by_creator` scans every collection — add pagination
- **Labels:** `contracts`, `performance`, `enhancement` · **Difficulty:** Hard
- **Problem:** The query loops from `1..=total` reading every collection (O(n) storage
  reads) and returns all matches in one call — unbounded cost as the platform grows.
- **Acceptance criteria:** Add `start: u64`/`limit: u32` (or cursor) pagination with a
  documented max page size; tests for paging behavior and out-of-range handling.

### 7. [nft] No owner token enumeration — add `tokens_of_owner`
- **Labels:** `contracts`, `enhancement`, `good-first-issue` · **Difficulty:** Medium
- **Problem:** The NFT contract has `balance_of` but no way to list a wallet's token IDs.
  The web app's profile page needs this for "My NFTs" views.
- **Acceptance criteria:** `tokens_of_owner(owner, start, limit) -> Vec<u64>` with
  pagination; tests including an owner with many tokens and an empty wallet.

### 8. [royalty] Royalties are configured but never paid out on transfer
- **Labels:** `contracts`, `enhancement`, `security` · **Difficulty:** Hard
- **Problem:** The royalty contract stores `RoyaltyConfig` but `nft.transfer` does not
  consult it, so no secondary-sale royalty is ever collected. The core royalty promise of
  the platform is unimplemented.
- **Acceptance criteria:** A mechanism (e.g., factory-managed escrow or a `pay_royalty`
  helper that transfers the configured basis-points share to recipients) invoked on
  transfer; tests proving sellers receive principal and recipients receive royalties.

### 9. [royalty] `update_royalty` and `freeze_royalty` are admin-gated only
- **Labels:** `contracts`, `enhancement` · **Difficulty:** Medium
- **Problem:** Only the royalty contract admin can update/freeze a royalty config. For a
  creator-focused platform the creator (or the configured recipient) should be able to
  update their own royalty until frozen.
- **Acceptance criteria:** `update_royalty` requires the creator/recipient (or admin); the
  freeze remains admin-only; tests updated accordingly. Document the access model.

### 10. [royalty] Recipient shares are not validated to sum to 100%
- **Labels:** `contracts`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `configure_royalty` accepts a `Map<Address, u32>` of recipient shares with no
  sum check, so a config can give out 250% of royalties or 40%.
- **Acceptance criteria:** Validate that shares sum to 100 (with 0-recipient allowed
  meaning 100% to creator); tests for under/over-sum rejection.

### 11. [royalty] No per-collection royalty inheritance
- **Labels:** `contracts`, `enhancement` · **Difficulty:** Medium
- **Problem:** Royalty configs exist for NFTs (`is_collection=false`) and collections
  (`is_collection=true`), but a new NFT without its own config never falls back to its
  collection's config.
- **Acceptance criteria:** `get_royalty` falls back to the collection config when no NFT
  config exists; documented precedence; tests for both paths.

### 12. [factory] `set_contracts` cannot be re-invoked to fix mistakes
- **Labels:** `contracts`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `set_contracts` overwrites the stored addresses with no guard, and there is
  no check preventing zero/invalid addresses, so a bad deployment permanently breaks the
  factory.
- **Acceptance criteria:** Reject invalid (zero) addresses; document that admin can
  re-point contracts; test that a wrong-address call leaves a clear error.

### 13. [factory] No event for royalty configuration in `mint_with_royalty`
- **Labels:** `contracts`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `mint_with_royalty` emits only `NftMinted`, even though it also configures a
  royalty. Indexers and the activity feed cannot see royalty configs from factory mints.
- **Acceptance criteria:** Emit a royalty-configured event (or reuse the royalty contract's
  event) for the factory path; integration test asserts the event.

### 14. [creator] `update_profile` does not validate URL schemes
- **Labels:** `contracts`, `security`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `avatar_uri`/`banner_uri`/`metadata_uri` are length-checked but not scheme-
  checked, so arbitrary schemes (`javascript:`, `file:`) can be stored and later rendered.
- **Acceptance criteria:** Reject non-`http(s)`/`ipfs`/`data:` schemes at write time; tests
  for each rejected scheme.

### 15. [creator] `set_social_links` accepts unknown platforms
- **Labels:** `contracts`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Social links store `(platform, handle)` with no whitelist, so the frontend's
  `socialPlatforms.ts` list and on-chain state can drift, and garbage platforms can be
  stored.
- **Acceptance criteria:** Whitelist known platforms on-chain (or document the policy);
  frontend + contract tests for valid/invalid platforms.

### 16. [nft] Metadata URI has no content-hash / provenance check
- **Labels:** `contracts`, `enhancement` · **Difficulty:** Hard
- **Problem:** `metadata_uri` can point anywhere and be changed by nothing after mint
  (good), but there is no on-chain commitment (hash) of the metadata, so off-chain
  providers can mutate attributes.
- **Acceptance criteria:** Optional `metadata_hash` field on `NftData`, verified by the
  frontend's metadata resolver; tests for hash validation on mint.

### 17. [nft] `transfer` has no royalty/collection bookkeeping hook
- **Labels:** `contracts`, `enhancement` · **Difficulty:** Medium
- **Problem:** When a token transfers, the collection's `get_collection_for_nft` mapping and
  any royalty registry are unaware. Ownership-based features will be stale.
- **Acceptance criteria:** Transfer emits a standardized event and (via factory hook) keeps
  the royalty registry in sync; tests for ownership changes.

### 18. [nft] `burn` does not clean up approvals
- **Labels:** `contracts`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Burning a token leaves per-token approvals behind, which can be confusing
  (and, once `transfer_from` exists, exploitable if the token id is recycled).
- **Acceptance criteria:** `burn` clears the token's approvals; test that approvals are gone
  after burn.

### 19. [nft] `approve`/`transfer` accept the zero address
- **Labels:** `contracts`, `security`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `transfer` to the zero address and `approve` of the zero address are not
  rejected, unlike `mint` which already checks for it.
- **Acceptance criteria:** Both paths reject the zero address with a clear panic; tests for
  each.

### 20. [contracts] Panic messages are inconsistent across crates
- **Labels:** `contracts`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Some panics use `"NFT: ..."`, others `"Collection: ..."` and some are bare
  asserts. Standardize the prefix/format so SDK users can reliably map errors.
- **Acceptance criteria:** All panics across the 5 crates follow one documented format;
  update tests that assert on message text.

### 21. [contracts] No `Upgradable`/admin-owned upgradeability
- **Labels:** `contracts`, `enhancement` · **Difficulty:** Hard
- **Problem:** All five contracts are immutable post-deploy with no upgrade path, making bug
  fixes (like royalty payouts) impossible without redeploying and migrating state.
- **Acceptance criteria:** Use the Soroban `Admin`/`Upgradable` pattern in at least the
  factory and nft contracts; document the migration story; test admin-only upgrade.

### 22. [contracts] Storage keys are not versioned for migration
- **Labels:** `contracts`, `enhancement` · **Difficulty:** Medium
- **Problem:** `Version` keys exist but nothing reads or uses them to migrate data
  structures; schema changes would silently corrupt reads.
- **Acceptance criteria:** A documented storage-versioning convention and a read helper that
  checks versions; tests for stale-version reads.

### 23. [collection] `update_collection` and `archive_collection` don't validate URI length
- **Labels:** `contracts`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `create_collection` validates the metadata URI (non-empty, ≤512), but the
  update path applies no validation.
- **Acceptance criteria:** `update_collection` re-validates; tests for empty and oversized
  URIs on update.

### 24. [nft] Max supply is a hardcoded constant — make it configurable
- **Labels:** `contracts`, `enhancement` · **Difficulty:** Medium
- **Problem:** `MAX_SUPPLY` is baked in. A creator may want a smaller/larger cap per
  collection.
- **Acceptance criteria:** Per-collection supply cap consulted during `mint` (falling back
  to the global cap); tests for cap enforcement per collection.

### 25. [factory] No batch mint (mint N tokens in one call)
- **Labels:** `contracts`, `enhancement`, `good-first-issue` · **Difficulty:** Medium
- **Problem:** Minting a multi-item collection requires N transactions; a
  `mint_batch_with_royalty` would save fees and simplify the drop UX.
- **Acceptance criteria:** Batch function returning the first/last token id; integration
  test minting 5 tokens with one royalty config.

### 26. [collection] No `is_archived` guard on `add_nft`
- **Labels:** `contracts`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `add_nft` checks `!is_archived`, but the factory path mints into collections
  regardless; archived collections can silently grow.
- **Acceptance criteria:** Document and enforce the archive invariant consistently across
  mint/transfer paths; test archived-collection mint rejection.

### 27. [nft] `token_data` exposes the full struct with no view-model
- **Labels:** `contracts`, `enhancement` · **Difficulty:** Easy
- **Problem:** `NftData` mixes on-chain and off-chain fields; consider a `token_uri(token_id)`
  helper matching standard NFT interfaces for ecosystem interop.
- **Acceptance criteria:** Add `token_uri`/`token_metadata` query helpers; tests for
  un-minted and minted tokens.

### 28. [royalty] Basis-point validation is duplicated in the web SDK and the contract
- **Labels:** `contracts`, `tests` · **Difficulty:** Easy
- **Problem:** `validate_basis_points` exists on-chain and `royalty-validation.test.ts`
  covers it off-chain; the two can drift.
- **Acceptance criteria:** Single source of truth documented in `packages/shared` with a
  cross-checking test that mirrors the contract's constant.

### 29. [contracts] No fuzz/property tests for counters and edge arithmetic
- **Labels:** `contracts`, `tests` · **Difficulty:** Medium
- **Problem:** Counter increments (`counter + 1`), supply caps, and basis-point math have no
  property tests; off-by-one bugs are likely.
- **Acceptance criteria:** Property-style tests (e.g., minting to max supply boundary,
  exactly max, max+1 rejected) added to `contracts/*/src/test.rs`.

### 30. [contracts] Add `cargo contract`-style ABI/JSON export to CI
- **Labels:** `contracts`, `ci` · **Difficulty:** Medium
- **Problem:** No published ABI/interface files for the contracts, so the frontend's
  argument order in `services/contracts.ts` can silently diverge from the contract.
- **Acceptance criteria:** CI exports contract interface JSON and fails when a build would
  change it; document how the frontend consumes the ABI.

---

## B. Frontend (30 issues)

### 31. [web] Search results are hardcoded mocks
- **Labels:** `frontend`, `bug`, `enhancement` · **Difficulty:** Hard
- **Problem:** `SearchResults.tsx` (`MOCK_RESULTS`) and the explore page render fake data;
  real queries never reach a backend or the chain.
- **Acceptance criteria:** Wire search to an indexer/API (or on-chain fallback), show a
  loading state and empty state, keep tests passing.

### 32. [web] Creator profile page uses `MOCK_CREATOR`
- **Labels:** `frontend`, `bug`, `good-first-issue` · **Difficulty:** Medium
- **Problem:** `creators/[address]/page.tsx` renders `MOCK_CREATOR` regardless of the
  address in the URL.
- **Acceptance criteria:** Load the real on-chain profile for the address, render loading/
  not-found states, and remove the mock constant.

### 33. [web] Collection detail page uses `MOCK_COLLECTION`
- **Labels:** `frontend`, `bug`, `good-first-issue` · **Difficulty:** Medium
- **Problem:** `collections/[id]/page.tsx` renders mock data and never calls
  `get_collection`.
- **Acceptance criteria:** Fetch real collection + its NFTs on mount, add loading/error/
  empty states, remove mock constants.

### 34. [web] No NFT detail page exists
- **Labels:** `frontend`, `enhancement` · **Difficulty:** Medium
- **Problem:** There is no `/nft/[id]` (or `/token/[contract]/[id]`) route, so there is no
  place to view a single NFT, its owner, metadata, and royalty config.
- **Acceptance criteria:** A new route renders on-chain `token_data`, owner, metadata image,
  and royalty config; navigation wired from collections and search cards.

### 35. [web] ActivityTimeline links are hardcoded to `stellar.expert`
- **Labels:** `frontend`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `ActivityTimeline.tsx` builds explorer URLs with a hardcoded
  `stellar.expert/explorer/testnet/...` while the app supports a configurable explorer
  (see settings page).
- **Acceptance criteria:** Explorer base URL comes from config/networks; testnet vs
  mainnet URLs correct.

### 36. [web] RoyaltyConfig slider can only step in 0.1% increments
- **Labels:** `frontend`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `RoyaltyConfig.tsx` uses `step="10"` basis points; creators cannot set exact
  values like 2.75%.
- **Acceptance criteria:** Allow precise entry (text/number input synced with the slider)
  while clamping to ≤10000 bps.

### 37. [web] No wallet-disconnected guard on transaction flows
- **Labels:** `frontend`, `bug` · **Difficulty:** Medium
- **Problem:** `MintForm` and other flows can attempt `signAndSubmit` without a connected
  wallet; errors are only surfaced late.
- **Acceptance criteria:** Disable/prevent submit until a wallet is connected; friendly
  connect prompt; tests for the guard.

### 38. [web] Transaction status is a generic component — no success deep-links
- **Labels:** `frontend`, `enhancement`, `good-first-issue` · **Difficulty:** Medium
- **Problem:** `TransactionStatus` shows a status but no link to the resulting NFT or
  collection on success.
- **Acceptance criteria:** On success, show explorer link + link to the minted asset's page
  (once issue 34 exists).

### 39. [web] Mint flow doesn't create the collection first
- **Labels:** `frontend`, `enhancement` · **Difficulty:** Hard
- **Problem:** `CollectionSelector` only picks existing collections; there is no
  "create collection" step in the mint wizard even though `create_collection_for_creator`
  exists on-chain.
- **Acceptance criteria:** Wizard supports creating a new collection inline, submitting it,
  then minting into it; happy-path test.

### 40. [web] Image upload has no compression/resizing client-side
- **Labels:** `frontend`, `performance`, `enhancement` · **Difficulty:** Medium
- **Problem:** `ImagePreview`/`ipfs.ts` upload full-resolution images; large files increase
  latency and Pinata costs.
- **Acceptance criteria:** Client-side resize (max dimension) + WebP conversion before
  upload; tests for the resize utility.

### 41. [web] No retry on IPFS upload failure
- **Labels:** `frontend`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `pinata.ts` fails hard on transient errors; flaky uploads kill the whole
  mint.
- **Acceptance criteria:** Retry with exponential backoff (2–3 attempts), surface a
  meaningful error otherwise; unit tests for the retry helper.

### 42. [web] Attributes are not validated before submit
- **Labels:** `frontend`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `AttributeEditor` allows empty trait names/values and duplicates; shared
  `validation.ts` caps exist but aren't applied to the form.
- **Acceptance criteria:** Inline validation (max count, non-empty, dedupe) wired to shared
  limits; tests.

### 43. [web] Explore page "Verified Creators" card is non-functional
- **Labels:** `frontend`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** The featured cards on the explore page are static marketing boxes with no
  links or data.
- **Acceptance criteria:** Wire at least one card to a real query (recent mints / verified
  creators) or remove them.

### 44. [web] No keyboard navigation for the mobile menu
- **Labels:** `frontend`, `accessibility`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `MobileMenu` toggles without focus management, `aria-expanded`, or Escape-to-
  close.
- **Acceptance criteria:** Accessible dialog behavior with focus trap and Escape handling;
  accessibility tests.

### 45. [web] Header/sidebar have no active-route focus styles for assistive tech
- **Labels:** `frontend`, `accessibility`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Nav links rely on color alone for the active state; screen-reader users get
  no signal.
- **Acceptance criteria:** `aria-current="page"` on active links; visual style retained.

### 46. [web] No dark/light theme toggle despite CSS-variable theming
- **Labels:** `frontend`, `enhancement` · **Difficulty:** Medium
- **Problem:** `globals.css` uses `--bg`-style variables but the app is dark-only.
- **Acceptance criteria:** Theme provider with persisted preference and
  `prefers-color-scheme` initial value; contrast checked for light mode.

### 47. [web] Form inputs lack visible focus rings (WCAG 2.4.7)
- **Labels:** `frontend`, `accessibility`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Several custom inputs (`input-field`, slider) rely on `outline` removal with
  no replacement focus indicator.
- **Acceptance criteria:** Consistent `focus-visible` ring across inputs/buttons; test via
  axe or similar.

### 48. [web] No error boundary fallbacks on interactive pages
- **Labels:** `frontend`, `bug`, `good-first-issue` · **Difficulty:** Medium
- **Problem:** `ErrorBoundary` exists but is only used at the root; a crash in the mint or
  explore page blanks the whole app.
- **Acceptance criteria:** Per-route or per-feature boundaries with friendly reset UI.

### 49. [web] Toast system has no action buttons
- **Labels:** `frontend`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `ToastContext` is generic; success toasts can't carry an "Open explorer"
  action.
- **Acceptance criteria:** Optional action button in toast API; used for tx success.

### 50. [web] No pagination/infinite scroll for collections grid
- **Labels:** `frontend`, `enhancement` · **Difficulty:** Medium
- **Problem:** `CollectionGrid` renders all items at once; large wallets produce huge DOM.
- **Acceptance criteria:** Client-side pagination or virtualization with a documented page
  size.

### 51. [web] Stat cards on dashboard are static if wallet is disconnected
- **Labels:** `frontend`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Dashboard shows zeros/empty when no wallet is connected with no guidance.
- **Acceptance criteria:** Friendly connect CTA state on dashboard when disconnected.

### 52. [web] No copy-to-clipboard affordance for addresses on profile/creator cards
- **Labels:** `frontend`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `truncate-address` and clipboard utilities exist but address displays are
  not clickable to copy.
- **Acceptance criteria:** Copy button with "copied" feedback on all address displays.

### 53. [web] Image loading has no skeleton/failed-state handling
- **Labels:** `frontend`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `ImagePreview` and cards use plain `<img>` with no loading placeholder or
  on-error fallback.
- **Acceptance criteria:** Skeleton shimmer + broken-image fallback; tests for fallback.

### 54. [web] No favicon/OG image assets served from the app
- **Labels:** `frontend`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Metadata references OG images but no `opengraph-image`/`icon` files are in
  `apps/web/src/app`.
- **Acceptance criteria:** Add `icon` + `opengraph-image` (static or generated) assets.

### 55. [web] `useContractEvents` polling is not configurable
- **Labels:** `frontend`, `performance`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** The events hook polls on a fixed interval regardless of page visibility.
- **Acceptance criteria:** Pause polling when the tab is hidden; configurable interval.

### 56. [web] No optimistic UI on collection create/archive
- **Labels:** `frontend`, `enhancement` · **Difficulty:** Medium
- **Problem:** `CollectionForm` and archive actions wait for full confirmation with no
  optimistic feedback.
- **Acceptance criteria:** Optimistic update with rollback on failure for collection
  mutations.

### 57. [web] Mint form doesn't estimate/report network fees
- **Labels:** `frontend`, `enhancement` · **Difficulty:** Medium
- **Problem:** Users don't see fee/fund requirements before submitting; failed txs due to
  insufficient balance are common.
- **Acceptance criteria:** Show estimated fees and warn when the wallet likely can't cover
  them (from balance query).

### 58. [web] No i18n framework — strings are hardcoded in English
- **Labels:** `frontend`, `i18n`, `enhancement` · **Difficulty:** Hard
- **Problem:** Every UI string is inline; the project targets a global audience.
- **Acceptance criteria:** Add a lightweight i18n layer (e.g., `next-intl`), extract key
  strings from at least 3 pages, default locale English.

### 59. [web] No `aria-live` for transaction status changes
- **Labels:** `frontend`, `accessibility`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `TransactionStatus` updates are not announced to screen readers.
- **Acceptance criteria:** Polite `aria-live` region announcing status transitions.

### 60. [web] Colors rely on `bg-bezamint-*` Tailwind tokens with no design tokens docs
- **Labels:** `frontend`, `docs`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `tailwind.config.js` custom colors are undocumented; contributors invent new
  hex values.
- **Acceptance criteria:** Document the color palette/usage in `CONTRIBUTING` or a design
  doc; add a lint guard against raw hex in components.

---

## C. Backend / API (15 issues)

### 61. [api] No server-side indexer — search/explore can't scale
- **Labels:** `backend`, `enhancement` · **Difficulty:** Hard
- **Problem:** There is no backend that indexes on-chain events (mints, transfers, creator
  registrations), so browse/search/activity features are mocked.
- **Acceptance criteria:** A minimal indexer (e.g., Next.js route + Horizon/Event polling
  or a scheduled job) ingests contract events into a queryable store; document the schema.

### 62. [api] Only one real API route exists (`/api/ipfs/upload` and `/api/health`)
- **Labels:** `backend`, `enhancement` · **Difficulty:** Medium
- **Problem:** Everything else is client-side direct-to-chain; there are no server endpoints
  for browse, stats, or metadata resolution.
- **Acceptance criteria:** Add `GET /api/nfts`, `GET /api/collections`, `GET /api/creators`
  (backed by the indexer from issue 61 or on-chain reads) with tests.

### 63. [api] IPFS upload route has no size/type limits or auth
- **Labels:** `backend`, `security`, `bug` · **Difficulty:** Medium
- **Problem:** `api/ipfs/upload/route.ts` accepts uploads with no file-size cap, no MIME
  allowlist, and no rate limiting — abuse costs money (Pinata) and memory.
- **Acceptance criteria:** Enforce max size + allowed MIME types + per-IP rate limit; tests
  for oversized and disallowed files.

### 64. [api] Health route doesn't verify Pinata/chain connectivity
- **Labels:** `backend`, `enhancement`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `api/health` checks configured contracts but not the external services the
  app depends on.
- **Acceptance criteria:** Health payload includes storage (Pinata) and RPC reachability
  with per-service status.

### 65. [api] No structured logging / observability
- **Labels:** `backend`, `enhancement` · **Difficulty:** Medium
- **Problem:** Server routes use ad-hoc logging; no request IDs, timing, or error context.
- **Acceptance criteria:** Small logger utility with request IDs and duration; used in API
  routes.

### 66. [api] No error normalization from Soroban/Horizon to user-facing messages
- **Labels:** `backend`, `enhancement` · **Difficulty:** Medium
- **Problem:** `stellar.ts` throws raw host errors; `tx-error.test.ts` exists but the
  mapping isn't applied broadly in the UI.
- **Acceptance criteria:** Central error-mapping module (already partially in `lib/`) used
  by all pages; tests cover common failure modes.

### 67. [api] No metadata caching — every NFT view re-fetches IPFS
- **Labels:** `backend`, `performance` · **Difficulty:** Medium
- **Problem:** `ipfs.ts` fetches gateway URLs per render with no cache.
- **Acceptance criteria:** HTTP cache headers or an in-memory/edge cache for resolved
  metadata with TTL; tests for cache hits.

### 68. [api] No rate limiting on any route
- **Labels:** `backend`, `security` · **Difficulty:** Medium
- **Problem:** All API routes are unlimited; a misbehaving client can exhaust Pinata quota
  or spam Horizon.
- **Acceptance criteria:** Rate limiting middleware on upload + future routes; tests.

### 69. [api] Contract addresses are loaded from env but not validated at boot
- **Labels:** `backend`, `bug`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** A malformed `CONTRACT_IDS` env var silently produces unusable reads (see the
  settings page reading `CONTRACT_IDS`).
- **Acceptance criteria:** Boot-time validation of contract IDs with a clear error; unit
  tests for the parser.

### 70. [api] No `/api/transactions` history for the connected wallet
- **Labels:** `backend`, `enhancement` · **Difficulty:** Hard
- **Problem:** There is no history endpoint; the activity timeline is the only (mock) view
  of tx history.
- **Acceptance criteria:** Endpoint returning recent contract interactions for a wallet
  (from indexer); used by a real activity feed.

### 71. [api] Pinata JWT is a single shared credential with no key rotation story
- **Labels:** `backend`, `security`, `docs`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** The upload route reads one `PINATA_JWT`; nothing documents rotation or
  per-deployment keys.
- **Acceptance criteria:** Document key rotation in `SECURITY.md` and validate env presence
  at startup.

### 72. [api] No request validation schema for upload route
- **Labels:** `backend`, `security`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Upload route trusts `FormData` shape; malformed requests cause 500s.
- **Acceptance criteria:** Validate form fields with explicit 400 responses; tests.

### 73. [api] CORS is wide open on API routes
- **Labels:** `backend`, `security`, `bug` · **Difficulty:** Easy
- **Problem:** If API routes serve cross-origin requests, no origin allowlist is applied.
- **Acceptance criteria:** Explicit CORS allowlist matching the deployed app origin; test.

### 74. [api] No caching strategy for the Next.js app itself
- **Labels:** `backend`, `performance` · **Difficulty:** Medium
- **Problem:** Public pages (landing, explore) have no ISR/revalidation, so all renders are
  dynamic.
- **Acceptance criteria:** ISR or `revalidate` tags on suitable routes; document the
  strategy.

### 75. [api] Metadata JSON schema is not enforced server-side
- **Labels:** `backend`, `enhancement` · **Difficulty:** Medium
- **Problem:** The shared `metadata.ts` helpers define expectations, but no server-side
  schema validates metadata before it reaches IPFS.
- **Acceptance criteria:** Validate metadata JSON against the shared schema in the upload
  route; tests for invalid metadata.

---

## D. Testing (10 issues)

### 76. [tests] No Playwright E2E tests
- **Labels:** `tests`, `enhancement` · **Difficulty:** Hard
- **Problem:** Only unit/component tests exist; the critical mint→confirm→view flow is never
  exercised end-to-end.
- **Acceptance criteria:** Playwright project with a smoke test for landing → connect →
  explore, plus one for the mint form validation; run in CI.

### 77. [tests] No coverage thresholds enforced in CI
- **Labels:** `tests`, `ci` · **Difficulty:** Easy
- **Problem:** `vitest` runs without coverage gates, so coverage can silently regress.
- **Acceptance criteria:** Coverage report in CI with a documented threshold; failing PRs
  blocked below it.

### 78. [tests] Contract tests don't assert emitted events
- **Labels:** `tests`, `contracts`, `good-first-issue` · **Difficulty:** Medium
- **Problem:** Most contract tests check state but never assert `env.events()` payloads,
  allowing event regressions (like the earlier `set_social_links` fix).
- **Acceptance criteria:** Event assertions added for mint, transfer, burn, collection
  create/archive, royalty configure/freeze, creator register/verify.

### 79. [tests] No tests for the wallet context provider
- **Labels:** `tests`, `frontend`, `good-first-issue` · **Difficulty:** Medium
- **Problem:** `WalletContext` (connect/disconnect/balance) has no component tests despite
  being the app's core state.
- **Acceptance criteria:** Render-provider tests covering connect, disconnect, error, and
  stored-session restore with mocked Freighter.

### 80. [tests] `MintForm` has no component tests
- **Labels:** `tests`, `frontend` · **Difficulty:** Medium
- **Problem:** The most important form in the app (validation, royalties, attributes) is
  untested.
- **Acceptance criteria:** Tests for validation failures, royalty config toggling, and
  submit-disabled states.

### 81. [tests] No boundary tests around the 512-char metadata URI limit
- **Labels:** `tests`, `contracts`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Length caps are asserted but 511/512/513-char boundary tests are missing.
- **Acceptance criteria:** Boundary tests in nft and collection crates (511 ok, 512 ok,
  513 rejected).

### 82. [tests] No tests for `useTransaction` hook edge cases
- **Labels:** `tests`, `frontend`, `good-first-issue` · **Difficulty:** Medium
- **Problem:** `useTransaction` handles abort/retry/timeout but is untested.
- **Acceptance criteria:** Tests for abort, retry exhaustion, and success paths with mocked
  `stellar.ts`.

### 83. [tests] No snapshot tests for shared validation limits
- **Labels:** `tests`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `limits.ts` values are asserted piecemeal; a single change can break multiple
  hidden expectations.
- **Acceptance criteria:** A snapshot/table test documenting all limit constants and their
  consumers.

### 84. [tests] No test for explorer URL building
- **Labels:** `tests`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Explorer URLs are built in multiple places (activity timeline, settings,
  tx links) with no shared helper or tests.
- **Acceptance criteria:** A shared `buildExplorerUrl` util with tests for testnet/mainnet
  and tx/contract/account paths.

### 85. [tests] Rust `cargo test` is not wired into CI gates
- **Labels:** `tests`, `ci` · **Difficulty:** Easy
- **Problem:** CI builds wasm but the test workflow runs frontend tests only; contract tests
  can regress unnoticed.
- **Acceptance criteria:** CI runs `cargo test --workspace` and fails on red.

---

## E. CI / Tooling (10 issues)

### 86. [ci] Release workflow has no auto-versioning or changelog trigger
- **Labels:** `ci`, `enhancement` · **Difficulty:** Medium
- **Problem:** `cliff.toml` and `release.yml` exist but releases aren't triggered by
  conventional commits or tags.
- **Acceptance criteria:** Tag-push release that runs cliff, builds wasm, and drafts a
  GitHub release with notes.

### 87. [ci] No Docker image for the web app
- **Labels:** `ci`, `enhancement` · **Difficulty:** Medium
- **Problem:** There is no containerized build, making local/self-hosted deploys
  inconsistent.
- **Acceptance criteria:** Multi-stage Dockerfile for `apps/web` with a smoke check in CI.

### 88. [ci] `check-lockfile.sh` and `prebuild-check.sh` aren't run in CI
- **Labels:** `ci`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Scripts exist to validate lockfiles and prebuild state but CI never runs
  them.
- **Acceptance criteria:** Wire both into CI (or document why not) and ensure they exit
  non-zero on failure.

### 89. [ci] No automated dependency vulnerability fix loop
- **Labels:** `ci`, `security` · **Difficulty:** Easy
- **Problem:** Dependabot is configured but there's no policy for auto-merge of safe patch
  updates or a cadence for cargo-audit triage.
- **Acceptance criteria:** Documented dependabot merge policy (or auto-merge workflow for
  patch bumps).

### 90. [ci] CI doesn't verify `pnpm --filter @bezamint/shared lint` separately
- **Labels:** `ci`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** The shared package has its own lint/typecheck that can break while web CI
  passes.
- **Acceptance criteria:** Add a shared-package check job to CI.

### 91. [ci] No performance/lighthouse budget check
- **Labels:** `ci`, `performance` · **Difficulty:** Medium
- **Problem:** Next.js output size and bundle can regress without anyone noticing.
- **Acceptance criteria:** Lighthouse CI or bundle-size budget on PRs (document thresholds).

### 92. [ci] No `cargo fmt --check` / `clippy` in the contract CI job
- **Labels:** `ci`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Formatting/lint discipline for Rust isn't enforced in CI.
- **Acceptance criteria:** Add fmt/clippy steps to the contract job and fix existing
  warnings.

### 93. [ci] `stale.yml` may close issues too aggressively for a growing backlog
- **Labels:** `ci`, `community` · **Difficulty:** Easy
- **Problem:** Stale bot config exists; check the thresholds are contributor-friendly.
- **Acceptance criteria:** Review and document stale/lock thresholds; mark
  `good-first-issue` as exempt from closing.

### 94. [ci] No CI matrix for Node versions
- **Labels:** `ci`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** CI runs one Node version; engines say `>=20`.
- **Acceptance criteria:** Test on the supported Node LTS range (20/22) in a matrix.

### 95. [ci] `deploy.sh` has no rollback or dry-run flag
- **Labels:** `ci`, `enhancement`, `good-first-issue` · **Difficulty:** Medium
- **Problem:** Deploys are all-or-nothing with no safety net.
- **Acceptance criteria:** Add `--dry-run` and a documented rollback step (re-deploy last
  known-good commit).

---

## F. Docs & Community (5 issues)

### 96. [docs] No ARCHITECTURE.md explaining the five contracts
- **Labels:** `docs`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Contributors must reverse-engineer how NFT, Collection, Royalty, Creator,
  and Factory interact.
- **Acceptance criteria:** An architecture doc with a data-flow diagram (ASCII/mermaid) and
  cross-contract call descriptions.

### 97. [docs] No contract interface reference for frontend devs
- **Labels:** `docs`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `services/contracts.ts` argument orders are opaque; SDK users can't verify
  calls against the contracts.
- **Acceptance criteria:** A generated or hand-written table of every public function, its
  args, and auth requirements.

### 98. [docs] No local-development quickstart for the contracts alone
- **Labels:** `docs`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** README covers the app; running only `cargo test --workspace`/wasm build
  locally needs a dedicated guide.
- **Acceptance criteria:** A `contracts/README.md` with rust-toolchain setup, build, test,
  and deploy-to-testnet steps.

### 99. [docs] No contributing guide for issue triage and labels
- **Labels:** `docs`, `community`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** `CONTRIBUTING.md` covers code checks but not how issues get labeled,
  estimated, or claimed.
- **Acceptance criteria:** Document label taxonomy, "good first issue" criteria, and how to
  self-assign.

### 100. [docs] No FAQ/known-issues page
- **Labels:** `docs`, `community`, `good-first-issue` · **Difficulty:** Easy
- **Problem:** Common questions (Freighter setup, testnet funding, why a tx failed) are
  answered only in scattered issues.
- **Acceptance criteria:** A `FAQ.md` (or docs section) covering wallet setup, testnet
  funds via Friendbot, IPFS/Pinata limits, and common Soroban errors.

---

## Suggested label set

`good-first-issue` · `contracts` · `frontend` · `backend` · `tests` · `ci` · `docs` ·
`enhancement` · `bug` · `security` · `performance` · `accessibility` · `i18n` · `help-wanted`

## Suggested difficulty → label mapping

- **Easy** → `good-first-issue`
- **Medium** → `help-wanted`
- **Hard** → `help-wanted` + `design-decision-needed` (create as needed)
