# BezaMint — Contributor Backlog

97 open issues, every one verified against the current tree. Each entry names the
problem, the evidence that it is real, and acceptance criteria a reviewer can check
objectively. Every entry here corresponds to an open issue in the tracker, and every
issue in the tracker corresponds to an entry here — the two are kept in step
deliberately, and any disagreement is a bug.

Start with [`docs/architecture.md`](docs/architecture.md) for how the system fits
together, [`contracts/README.md`](contracts/README.md) for the interface reference and
[`docs/deployment-runbook.md`](docs/deployment-runbook.md) for operating it.
[`docs/review/critical-review.md`](docs/review/critical-review.md) records the findings
that have already been fixed.

## How this list is maintained

The tracker previously carried 100 open issues that were auto-generated from an earlier
version of this file. Almost all of them described gaps that had since been closed, which
cost real time: two pull requests were opened against issues that were already
implemented, one adding a second module duplicating `apps/web/src/lib/explorer.ts` and one
adding a `CONTRIBUTING.md` that already existed. Those issues were closed and the tracker
was reduced to the work that was genuinely open.

It has since been grown back to 100, and now stands at **97**. The admin-rotation work
closed #133 and #134, the error-catalog work closed #138 and #139, and #209 — the
`Security` workflow, which had been failing on every run without ever reaching its
audit — was closed once the check was verified green. That count is only defensible
because every new entry was checked against the tree first and carries the command or
file that demonstrates the gap. An entry whose evidence no longer holds should be
closed, not rewritten — the five closed above went the moment the fix shipped, rather
than being kept open to hold the number up. The distinction that matters is not the
count, it is whether opening an issue tells a contributor something true.

Labels: `good first issue` for scoped work needing no context, `difficulty: easy`/
`medium`/`hard`, and `design-decision-needed` where the work cannot start before a
decision is recorded.

## Contracts

### 22. [collection] remove_nft is O(n) and leaks storage entries

**Difficulty:** Medium
**Problem.** `remove_nft` rebuilds the collection's token index by iterating every entry, so removal is O(n). The original report also named a duplicated `MAX_NFTS_PER_COLLECTION` constant; that part is resolved — the constant is declared once at `contracts/collection/src/lib.rs:34`.
**Acceptance criteria.** Either a removal path that avoids rebuilding the whole index, or a documented decision that an ordered vector is intentional with its cost stated. Tests that removal preserves order and the remaining count.
**Notes.** The index is an ordered `Vec<u64>` and the order is part of the read surface (`nfts_in_collection` returns tokens in creation order), so a swap-remove would change observable behaviour. A tombstone plus a compaction path is the likely shape.

### 25. [royalty] Royalties are configured but never paid out on transfer

**Difficulty:** Medium
**Problem.** Royalty terms are stored and quotable, but nothing obliges a buyer's client to pay them: `nft.transfer` moves a token with no sale price, so a payout cannot be computed there and paying on a bare transfer is not well-defined. The mechanism that does exist is `quote_royalty(target_id, is_collection, sale_price)` (`contracts/royalty/src/lib.rs:471`), which returns exact per-recipient amounts with the rounding remainder assigned to the last recipient so no stroop is created or lost.
**Acceptance criteria.** A decision recorded in `docs/architecture.md` and `contracts/README.md`:

- **(a)** royalties are marketplace-enforced: document the integration contract for a marketplace and state plainly that a client which ignores `quote_royalty` can bypass them; or
- **(b)** an escrowed sale entry point is added that atomically collects the sale price and distributes the quote, with tests proving the seller receives the principal and each recipient the quoted amount.
  **Notes.** (a) is the Soroban-idiomatic answer and is what the current interface supports. (b) is what "this contract enforces royalties" would require. This is a scope decision before it is an implementation.

### 28. [royalty] No per-collection royalty inheritance

**Difficulty:** Medium
**Problem.** A royalty config can be set for a collection (`is_collection = true`) or for an individual token (`is_collection = false`), but `get_royalty` does not fall back from the token to its collection. A token with no config of its own therefore reads as having no royalty even when its collection has one.
**Acceptance criteria.** `get_royalty` falls back to the collection config when no token config exists; the precedence is documented; tests for both the fallback and the override.
**Notes.** The fallback needs the token-to-collection mapping, which currently lives on the Collection contract, so this either adds a cross-contract read or moves the mapping somewhere the royalty query can reach.

### 33. [nft] Metadata URI has no content-hash / provenance check

**Difficulty:** Hard
**Problem.** `metadata_uri` is immutable after mint, which is the right property, but there is no on-chain commitment to the metadata _content_. A URI can resolve to different attributes later than the ones a reviewer saw at mint time, and nothing on-chain could detect it.
**Acceptance criteria.** An optional `metadata_hash` recorded at mint, exposed by `token_data`; the frontend metadata resolver verifies the fetched document against it and surfaces a mismatch instead of rendering unverified metadata; tests covering hash recording and mismatch handling.
**Notes.** Optional rather than required, so existing tokens and creators without a digest are unaffected.

### 34. [nft] transfer has no royalty/collection bookkeeping hook

**Difficulty:** Medium
**Problem.** A transfer already emits `NftEvent::Transferred(token_id, from, to)` (`contracts/nft/src/lib.rs:457`) and updates the owner index, so the eventing and ownership bookkeeping the original report asked for are in place. What does not exist is any link from a transfer to the royalty registry: there is nothing for an operator sync or a stale-config cleanup to hook into.
**Acceptance criteria.** Either a documented statement that royalty configs are keyed by token id and are deliberately unaffected by transfer, with the reasoning, or the specific bookkeeping that should change on transfer, with tests.
**Notes.** Entangled with the royalty enforcement decision in the royalty cluster; whichever way that goes determines whether anything needs to change here.

### 41. [nft] Max supply is a hardcoded constant — make it configurable

**Difficulty:** Medium
**Problem.** `MAX_SUPPLY` is a single global constant, so a creator cannot express "this drop is limited to 100".
**Acceptance criteria.** An optional per-collection cap consulted by `mint`, falling back to the global limit; tests at the cap, cap − 1 and cap + 1.
**Notes.** The cap has to live where `mint` can read it. The NFT contract serves every collection and is not wired to the Collection contract, so either the NFT contract gains an admin-only collection-contract pointer and a cross-contract read, or the cap is enforced in the Factory where a direct `mint` bypasses it. The first is correct; the second is cheaper and should be rejected.

### 44. [nft] token_data exposes the full struct with no view-model

**Difficulty:** Easy
**Problem.** `token_data` returns the full contract `NftData` struct, which mixes on-chain fields with off-chain URI fields. There is no `token_uri` helper, so a wallet or marketplace looking for the conventional interface has nothing to call.
**Acceptance criteria.** `token_uri(token_id)` returning the metadata URI, with a clear panic for an unminted token, and tests for both the minted and unminted cases. `token_data` stays as it is unless there is a reason to change it.
**Notes.** This is about interoperability, not about hiding fields — the existing read API is a deliberate contract surface, not an accident.

### 45. [royalty] Basis-point validation is duplicated in the web SDK and the contract

**Difficulty:** Easy
**Problem.** Basis-point validation exists in two places that can drift: `validate_basis_points` on-chain (`contracts/royalty/src/lib.rs:447`) and the shared constant `maxBasisPoints` in `packages/shared/src/constants/limits.ts`, exercised by `apps/web/src/lib/__tests__/royalty-validation.test.ts`. Nothing asserts that the two agree.
**Acceptance criteria.** A test that fails if the contract's bound and the shared constant diverge, and a comment in each location naming the other as the authority.
**Notes.** Some duplication across the language boundary is unavoidable; the goal is that a change to one bound produces a failing test rather than a silent mismatch.

### 46. [contracts] No fuzz/property tests for counters and edge arithmetic

**Difficulty:** Medium
**Problem.** Counter arithmetic, supply bounds and basis-point math are covered by example-based tests but not by property tests, so boundary correctness depends on the author having thought of the boundary.
**Acceptance criteria.** Property-style or exhaustive boundary tests for:

- minting at the supply cap, at cap − 1 and at cap + 1;
- batch mint bounds against `MAX_BATCH_MINT`;
- rounding in `quote_royalty` summing exactly to the computed total for arbitrary prices and rates.
  **Notes.** The arithmetic is `checked_*` throughout, so the risk is logical rather than overflow.

### 132. [factory] Batch mint accepts only uniform terms

**Difficulty:** Medium
**Problem.** `mint_batch_with_royalty` mints a bounded batch atomically, but every token in the batch shares one recipient and one royalty rate. A drop with distinct recipients, or per-item royalty terms, still costs one transaction per item — which is the cost the batch path exists to remove.
**Acceptance criteria.** Either a documented statement that uniform batches are the intended scope, recorded in `contracts/README.md` with the reasoning, or a batch entry point that takes per-item terms, bounded and proven atomic by the same mid-batch-failure test the existing batch has.
**Notes.** The per-item variant needs a bounded argument shape: a `Vec` of recipient/rate pairs is unbounded by construction unless the same `MAX_BATCH_MINT` guard is applied to it, which is the first thing to get right.

### 135. [contracts] TTL policy constants are duplicated verbatim across all five contracts

**Problem.**
`TTL_LEDGERS = 6_312_000` and `TTL_THRESHOLD` are copy-pasted into all five contracts. A change to the expiry policy has to be made five times, and any missed copy silently produces divergent expiry behaviour between contracts holding the same logical records.
**Evidence.**
`grep -l 'TTL_LEDGERS: u32 = 6_312_000' contracts/*/src/lib.rs | wc -l` returns 5.
**Acceptance criteria.**

- [ ] The TTL policy is defined once and imported by all five contracts.
- [ ] A test or CI check fails if a contract re-declares its own copy.

### 136. [contracts] Schema-version logic is duplicated across all five contracts

**Problem.**
`STORAGE_VERSION` and `assert_version` are re-implemented in every contract. Version handling is the mechanism that prevents a post-upgrade contract from decoding old storage as garbage, so divergent copies are a correctness risk rather than just duplication.
**Evidence.**
`STORAGE_VERSION` occurs 4 times in each of the five `lib.rs` files; `assert_version` is redefined five times.
**Acceptance criteria.**

- [ ] A single shared implementation of the version check.
- [ ] Each contract still writes and reads its own version slot.
- [ ] Tests stamp a foreign version into storage and prove mutation is refused, for all five contracts.

### 137. [contracts] There is no shared crate for cross-contract helpers

**Problem.**
Five workspace members each re-implement `bump_ttl`, `assert_version` and `starts_with`. There is no place for shared contract logic to live, which is why the duplication above keeps recurring.
**Evidence.**
`contracts/Cargo.toml` members are `nft`, `collection`, `royalty`, `creator`, `factory` — no common/shared member.
**Acceptance criteria.**

- [ ] A `contracts/common` crate (or documented reason not to have one) holding the genuinely shared helpers.
- [ ] Wasm size impact measured and budgets adjusted in the same commit.
- [ ] A short ADR recording the decision.

### 140. [security] No independent security audit has been performed

**Problem.**
The five contracts hold mint authority, ownership records and royalty configuration, and none has been reviewed by anyone independent of the authors. This is a mainnet release blocker, not a nice-to-have.
**Evidence.**
`docs/mainnet-readiness.md` lists 'Independent security audit' as blocking requirement 1.
**Acceptance criteria.**

- [ ] An auditor with Soroban experience is engaged.
- [ ] The audit-prep pack (see the audit-prep issue) is handed over.
- [ ] Findings are triaged and remediated, and the report is published.

### 141. [security] Admin keys are single hot keys with no HSM or multisig custody

**Problem.**
Every privileged entry point is gated on one stored `Address`. Whoever holds that key can upgrade code, rewire the Factory and verify creators. There is no hardware or multisig custody, so a leaked key is total compromise.
**Evidence.**
All five contracts store a single `Admin: Address` and authorize with `require_auth()`. `docs/mainnet-readiness.md` requirement 2 requires HSM or hardware-wallet custody.
**Acceptance criteria.**

- [ ] A custody design that survives one key compromise (multisig or HSM-backed signer).
- [ ] Documented key generation, storage and signing procedure.
- [ ] Verified against a testnet deployment before mainnet.

### 143. [contracts] No contract can be paused in an emergency

**Problem.**
There is no way to halt minting, transfers or admin mutations if a defect is discovered post-deployment. The only remedy is an upgrade, which needs the admin key and a new wasm — unavailable if the defect is in the key path itself.
**Evidence.**
`grep -rn 'fn pause\|is_paused\|Paused' contracts/*/src/lib.rs` returns nothing.
**Acceptance criteria.**

- [ ] A pause mechanism with an explicit, documented scope of what it halts.
- [ ] Pausing is admin-only and emits an event.
- [ ] Tests prove paused paths are refused and unpause restores them.

### 144. [contracts] `upgrade` has no timelock or downgrade protection

**Problem.**
An admin can replace contract code instantly and irreversibly. Users get no notice and there is no window in which a hostile or accidental upgrade can be observed before it takes effect.
**Evidence.**
`upgrade` calls `update_current_contract_wasm` immediately after `require_auth()` in all five contracts.
**Acceptance criteria.**

- [ ] A documented and justified decision: timelock, or an explicit statement of why not.
- [ ] If timelocked, the delay is visible in the contract interface and announced by an event.

### 145. [contracts] `set_contracts` can be re-run after wiring with no timelock

**Problem.**
The Factory's wiring can be replaced at any time by the admin, which redirects every mint, burn and collection creation to new addresses. Since `set_contracts` also seizes the Royalty admin role, a single call can silently take over the whole platform.
**Evidence.**
`set_contracts` in `contracts/factory/src/lib.rs` validates the addresses but places no restriction on being called again after initial wiring.
**Acceptance criteria.**

- [ ] Re-wiring is either refused after initial setup or subject to a timelock plus an event.
- [ ] Documented in the deployment runbook.
- [ ] Covered by a test.

### 146. [contracts] factory wasm headroom is thin and the budget has already been raised once

**Problem.**
The Factory has little headroom before `check-wasm-size.sh` fails, and the budget has now been raised once (16000 → 17000) rather than reclaimed. Each raise erodes the regression signal, so the next feature that does not fit will repeat the choice. The underlying concern is not the number but the absence of a policy for when a raise is acceptable and a warning tier below the limit.
**Evidence.**
`bash scripts/check-wasm-size.sh` reports `bezamint_factory: 16085 bytes (94% of 17000 budget)` — 915 bytes of headroom — after the admin-rotation change justified going from 16000. The earlier evidence (15151 bytes of 16000) no longer holds.
**Acceptance criteria.**

- [ ] Either reclaim size, or raise the budget in a commit that justifies the new number, as recorded above.
- [ ] The budget retains enough headroom to catch a real regression (a few percent, not zero).
- [ ] The policy for raising a budget is written down, so the next raise is a decision rather than a default.

### 147. [contracts] royalty wasm is at 90% of its size budget

**Problem.**
Same problem as the Factory, one contract removed: 3,134 bytes of slack, and Royalty is the contract most likely to gain marketplace-related code.
**Evidence.**
`bash scripts/check-wasm-size.sh` reports `bezamint_royalty: 30866 bytes (90% of 34000 budget)`.
**Acceptance criteria.**

- [ ] Reclaim size or raise the budget with justification, as above.

### 148. [contracts] No assertion that Factory and its callees agree on their interfaces

**Problem.**
Argument order and types between the Factory's cross-contract invocations and each callee's signatures are positional and hand-written. Nothing checks they still match after a change to either side, so a mismatch surfaces only in simulation against a live deployment.
**Evidence.**
The ABI snapshot gate covers each contract's own spec but not the Factory's invocation argument lists in `mint_one`, `burn_nft` and `create_collection_for_creator`.
**Acceptance criteria.**

- [ ] A test that invokes the full Factory path against all four real contracts and fails on any argument-order divergence.
- [ ] Or a generated binding that makes such a mismatch impossible to express.

### 149. [contracts] No property or fuzz tests over the typed error paths

**Problem.**
The typed error refactor created 72 failure paths, each currently covered by one example-based test. Boundary arithmetic (basis points, share summation, rounding remainder) is the kind of code where examples pass and properties fail.
**Evidence.**
`grep -c '#\[test\]' contracts/*/src/test.rs` shows example-based tests only; no `proptest`/fuzz target exists in the workspace.
**Acceptance criteria.**

- [ ] Property tests asserting the invariants (payouts sum exactly to the royalty total; shares sum to `TOTAL_SHARE`) over generated inputs.
- [ ] Wired into CI with a bounded runtime.

### 150. [contracts] No policy for `soroban-sdk` upgrades

**Problem.**
The workspace pins `soroban-sdk 22.0.11` and pins `ed25519-dalek` to work around a resolver issue, but nothing records when or how the SDK may be upgraded, or what must be re-verified when it is. The pins are load-bearing and undocumented.
**Evidence.**
`contracts/Cargo.toml` carries a comment explaining the dalek pin, but there is no upgrade policy document.
**Acceptance criteria.**

- [ ] A documented upgrade procedure including re-running the ABI gate and the wasm size budgets.
- [ ] The rationale for the current pins recorded where an upgrade author will find it.

### 151. [contracts] Advancing the schema version emits no event

**Problem.**
`migrate` changes the stored schema version with no event, so a migration is invisible to monitoring. A migration is precisely the operation an operator most wants a timestamped record of.
**Evidence.**
`migrate` in all five contracts writes `STORAGE_VERSION` and emits nothing.
**Acceptance criteria.**

- [ ] `migrate` emits an event carrying the old and new version.
- [ ] Tests assert it.

### 152. [contracts] `starts_with` copies the URI into a 512-byte stack buffer on every call

**Problem.**
URI validation runs on every mint and profile write, and each check copies the whole string into a fixed 512-byte buffer before comparing. It is avoidable work on a hot path, and the fixed buffer couples the helper to `MAX_METADATA_URI_LEN` being the largest URI in the system.
**Evidence.**
`starts_with` in `nft`, `collection` and `creator` declares `[0u8; MAX_METADATA_URI_LEN as usize]` (or `MAX_URI_LEN`) and calls `copy_into_slice`.
**Acceptance criteria.**

- [ ] A bounded, allocation-free prefix comparison, or a measured justification that the copy is not material.
- [ ] Resource cost before and after, recorded.

### 185. [tests] No contract-side coverage measurement

**Problem.**
Coverage is measured for the web app only. There is no visibility into which contract functions and error paths the Rust suite exercises, so a new entry point can ship with tests that never call it.
**Evidence.**
No `cargo llvm-cov`/`tarpaulin` configuration or CI step exists for `contracts/`.
**Acceptance criteria.**

- [ ] Contract coverage is measured in CI and reported.
- [ ] A threshold prevents adding an untested entry point.

### 186. [tests] No assertion that every contract error variant is reachable

**Problem.**
72 error variants were introduced. Nothing checks that each is actually produced by some test, so a variant can be declared and never raised — a dead code path that looks like a covered one.
**Evidence.**
No test enumerates the error enums and asserts each variant is triggered.
**Acceptance criteria.**

- [ ] A test fails when an error variant is never raised by the suite.
- [ ] This mirrors the spirit of the supply-chain guard, which pins a claim with a test.

### 187. [tests] No fuzz target for contract entry points

**Problem.**
Mint, transfer, approval and royalty-quoting take user-controlled inputs (URIs, ids, basis points, share maps). Example-based tests cannot explore that input space, and Soroban has a defined fuzzing path via `cargo-fuzz` against the host.
**Evidence.**
No `fuzz/` directory or fuzz target exists in the workspace.
**Acceptance criteria.**

- [ ] Fuzz targets for at least the mint, transfer and royalty-quote paths.
- [ ] Run on a schedule with a bounded budget; any crash is a filed issue.

### 193. [documentation] No per-entrypoint resource and fee budget

**Problem.**
Soroban charges resource fees based on CPU instructions, ledger reads/writes and bandwidth per invocation. Nothing records what each entry point costs, so a regression in cost is invisible and there is no published figure for users or integrators.
**Evidence.**
No fee or resource benchmarking script or doc exists (`ls scripts/ | grep -iE 'fee|resource|cost|bench'` returns nothing). Note: Soroban has resource fees, not gas.
**Acceptance criteria.**

- [ ] CPU instruction count, memory and read/write footprint measured per entry point.
- [ ] Budgets recorded and enforced so a regression fails CI.
- [ ] Figures published in `docs/`.

### 194. [documentation] No contributor guide for the error-code numbering policy

**Problem.**
Error codes are a public interface and must not be renumbered, but that rule currently lives only in a doc comment. A contributor adding a variant has no guidance and could renumber an existing code, breaking integrators silently.
**Evidence.**
The policy is stated only in the `#[contracterror]` doc comments in each contract.
**Acceptance criteria.**

- [ ] `CONTRIBUTING.md` explains grouping, append-only numbering and the ABI snapshot step.
- [ ] A CI check flags a changed existing code.

### 199. [documentation] No support and deprecation policy for contract error codes

**Problem.**
Codes are append-only and public, but there is no stated policy for what happens if one must be corrected or retired. Integrators need to know whether a code they handle today will still mean the same thing after an upgrade.
**Evidence.**
No policy document; codes are declared public interface in the enum doc comments only.
**Acceptance criteria.**

- [ ] A written policy covering correction, retirement and version negotiation.
- [ ] Consistent with the ABI snapshot workflow, which already treats the spec as an interface.

### 200. [contracts] No marketplace contract — no listing, offer or sale primitive

**Problem.**
The platform can mint, transfer and quote royalties, but there is no way to sell anything. This is the largest missing feature and the reason royalties remain theoretical: `#25` records that royalties are quoted but never paid.
**Evidence.**
No listing, offer or sale entry point exists in any contract; no marketplace crate is in `contracts/Cargo.toml`.
**Acceptance criteria.**

- [ ] A design (ADR) for listings, offers and sale settlement.
- [ ] Listing and offer lifecycle implemented with tests.
- [ ] Settlement invokes the existing `quote_royalty` so payouts match the stored terms.

### 201. [contracts] No escrow primitive for trustless settlement

**Problem.**
Without escrow, either the buyer or the seller has to move first and trust the other. A bare NFT `transfer` carries no payment, so there is nothing for the contracts to hook — which the royalty contract's own docs acknowledge.
**Evidence.**
`quote_royalty` documents settlement as the caller's responsibility; no escrow state, funding or release path exists.
**Acceptance criteria.**

- [ ] Escrow state machine (fund, fulfil, release, refund, timeout) designed and implemented.
- [ ] Tests cover the happy path plus buyer and seller abandonment.
- [ ] Reentrancy and ordering considered explicitly.

### 202. [contracts] No Stellar payment or asset transfer in the mint or sale flow

**Problem.**
The platform is on Stellar, whose defining feature is fast, cheap asset movement, yet no flow moves value. Minting is free and selling is impossible, so the Stellar payment rail is unused.
**Evidence.**
No `token::Client` payment call, no asset representation, and no value transfer anywhere in the five contracts.
**Acceptance criteria.**

- [ ] A documented decision on which asset(s) are accepted and why.
- [ ] Payment integrated into at least the sale flow, using the Stellar token interface.
- [ ] Tests asserting exact amounts and recipient splits, reconciling with `quote_royalty`.

### 203. [contracts] No claimable-balance support for payouts

**Problem.**
Royalty recipients may not have a trustline or an account ready to receive a given asset. Without claimable balances, settlement fails for exactly the recipients least able to fix it, and the seller bears the risk.
**Evidence.**
No claimable-balance creation or claim path exists in the contracts.
**Acceptance criteria.**

- [ ] Payouts to a non-ready recipient are recorded as claimable rather than failing the sale.
- [ ] Tests cover claim by the rightful recipient and refusal for anyone else.

### 204. [contracts] No sponsored-reserve support for onboarding

**Problem.**
Every new creator needs a funded account with reserves before they can hold an asset. That friction falls hardest on the users the platform is trying to attract, and Stellar has a native sponsored-reserve mechanism that solves it.
**Evidence.**
No sponsorship or reserve-sponsoring logic exists in the contracts or the web app.
**Acceptance criteria.**

- [ ] A documented decision on whether the platform sponsors reserves.
- [ ] If so, the sponsor is accounted for and a cap prevents unbounded liability.

### 205. [contracts] No path-payment support for non-native pricing

**Problem.**
Pricing is implicitly single-asset. Stellar path payments would let a buyer pay in one asset while the seller receives another, which is a core reason the payment rail is worth using here.
**Evidence.**
No path-payment or asset-conversion logic exists.
**Acceptance criteria.**

- [ ] A documented decision on whether path payments are in scope.
- [ ] If in scope, slippage and destination-amount guarantees are handled and tested.

### 207. [tests] No settlement tests for marketplace payouts

**Problem.**
Once settlement exists, the invariant that matters is that the seller's proceeds plus the royalty payouts exactly equal the sale price, with no stroop created or lost. That is the property a payout bug would violate, and it needs its own tests.
**Evidence.**
No settlement code or tests exist yet; `quote_royalty` tests rounding for the quote alone.
**Acceptance criteria.**

- [ ] Tests assert conservation of value across buyer, seller and all royalty recipients.
- [ ] Rounding remainders are covered, including the multi-recipient case.

## Backend / API

### 86. [api] Contract addresses are loaded from env but not validated at boot

**Difficulty:** Easy
**Problem.** Contract addresses are read from environment variables and used directly. A malformed or truncated identifier produces empty or failing reads far from the cause — the same class of failure that cost time during the most recent deployment.
**Acceptance criteria.** Boot-time validation of every configured contract id against the StrKey format, failing fast with a message naming the offending variable; unit tests for the parser including a truncated id and a valid one.
**Notes.** This is a fail-fast check, not a runtime guard: the aim is that a misconfiguration is visible at startup rather than as an empty result later.

### 130. [api] Indexer state is in-memory — no durable store or cursor checkpoint

**Difficulty:** Hard
**Problem.** The event indexer keeps recent events and its cursor in process memory (`apps/web/src/lib/server/indexer.ts`). On a multi-instance deployment each instance has its own view, the state is lost on restart, and a cold start can only reach back as far as the RPC's event retention window — observed to be roughly 10,500 ledgers and materially less than the 17,000 the client initially assumed — so historical queries cannot be answered at all. `/api/health` reports `checks.indexer.stalled` so the condition is alertable, but alerting is not a fix.
**Acceptance criteria.** A persistent store fed by a poller that checkpoints its cursor, so a restart resumes instead of truncating history; a documented schema; backfill from a known ledger; the in-memory path retained as a read-through cache. Tests covering resume-after-restart and a cold start with no stored cursor.
**Notes.** The retention window is why this is not merely a scaling concern: without a durable cursor, a restart that lands outside the window loses history permanently, and the failure is silent rather than an error.

### 131. [api] Rate limiter state is per instance — the configured limit is not a real limit

**Difficulty:** Medium
**Problem.** The per-IP limiter in `apps/web/src/middleware.ts` keeps its counters in memory. On a horizontally scaled deployment the effective limit is the configured limit multiplied by the instance count, and every deploy resets it. `docs/api-reference.md` states this limitation rather than hiding it, but the limit is still not enforced as documented.
**Acceptance criteria.** A shared store behind the existing limiter interface, with the in-memory implementation retained for local development and tests; a documented and deliberate failure mode for when the store is unreachable — fail open or fail closed, chosen explicitly rather than by default. Tests for the shared-store path and for the chosen failure mode.
**Notes.** The failure-mode decision is the part worth thinking about: failing open removes the protection exactly when the system is degraded, and failing closed turns a cache outage into an outage of the API.

### 153. [backend] `middleware.ts` has 0% test coverage

**Problem.**
Middleware runs on every `/api` request and holds the rate limiter, the CORS allowlist and the security headers. None of it is unit-tested, and it is the one surface where a mistake affects every endpoint at once.
**Evidence.**
Coverage reports `src/middleware.ts 0% (lines 12-157)`.
**Acceptance criteria.**

- [ ] Tests covering the 429 path and its `Retry-After` header, the CORS allow/deny branches, the security headers, and the non-API pass-through.
- [ ] Per-path coverage threshold set so it cannot regress to 0.

### 154. [backend] `uploadGuard` re-implements the rate limiter, and its copy is unbounded

**Problem.**
`uploadGuard.ts` declares its own bucket `Map` and window logic instead of using the shared `RateLimiter`, and unlike `RateLimiter` it has no `maxEntries` or eviction. A flood of distinct IPs grows the map without limit. The module comments and the project's own 'what is already strong' list both claim the limiter is shared — it is not.
**Evidence.**
`grep -rn 'RateLimiter' apps/web/src` shows only `middleware.ts` importing it. `uploadGuard.ts` defines its own `const buckets = new Map<string, RateBucket>()` with no bound.
**Acceptance criteria.**

- [ ] Upload routes use `RateLimiter`.
- [ ] The duplicate implementation is deleted, and the docstrings corrected.
- [ ] A test asserts the bucket store is bounded under many distinct IPs.

### 155. [backend] Client IP is taken from the spoofable `x-forwarded-for` header first

**Problem.**
`clientIp()` prefers `x-forwarded-for`, which a client can set. On Vercel the edge overwrites it, so this is safe today, but the repo ships a Dockerfile and a self-hosting path where a spoofed header yields a fresh rate-limit bucket per request.
**Evidence.**
`clientIp` in `middleware.ts` and `uploadGuard.ts` reads `x-forwarded-for` before `cf-connecting-ip`/`x-real-ip`.
**Acceptance criteria.**

- [ ] The trusted-header order is configurable and documented per deployment target.
- [ ] Self-hosted deployments either configure a trusted proxy or fail closed.
- [ ] Tests cover the spoofed-header case.

### 156. [backend] `X-XSS-Protection` disagrees between middleware and `next.config.js`

**Problem.**
Two sources of security headers already contradict each other, and the obsolete value is the one served on HTML pages.
**Evidence.**
Verified against production: `/api/health` returns `x-xss-protection: 0` (from middleware) while `/` returns `x-xss-protection: 1; mode=block` (from `next.config.js`). `X-Frame-Options`, `X-Content-Type-Options` and HSTS are also defined in both places.
**Acceptance criteria.**

- [ ] One source of truth for security headers.
- [ ] A test asserts the headers for both an API route and a page route, so they cannot diverge again.

### 157. [backend] `http://localhost:3000` is an allowed CORS origin in production

**Problem.**
A development origin is hardcoded as always-allowed, outside the production guard that protects the `.vercel.app` branch.
**Evidence.**
`isAllowedOrigin()` in `apps/web/src/middleware.ts` returns `true` for `http://localhost:3000` unconditionally, before the `NODE_ENV !== 'production'` check.
**Acceptance criteria.**

- [ ] The localhost allowance is gated to non-production.
- [ ] Tests cover both environments.

### 158. [backend] `decodeEvent` swallows every decoding error with a bare catch

**Problem.**
A decode failure silently drops the event. The project's own review identifies 'silent failures' as the most dangerous defect class — findings 1 and 19-23 are all instances — and the fixed decoder still contains one.
**Evidence.**
`decodeEvent` in `apps/web/src/lib/server/indexer.ts` ends with `catch { return null; }` and no log, counter or metric. The primary path returns `null` for unrecognised variants without distinguishing 'not ours' from 'malformed'.
**Acceptance criteria.**

- [ ] Malformed payloads are logged (at least once per shape) and counted.
- [ ] The indexer health payload exposes a decode-failure counter.
- [ ] Tests distinguish the legitimate skip from the malformed case.

### 159. [backend] `startLedgerFor` is dead production code kept alive by its tests

**Problem.**
The function is annotated 'Exported for the tests' and has no production caller — the cold-start path uses `discoverColdStart` instead. Code that exists only for tests is a maintenance liability and misleads readers about which path actually runs.
**Evidence.**
`grep -rn 'startLedgerFor' apps/web/src` finds only its definition at `indexer.ts:384` and test references.
**Acceptance criteria.**

- [ ] Removed, or folded into `discoverColdStart` if it still expresses something meaningful.
- [ ] The tests that pinned it either go with it or assert the real path.

### 160. [backend] `INDEXER_LOOKBACK_LEDGERS` can only narrow the window

**Problem.**
The variable is documented as a configuration knob but is clamped with `Math.min(parsed, DEFAULT_LOOKBACK_LEDGERS)`, so it can never widen the search. The ceiling is a hardcoded 10,000 regardless of the RPC's actual event retention — the very assumption that the review's finding 20 warns against encoding.
**Evidence.**
`lookbackLedgers()` in `apps/web/src/lib/server/indexer.ts`: `return Math.min(parsed, DEFAULT_LOOKBACK_LEDGERS);`
**Acceptance criteria.**

- [ ] The knob can widen as well as narrow, bounded by a documented maximum.
- [ ] Or the clamp is removed and the name/doc changed to reflect one-directional behaviour.

### 162. [backend] `mergeEvents` only deduplicates against existing state

**Problem.**
The dedupe set is built from the incoming page, so duplicates _within_ a single page survive. The comment claims retries can re-deliver a page and that this is handled; it is handled only across pages, not inside one.
**Evidence.**
`mergeEvents` in `indexer.ts` builds `seen` from `incoming` and filters only `existing`.
**Acceptance criteria.**

- [ ] Deduplication covers both sources.
- [ ] A test feeds a page containing the same paging token twice.

### 163. [backend] Edge middleware starts a module-scope `setInterval`

**Problem.**
The middleware runs on the edge runtime but uses a Node idiom (`setInterval(...).unref?.()`) to prune rate-limit buckets. It works on Vercel, but it is a portability trap on any other runtime, and it silently assumes the module lives long enough for the interval to matter.
**Evidence.**
`middleware.ts` and `uploadGuard.ts` each call `setInterval(..., 60_000).unref?.()` at module scope.
**Acceptance criteria.**

- [ ] Pruning is either opportunistic (on write) or explicitly documented as runtime-dependent.
- [ ] A note records the behaviour observed on each supported runtime.

### 164. [backend] No circuit breaker or RPC failover around Soroban calls

**Problem.**
Every read path depends on one RPC endpoint. When it is slow or down, requests hang until the 8s timeout and every endpoint degrades together. There is no second endpoint, no failover and no breaker to shed load while it recovers.
**Evidence.**
`grep -rn 'circuit\|failover\|RPC_URLS' apps/web/src` returns nothing; `getRpcClient()` reads a single `NEXT_PUBLIC_STELLAR_RPC_URL`.
**Acceptance criteria.**

- [ ] A documented failover or breaker strategy.
- [ ] Health output distinguishes 'RPC down' from 'RPC slow'.
- [ ] Tested against a simulated failure.

### 165. [backend] No mapping from contract error codes to HTTP statuses

**Problem.**
Contract codes now carry precise meaning, but the API flattens all of them to a single `CONTRACT_ERROR`. A caller cannot distinguish 'not found' from 'not authorised' from 'already exists' without parsing text.
**Evidence.**
`ApiErrorCode` in `apps/web/src/lib/server/errors.ts` has one contract-related member.
**Acceptance criteria.**

- [ ] A documented mapping from contract codes to API codes and statuses.
- [ ] Applied in `normalizeError` and covered by tests.

### 166. [backend] Request IDs are not propagated to outbound RPC calls

**Problem.**
Routes generate a request ID and log it, but the ID stops at the process boundary. Correlating a user-visible failure with the RPC call that caused it currently means guessing from timestamps.
**Evidence.**
`newRequestId()`/`timeRequest()` in `logger.ts` are used in routes; the Soroban client and `fetchWithTimeout` receive no correlation ID.
**Acceptance criteria.**

- [ ] The request ID reaches outbound calls and their log lines.
- [ ] A documented way to join a client error report to server logs.

### 167. [backend] Cache TTLs are hardcoded per route with no invalidation hook

**Problem.**
`TtlCache` instances are constructed with literal TTLs in each route, and nothing can invalidate them. After a mint, clients can serve a stale list for the full TTL with no way to force a refresh.
**Evidence.**
`new TtlCache<...>(15_000)` in `nfts`, `collections`; `SHORT_CACHE_CONTROL` in `cache.ts`.
**Acceptance criteria.**

- [ ] TTLs are configurable and documented.
- [ ] Mutation paths can invalidate the affected cache entries.

### 168. [backend] Five API route groups have no unit tests

**Problem.**
Only some route groups are tested. The untested ones include the two largest read paths, so a change to pagination, filtering or error mapping there fails no test.
**Evidence.**
Coverage shows 0% for `api/collections`, `api/config`, `api/creators`, `api/nfts`, `api/search` and `api/wallet/transactions`; only `health` (96%) and `stats` (85%) have route tests.
**Acceptance criteria.**

- [ ] Each route group has tests for its success shape, its validation failures and its error mapping.
- [ ] Coverage for `src/app/api/**` meets the per-path threshold.

### 169. [backend] Upload routes do not emit rate-limit headers

**Problem.**
The middleware sets `X-RateLimit-*` on API responses, but the upload routes enforce a _separate_ limit and advertise nothing, so a client cannot tell how much budget it has left before being rejected.
**Evidence.**
`rateLimitUpload` in `uploadGuard.ts` returns `429` with only `Retry-After`; no `X-RateLimit-*` headers are set.
**Acceptance criteria.**

- [ ] Upload responses carry `X-RateLimit-Limit`, `-Remaining` and `-Reset`.
- [ ] Headers are present on both success and rejection, as the middleware already does.

### 170. [backend] No structured audit log for privileged mutations

**Problem.**
Verification, collection archiving and IPFS uploads are logged as ordinary requests, with no distinct audit channel. After an incident there is no reliable record of who did what to whom.
**Evidence.**
`logger.ts` emits `debug`/`info`/`warn`; there is no audit-specific level or sink, and privileged routes share the generic request log.
**Acceptance criteria.**

- [ ] Privileged operations emit a structured audit record with actor, target and outcome.
- [ ] Audit records are distinguishable from request logs and retained per a documented policy.

### 171. [backend] No retry or backoff policy for transient RPC failures

**Problem.**
A single transient RPC error fails the request. The read paths are idempotent, so retrying is safe, and the current behaviour converts a momentary blip into a user-visible failure.
**Evidence.**
`simulateRead` and the indexer call the RPC once with a timeout and no retry; failures propagate straight to the route's error handler.
**Acceptance criteria.**

- [ ] Bounded retry with backoff for idempotent reads.
- [ ] Retries are counted and visible in health output.
- [ ] Tests prove a retried success and a bounded failure.

### 172. [backend] No payload-size guard on non-upload mutation routes

**Problem.**
The IPFS routes cap body size, but the other mutation-capable routes rely on the framework default. The guard exists in one place and not the others, which is the pattern that produced earlier inconsistencies.
**Evidence.**
`MAX_METADATA_SIZE` is enforced in `api/ipfs/upload/route.ts`; no equivalent check exists elsewhere.
**Acceptance criteria.**

- [ ] A shared body-size guard applied consistently.
- [ ] Tests assert the boundary is refused with a 413.

### 206. [backend] No SEP-24/31 anchor integration for fiat on and off ramps

**Problem.**
Users cannot get value in or out of the platform in fiat. Anchors are the standard Stellar mechanism for this (SEP-24 interactive deposits/withdrawals, SEP-31 cross-border payments, SEP-1/10/12 for discovery and auth).
**Evidence.**
No SEP implementation exists in `apps/web/src`.
**Acceptance criteria.**

- [ ] A documented decision on which SEPs are in scope and which anchor is targeted.
- [ ] At least one deposit and one withdrawal flow implemented against a testnet anchor.
- [ ] Auth and transaction-status end points covered by tests.

## Frontend

### 55. [web] Transaction status is a generic component — no success deep-links

**Difficulty:** Medium
**Problem.** `TransactionStatus` reports a state but offers no link to the asset a transaction produced, so after a successful mint the user has to go and find it.
**Acceptance criteria.** On success, the component renders an explorer link for the transaction hash and a link to the affected collection or token page where one exists, both built through `apps/web/src/lib/explorer.ts` rather than literal URLs. A component test covers the success branch.
**Notes.** Ledger and network come from the same configuration the rest of the app uses, so a testnet deployment links to testnet.

### 59. [web] Attributes are not validated before submit

**Difficulty:** Easy
**Problem.** The attribute editor accepts empty trait names, empty values and duplicate trait names. Shared limits exist in `packages/shared/src/constants/limits.ts` but are not applied to the form before submit.
**Acceptance criteria.** Inline validation for a non-empty name and value, a maximum attribute count sourced from the shared limits rather than a literal, and duplicate-name rejection. Tests covering each rule.
**Notes.** Validation should also be mirrored server-side where the metadata is assembled, so a direct API caller is not validated differently from the form.

### 60. [web] Explore page "Verified Creators" card is non-functional

**Difficulty:** Easy
**Problem.** The featured cards on the explore page are styled entry points. They link onward but present no data, so a visitor cannot tell whether they lead anywhere meaningful.
**Acceptance criteria.** Each featured card either renders a real figure from an existing endpoint (for example recent mints or collections per the stats route) and links to the corresponding real page, or is removed. No card should imply a capability the app does not have.
**Notes.** This is the same class of problem as the placeholder content that was previously served on this page; the standard to hold it to is that every number on screen traces to an endpoint.

### 64. [web] Form inputs lack visible focus rings (WCAG 2.4.7)

**Difficulty:** Easy
**Problem.** Several custom inputs and the royalty slider suppress the default outline without providing a replacement focus indicator, so keyboard focus can be invisible. This is WCAG 2.4.7 (Focus Visible).
**Acceptance criteria.** A consistent `focus-visible` ring on inputs, buttons and the slider, defined once as a shared utility or token rather than per component. Verified with an automated accessibility check or an explicit keyboard pass.
**Notes.** The theme system is CSS-variable based, so the ring should be a token that works in both themes rather than a hardcoded colour.

### 66. [web] Toast system has no action buttons

**Difficulty:** Easy
**Problem.** `ToastContext` delivers a message and nothing else, so a success toast cannot offer the obvious next action — opening the transaction in an explorer.
**Acceptance criteria.** An optional action on the toast API (label plus handler or href), rendered accessibly, dismissible by keyboard, and used for transaction success. Tests for the action being invoked and for keyboard dismissal.
**Notes.** Any URL passed in should come from `apps/web/src/lib/explorer.ts` so network selection stays in one place.

### 67. [web] No pagination/infinite scroll for collections grid

**Difficulty:** Medium
**Problem.** The collections grid renders every item in one pass, so a wallet with many collections produces a large DOM and a slow first paint.
**Acceptance criteria.** Pagination or virtualization with a page size taken from the shared limits rather than a literal, and a documented choice between the two approaches. A test that the initial render is bounded regardless of input size.
**Notes.** The API already supports paginated collection queries, so server-side paging is available if the client prefers not to load everything first.

### 74. [web] Mint form doesn't estimate/report network fees

**Difficulty:** Medium
**Problem.** The mint form submits without telling the user what a transaction will cost or whether the wallet can cover it, so an avoidable failure surfaces only after signing.
**Acceptance criteria.** An estimated fee for the prepared transaction, shown alongside the balance already available from `checkBalance`, with a warning when the balance cannot cover the fee plus any required reserve. A test for the insufficient-balance branch.
**Notes.** Estimation should not block submission on its own failure — a missing estimate is a missing hint, not a reason to prevent a mint.

## Tests

### 93. [tests] No Playwright E2E tests

**Difficulty:** Hard
**Problem.** The critical path — connect, mint, confirm, view — is covered only by unit and component tests that stub every boundary. A break in signing, submission or confirmation handling would not be caught before a user hit it. `scripts/smoke-test.sh` covers the read path over HTTP but not the browser flow.
**Acceptance criteria.** A browser-driven suite asserting that a minted token later appears with the metadata it was minted with, split into two runs:

- a wallet-less smoke of landing to explore to an asset page, runnable in CI on every push;
- the mint flow, which needs a funded account and a live network, run before a release rather than on every push.
  Both documented in `docs/deployment-runbook.md`.
  **Notes.** Keeping the two runs separate is the point: a suite that needs a funded key cannot be a required check, and a required check that stubs the network does not test this.

### 100. [tests] No snapshot tests for shared validation limits

**Difficulty:** Easy
**Problem.** The shared limit constants are asserted piecemeal, so a single edit to `packages/shared/src/constants/limits.ts` can break several hidden expectations at once, and nothing states which consumers depend on which value.
**Acceptance criteria.** A table or snapshot test that pins every exported limit and names its consumers, so a change to a bound shows up as a visible diff rather than as a silent behaviour change.
**Notes.** The value is in the consumer list as much as the numbers — it is the thing that is missing today.

### 173. [tests] Overall line coverage is 34.21% and 56 of 114 files sit at 0%

**Problem.**
Roughly two-thirds of the instrumented source is unexercised. The aggregate number hides the shape of the gap: coverage is concentrated in `lib/`, while whole surfaces are untouched.
**Evidence.**
`coverage-summary.json` after `pnpm --filter @bezamint/web run test:coverage`: lines 908/2654 = 34.21%, statements 33.65%, functions 31.69%, branches 28.28%. 56 of 114 files have 0% line coverage, holding 1,234 of the 2,654 executable lines.
**Acceptance criteria.**

- [ ] Overall line coverage reaches 80%.
- [ ] Thresholds are raised alongside, so the gain cannot silently regress.
- [ ] The remaining uncovered lines are enumerated, not just counted.

### 174. [tests] The App Router pages have 0% coverage

**Problem.**
Every user-facing page — explore, dashboard, mint, profile, settings, verify, collections, collection detail, NFT detail, creator detail — is untested. These are the surfaces a user actually touches, and a regression there is invisible to CI.
**Evidence.**
Coverage reports 0% for every `src/app/**/page.tsx`, including `(app)/collections/page.tsx` (lines 28-236) and `(app)/dashboard/page.tsx` (lines 31-225).
**Acceptance criteria.**

- [ ] Each page has a render test covering its loading, empty, populated and error states.
- [ ] Data fetching is mocked at the service boundary, matching the existing route-test style.

### 175. [tests] `src/services` sits at 33.82% coverage

**Problem.**
Every wallet interaction passes through `src/services`, yet two-thirds of it is unexercised. These modules hold the transaction building and signing path, where a defect means a user loses funds or signs the wrong transaction.
**Evidence.**
Coverage: `src/services` 33.82% lines, 31.2% branches. The review previously raised this from 14% and recorded it as still incomplete.
**Acceptance criteria.**

- [ ] The transaction-building paths are covered, including failure and rejection branches.
- [ ] Coverage for `src/services` meets a per-path threshold.

### 176. [tests] The coverage gate is an aggregate ratchet that untested files slip past

**Problem.**
The thresholds apply to the whole project. Adding a large untested module lowers the aggregate, which pushes contributors to add more `lib/` tests rather than to test the new code — so the gate is satisfied without the code that runs being covered.
**Evidence.**
`vitest.config.ts` declares a single `thresholds` block (lines 33, statements 32, functions 30, branches 27); the measured values are 34.21/33.65/31.69/28.28, i.e. under two points of headroom.
**Acceptance criteria.**

- [ ] Thresholds are enforced per path for at least `src/app/**`, `src/lib/server/**` and `middleware.ts`.
- [ ] Adding an untested file fails CI.

### 177. [tests] No per-path coverage thresholds for the app surface

**Problem.**
Because the threshold is global, `src/app/**` and `middleware.ts` can stay at 0% indefinitely while the aggregate passes. Nothing in CI expresses that these paths must be tested.
**Evidence.**
`vitest.config.ts` has one threshold object and no `perFile` or per-glob configuration.
**Acceptance criteria.**

- [ ] Per-path floors exist for the surfaces above.
- [ ] Documented in `docs/` so contributors know the requirement before writing a PR.

### 178. [tests] Branch coverage is 28.28% against an 80% target

**Problem.**
Branch coverage is the number that matters for the error-handling and fallback logic this codebase leans on, and it is the furthest from target. Line coverage can improve substantially while branch coverage barely moves.
**Evidence.**
Coverage: branches 603/2132 = 28.28%. Reaching 80% requires roughly 1,100 additional covered branches.
**Acceptance criteria.**

- [ ] A recorded decision on whether the target is lines only or lines and branches.
- [ ] If branches are included, a branch threshold that ratchets with the work.

### 184. [ci] The Python tooling scripts are not exercised in CI

**Problem.**
`check-contract-abi.py` is a gate, but the gate has no tests of its own. If it silently stops comparing (a parsing change, a missing wasm, an empty spec section) it would report success, which is the worst failure mode for a gate.
**Evidence.**
`scripts/check-contract-abi.py` is run by CI but there is no test suite for `scripts/`.
**Acceptance criteria.**

- [ ] Tests cover the pass, drift and missing-input cases.
- [ ] A deliberately mutated snapshot fails the gate in a test.

### 188. [tests] No mutation testing on the server layer

**Problem.**
Passing tests are not evidence that the tests assert anything. Mutation testing would show which assertions are load-bearing, and it is the only technique that detects tests which merely execute code without checking it.
**Evidence.**
No mutation-testing configuration or CI step exists.
**Acceptance criteria.**

- [ ] A mutation run over `src/lib/server/**` with a documented score.
- [ ] Survivors triaged into either better assertions or a recorded decision.

## CI

### 105. [ci] check-lockfile.sh and prebuild-check.sh aren't run in CI

**Difficulty:** Easy
**Problem.** `scripts/prebuild-check.sh` validates prebuild state but CI never runs it. The companion `check-lockfile.sh` this issue originally named no longer exists in the repository.
**Acceptance criteria.** `prebuild-check.sh` runs in CI and exits non-zero on failure, or is deleted with the reason recorded. A demonstration of the failure path, either as a test or an observed failing CI run.
**Notes.** A script that nothing runs is worse than no script: it implies a guarantee that is not being enforced.

### 107. [ci] CI doesn't verify pnpm --filter @bezamint/shared lint separately

**Difficulty:** Easy
**Problem.** `packages/shared` has its own `lint` script (`tsc --noEmit`) that can break while the web job still passes, because CI does not check the shared package on its own.
**Acceptance criteria.** A CI step running the shared package's lint, so a type error there fails the build independently of the web app.
**Notes.** The shared package is consumed by the web app, so a type error there is a real build risk even when the web job happens to typecheck.

### 110. [ci] No CI matrix for Node versions

**Difficulty:** Easy
**Problem.** CI runs a single Node version and `engines` declares `>=24.0.0`, so neither the code nor the documented support policy states which LTS lines are actually intended. An implied range with a single tested version is the mismatch to remove.
**Acceptance criteria.** A documented decision: either widen `engines` to cover the intended LTS range and test that range in a CI matrix, or keep the single supported version and say so explicitly in the README and in `engines`.
**Notes.** `engines` is enforced by the package manager, so it is a promise to contributors, not just metadata.

### 179. [ci] No scheduled job runs the production smoke test

**Problem.**
`scripts/smoke-test.sh` is the only check that exercises the app against a live chain, and it only runs when a human remembers. A deployment can break and stay broken with every CI check green — which is exactly the failure class the script was written to catch.
**Evidence.**
CI runs it nowhere; `docs/deployment-runbook.md` documents it as a manual step.
**Acceptance criteria.**

- [ ] A scheduled workflow runs the smoke test against production and alerts on failure.
- [ ] It is not a required PR check, to keep it from being flaky on unrelated changes.

### 180. [ci] No check on remaining wasm budget headroom

**Problem.**
The size check only fails once a contract exceeds its budget. It does not warn as the margin shrinks, so the moment the budget is breached is the first signal — and the usual fix is to raise the budget, discarding the regression detector.
**Evidence.**
factory is at 94% and royalty at 90% of budget; `check-wasm-size.sh` has no warning tier and no headroom floor.
**Acceptance criteria.**

- [ ] A warning tier (for example above 90%) that surfaces in CI summary.
- [ ] Documented expectation that a budget raise needs justification.

### 181. [ci] No dependency licence audit

**Problem.**
Security advisories are checked by `security.yml`, but nothing verifies that dependency licences are acceptable for an MIT-licensed project. A copyleft dependency entering the tree through a transitive update would go unnoticed.
**Evidence.**
`security.yml` runs an audit only; no `cargo-deny` or licence allowlist exists for the Rust or JS trees.
**Acceptance criteria.**

- [ ] A licence allowlist enforced in CI for both ecosystems.
- [ ] The accepted licences are documented.

### 182. [ci] Nothing verifies that the README badges reflect reality

**Problem.**
Several badges make hard claims — test counts, contract counts, testnet status. They are hand-maintained, so they drift, and a stale badge is precisely the 'claim that no longer matches what is deployed' problem the review already recorded as a finding.
**Evidence.**
`README.md` carries a static `tests-574_passing` badge and a `5_live_on_testnet` badge; no CI check compares them to measured values.
**Acceptance criteria.**

- [ ] Counts that can be derived are generated, not typed.
- [ ] A CI check fails when a derived badge drifts.

### 183. [ci] No coverage trend tracking between commits

**Problem.**
The coverage report is uploaded as an artifact but nothing compares it to the previous run. A slow decline therefore passes as long as it stays above the floor, and the floor itself only moves when someone remembers to raise it.
**Evidence.**
`ci.yml` uploads `apps/web/coverage` as an artifact; no baseline comparison or trend record exists.
**Acceptance criteria.**

- [ ] Per-commit coverage is recorded and the delta is visible on a PR.
- [ ] A sustained decline is surfaced rather than only a threshold breach.

### 208. [ci] contract:size and contract:abi verify stale wasm instead of rebuilding

**Problem.**
Both npm scripts measure whatever wasm is already in `contracts/target/wasm32-unknown-unknown/release/`; neither rebuilds, and neither checks that the artifacts are newer than the sources they came from. Edit a contract, run either script, and you get a confident verdict about code that is no longer being built. CI is safe only because `ci.yml` builds the wasm first (line 136) before running the checks (lines 139 and 141); the scripts themselves carry no such ordering.
**Evidence.**
After editing all five contracts, `pnpm run contract:size` reported `bezamint_factory: 15151 bytes (94% of 16000 budget)` and `pnpm run contract:abi` reported `Contract ABI unchanged for 5 contracts` — both against wasm built before the edits. A rebuild showed the real state: the Factory over budget (16085 bytes) and all five interfaces changed.
**Acceptance criteria.**

- [ ] `contract:size` and `contract:abi` rebuild first (`pnpm run contract:build && …`), or fail with "artifacts are older than sources" rather than reporting on stale ones.
- [ ] The failure path is demonstrated — a test or CI step that shows the stale case failing instead of passing.

## Documentation

### 142. [security] No documented recovery procedure for a lost admin key

**Problem.**
If the admin key is lost, there is no written procedure — and as the admin-rotation issue shows, for four contracts there is currently no mechanism either. An undocumented recovery path is discovered during an incident, which is the worst time.
**Evidence.**
`docs/mainnet-readiness.md` requirement 2 requires a documented recovery procedure; no such document exists under `docs/`.
**Acceptance criteria.**

- [ ] A written, step-by-step recovery procedure.
- [ ] Rehearsed at least once, with the rehearsal recorded.
- [ ] Cross-linked from the incident-response runbook.

### 161. [backend] `.env.example` documents a lookback and clamp that contradict the code

**Problem.**
The example env file states the RPC retains ~17,280 ledgers and that values are clamped to 17,000, and sets `INDEXER_LOOKBACK_LEDGERS=17000`. The code clamps to 10,000, and 17,000 is exactly the value the review established as the cause of a permanently empty event feed. Following the documentation reintroduces the bug it documents.
**Evidence.**
`.env.example` lines 59-63 versus `DEFAULT_LOOKBACK_LEDGERS = 10_000` at `indexer.ts:93`.
**Acceptance criteria.**

- [ ] The example value and the comment match the code.
- [ ] The comment states the measured event-retention figure rather than the `getHealth` ledger-retention figure.

### 189. [documentation] No threat model

**Problem.**
There is no document describing the assets, the trust boundaries, or which attacker is assumed capable of what. Without it, security decisions cannot be evaluated against a stated model and audits lack scope.
**Evidence.**
No `docs/threat-model.md`; `ls docs/ | grep -iE 'threat|security'` returns nothing.
**Acceptance criteria.**

- [ ] Assets, actors, trust boundaries and out-of-scope assumptions written down.
- [ ] Each mitigated threat points at the code or test that mitigates it.

### 190. [documentation] No audit-prep package for an external auditor

**Problem.**
An independent audit is a stated mainnet blocker, but there is nothing to hand an auditor: no scope statement, no invariants list, no interface summary, no known-issues disclosure. Assembling that during engagement wastes the time you are paying for.
**Evidence.**
No audit-prep material exists under `docs/`.
**Acceptance criteria.**

- [ ] A package containing scope, invariants, interface reference, build and test instructions, and an honest known-issues list.
- [ ] Explicitly labelled as author-produced and NOT a substitute for independent review.

### 191. [documentation] No incident-response runbook

**Problem.**
There is no written procedure for what to do when something goes wrong in production: who declares an incident, how the contracts are paused (they cannot be), how the indexer is drained, how users are told.
**Evidence.**
`docs/mainnet-readiness.md` requirement 7 is 'Incident response'; no such document exists.
**Acceptance criteria.**

- [ ] Severity definitions, escalation path and communication templates.
- [ ] Concrete first actions per failure mode, referencing real commands.
- [ ] Rehearsed at least once, with the rehearsal recorded.

### 192. [documentation] No monitoring and alerting specification

**Problem.**
The health endpoint exposes signals designed to be alerted on — the indexer's `stalled` flag and `lastErrorMessage` — but nothing documents which signals are wired to which alerts or at what thresholds. A signal nobody monitors is a comment.
**Evidence.**
`docs/mainnet-readiness.md` requirement 6 is 'Monitoring and alerting'; the API exposes `indexer.stalled` with no documented consumer.
**Acceptance criteria.**

- [ ] A table of signal, threshold, alert destination and expected response.
- [ ] Verified by firing each condition once against a non-production deployment.

### 195. [documentation] No ops triage table mapping error codes to actions

**Problem.**
An operator seeing a contract error in logs has no mapping from code to meaning to action. The codes were introduced to make errors machine-readable; without a triage table the human side is still guesswork.
**Evidence.**
No document maps error codes to operator responses.
**Acceptance criteria.**

- [ ] A table of code, meaning, likely cause, and the operator action.
- [ ] Cross-linked from the incident-response runbook.

### 196. [documentation] No documented on-call or ownership model

**Problem.**
Several documents presuppose that someone is responsible for responding — monitoring, incident response, key custody — but nothing states who that is or how they are reached.
**Evidence.**
No ownership/on-call document exists.
**Acceptance criteria.**

- [ ] Named roles for contracts, API, indexer and deployment.
- [ ] Escalation path and response expectations recorded.

### 197. [documentation] No architecture decision records despite open design decisions

**Problem.**
Several open issues are explicitly labelled `design-decision-needed` (admin rotation model, pause scope, shared crate, upgrade timelock, SDK policy, custody model). Those decisions will be made and then forgotten; the reasoning is the part that gets lost.
**Evidence.**
No ADR directory exists; multiple issues carry the `design-decision-needed` label.
**Acceptance criteria.**

- [ ] An ADR directory with a template and the numbering/status convention.
- [ ] The currently-pending decisions each get an ADR when resolved.

### 198. [documentation] No accessibility statement

**Problem.**
The project has accessibility work in flight (`#64`, focus rings) but makes no statement of target conformance or known gaps. For a public-facing product that is a gap in both the documentation and the product claim.
**Evidence.**
No accessibility statement under `docs/`; `README.md` makes no conformance claim.
**Acceptance criteria.**

- [ ] Target standard stated (for example WCAG 2.2 AA) with known exceptions listed.
- [ ] An audit method described so the claim is checkable.

## Labels

| Label                                  | Meaning                                           |
| -------------------------------------- | ------------------------------------------------- |
| `good first issue`                     | Scoped, no prior context needed                   |
| `difficulty: easy` / `medium` / `hard` | Rough effort                                      |
| `design-decision-needed`               | Blocked on a decision that must be recorded first |
| `security`                             | Affects assets or authority                       |
| `help wanted`                          | Ready for an outside contributor                  |
