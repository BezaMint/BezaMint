# BezaMint — Contract Review (Round 2)

Scope: the five Soroban contracts in `contracts/` — `nft`, `collection`,
`royalty`, `creator`, `factory` — reviewed against the deployed testnet set,
the tracker in [`ISSUES.md`](../ISSUES.md), and the first review round in
[`critical-review.md`](critical-review.md).

Method: every source file read end to end; the full suite, `clippy -D warnings`,
`fmt --check` and the wasm size gate run against the tree; resource costs
measured with the host's own budget API rather than estimated; each finding
below reproduced or refuted against the code before it was written here.
Findings that did not survive that check are recorded under
[Repudiated](#repudiated) rather than dropped, because a review that only
reports what it found is not evidence of a method.

## Verdict

The contracts are materially stronger than the tracker's 96 open entries imply.
Constructor-based initialization, typed errors, delegated cross-contract
authorization, an explicit TTL policy, bounded pagination, schema-version
gating and admin rotation are all present, tested, and in several cases
documented with the defect that motivated them. The arithmetic that carries
money (`quote_royalty`) is checked and its rounding is exact.

What remains is a small number of real defects, one of which is structural:

1. **Collection membership is stored in one ledger entry that cannot reach its
   own advertised cap**, and both membership writes scale linearly with
   collection size. This is the one defect here that makes a shipped feature
   unusable rather than merely expensive.
2. **Creator attribution disagrees with itself**, so the same token can be
   reported as having two different creators.
3. **Nothing is measured**: there are no per-entry-point resource figures, so
   "low fees" is currently an assertion. Soroban charges by resource, not gas;
   without numbers there is no way to know what a mint costs or whether a
   change made it worse.
4. **No flow moves value.** On Stellar, whose defining capability is cheap
   asset movement, that is the largest gap in the system, and it is why
   royalties remain a quote rather than a payment.

## Findings

Codes are local to this document (`C1`…); tracker issue numbers are given where
an entry already exists, and the two are intended to be kept in step.

### C1. Collection membership cannot reach its own cap, and walks the whole set on every change

**Severity:** high. **Tracker:** #22 (partial — the entry names the O(n) removal
but not the cap arithmetic).

`NftsInCollection(id)` is a single `Vec<u64>` holding every token id in the
collection (`contracts/collection/src/lib.rs`, `NftKey::NftsInCollection`).
`MAX_NFTS_PER_COLLECTION` is 10,000. Stellar's maximum contract-data entry size
is 65,536 B ([storage strategies][storage-docs]). A `Vec<u64>` of 10,000
elements encodes as a 4-byte length plus 8 bytes per element — 80,004 bytes,
which is 1.22× the hard limit.

So the advertised cap is unreachable: 8,191 ids encode to 65,532 bytes and fit,
8,192 encode to 65,540 and do not, so the write that would add the 8,192nd
token exceeds the limit and the whole invocation fails. The cap is a documented
number that the contract cannot honour. `docs/faq.md` repeats it to users.

The same entry makes both membership writes linear:

- `add_nft` reads the vector, pushes, and writes the **whole** vector back. The
  8,000th add rewrites ~64 KB — roughly 8,000× the first one.
- `remove_nft` reads the vector, rebuilds it element by element (skipping the
  removed id), and writes it back. It is O(n) in both directions.

`remove_nft` is on the `Factory::burn_nft` path, so a burn in a large collection
is the most expensive operation the platform has, and it is the operation a
disgruntled or unlucky user has least ability to avoid.

**Remediation:** replace the dense vector with a per-index entry map —
`NftInCollection(collection_id, index) -> token_id` plus
`NftIndex(collection_id, token_id) -> index` and a count — which is exactly the
pattern the NFT contract already uses for `tokens_of_owner`. Each write then
touches a fixed number of small entries regardless of collection size, and
removal is O(1) swap-removal. The observable cost is that
`get_nfts_in_collection` no longer returns creation order once a removal has
happened; the ordering guarantee is narrowed to "creation order until the first
removal" and documented at the entry point.

### C2. `token_data.creator` is the recipient, so attribution contradicts itself

**Severity:** medium (latent today, active as soon as value moves).

`contracts/nft/src/lib.rs` sets `creator: to.clone()` — the field documented as
"Account that minted the NFT" holds the address that _received_ it. Three other
places record the other value for the same mint:

| Source                                                           | Records           |
| ---------------------------------------------------------------- | ----------------- |
| `nft.mint` → `NftData.creator`                                   | `to` (recipient)  |
| `factory.mint_one` → `NftEvent::Minted(token_id, caller)`        | `caller` (minter) |
| `royalty.configure_royalty(caller, …)` → `RoyaltyConfig.creator` | `caller` (minter) |

This is user-visible rather than theoretical. `GET /api/nfts` reads
`data.creator` from `token_data` and falls back to `event.actor` from the
`Minted` event when that read fails
(`apps/web/src/app/api/nfts/route.ts`), so the same token is reported with two
different creators depending on which path answered, and the token page renders
whichever it got under the label **Creator**.

It does not bite today only because the mint form passes the connected wallet as
both `caller` and `to`. `mintWithRoyalty(sourceAddress, toAddress, …)` already
takes them separately, so the first paid mint or gift turns a latent
inconsistency into wrong attribution on a sold work — which is the one field a
collector will check.

**Remediation:** `mint` takes an explicit `creator` and records it, with
`creator.require_auth()` so attribution cannot be claimed on someone else's
behalf. In the Factory flow the creator is the caller, who already signs the
top-level invocation, so no flow gains a signature; a direct caller of
`nft.mint` can no longer attribute a token to an address that did not consent.

### C3. No per-entry-point resource figures, so the fee claim is unmeasured

**Severity:** medium. **Tracker:** #193.

Nothing in the repository records what an entry point costs.
`ls scripts/ | grep -iE 'fee|resource|cost|bench'` returns nothing and no test
consults `env.cost_estimate()`. Soroban charges by resource — CPU instructions,
memory, ledger reads and writes, plus rent on entry size — so without figures:

- a regression in cost is invisible until users pay it;
- "ultra-low fees" cannot be substantiated or compared;
- the linear costs in C1 are invisible, since they are a property of the _data_,
  not of the code, and only show up as a function of collection size.

**Remediation:** measure every entry point with the host budget API, publish
the table in `docs/resource-costs.md`, assert budgets in tests so a regression
fails the suite, and record the data-dependent cases (mint into a large
collection, batch size, page size) rather than only the empty-state case.

### C4. No flow moves value, so royalties cannot be paid

**Severity:** medium (largest missing feature). **Tracker:** #25, #202.

There is no `token::Client` call, no accepted-asset representation and no value
transfer anywhere in the five contracts. `quote_royalty` computes exact
per-recipient amounts and then hands the obligation to a caller that does not
exist, which the Royalty contract's own comment acknowledges
("settlement therefore stays a marketplace responsibility").

The consequence is not just a missing feature: royalty terms are the platform's
promise to creators, and a promise with no settlement path is enforced by
nothing. It is also the gap that makes the Stellar rail — the reason to build on
Stellar rather than anywhere else — unused.

**Remediation:** see [Settlement](#settlement) below. This is the one finding
here that adds a contract rather than correcting one.

### C5. `starts_with` copies the whole URI into a stack buffer on every check

**Severity:** low. **Tracker:** #152.

The helper is re-implemented in `nft`, `collection` and `creator`; each copy
declares `[0u8; MAX_*_LEN]` (512 bytes), zeroes it, and copies the entire string
into it to compare a prefix of at most 8 bytes. It runs on every mint and every
profile write, once per URI field, and `validate_social_links` calls it twice
per link (up to 16 times in one call).

**Remediation:** compare only the bytes that can matter, without allocating:
iterate the prefix length and compare against the string's own bytes. Recorded
before/after in `docs/resource-costs.md`.

### C6. Factory constructs its cross-contract symbols at runtime, on the hot path

**Severity:** low (but it is the batch path's inner loop).

`mint_one` calls `Symbol::new(env, "mint")` and `Symbol::new(env, "add_nft")`,
and `burn_nft`/`create_collection_for_creator` do the same. `Symbol::new`
builds a symbol at run time; `symbol_short!` produces it at compile time and is
available for any name of at most 9 characters — which covers `mint`,
`add_nft`, `burn`, `register` and `set_admin`.

It is in the loop for `mint_batch_with_royalty`: three symbols per token, up to
25 tokens, so up to 75 run-time symbol constructions per invocation for
constants known at compile time. Names that genuinely need `Symbol::new`
(`configure_royalty`, `remove_nft`, `create_collection`, `is_registered`) keep
it.

### C7. `migrate` is invisible to monitoring

**Severity:** low. **Tracker:** #151.

`migrate` advances the stored schema version and emits nothing, in all five
contracts. A migration is precisely the operation an operator wants a
timestamped on-chain record of, and it is the operation that most needs one:
it is the step that unblocks a contract whose stored layout no longer matches.

### C8. `add_nft` accepts token ids that do not exist

**Severity:** low (self-inflicted).

`add_nft` checks that the collection exists, is not archived, is not full and
that the token is not already in a collection. It does not check that the token
has been minted, and the Collection contract holds no pointer to the NFT
contract, so it cannot. A direct caller who owns a collection can attach
arbitrary ids, which then appear in `get_nfts_in_collection` and count toward
`nft_count`. Through the Factory the id always comes from a mint, so the
platform's own flow is unaffected.

**Remediation:** documenting the boundary is the honest fix here; enforcing it
would require a cross-contract pointer whose cost lands on every membership
write. Recorded as a known limitation at the entry point.

### C9. Auto-registration pins a placeholder display name

**Severity:** low.

`create_collection_for_creator` registers a creator with the display name
`"Creator"` when they are not already registered
(`contracts/factory/src/lib.rs`). `register` refuses an address that already has
a profile (`AlreadyRegistered`), so a creator whose first action was creating a
collection cannot use `register` to set their real name — only `update_profile`.
The web app ships both services, so the failure mode is a signed transaction
that reverts with `AlreadyRegistered` for exactly the users who did the most.

## What is already strong

Recorded because a review that lists only defects cannot distinguish a healthy
codebase from a neglected one.

- **Initialization cannot be front-run.** Every contract initializes in
  `__constructor`, inside the deployment invocation, rather than in a second
  publicly callable transaction that an observer could win. The reasoning is
  written down at each call site.
- **Authorization is delegated, not duplicated.** The Factory performs no
  ownership checks of its own; each sub-call enforces the authority it owns, and
  a failure rolls back the whole invocation. `set_contracts` no longer accepts a
  leading `_admin` parameter that was silently ignored — a pattern that misled
  callers in three contracts.
- **Errors are typed and numbered as interface.** `#[contracterror]` throughout,
  with the append-only numbering rule stated in the enum docs and a committed ABI
  snapshot behind it. 72 failure paths, none of them a formatted string.
- **State expiration is explicit.** The TTL policy is applied on every write and
  on hot reads, with the reasoning (an archived ownership record reads as
  missing, so an NFT would appear to vanish) recorded next to the constants.
- **Unbounded reads are paginated.** `tokens_of_owner`,
  `get_nfts_in_collection` and `get_collections_by_creator` each clamp page size
  and their doc comments name the previous unbounded implementation.
- **`quote_royalty` rounding is exact and its arithmetic is bounded.** Every
  recipient but the last takes the floor of its share; the last absorbs the
  remainder, so the payouts sum to the computed total with no stroop created or
  lost. Verified during this review rather than assumed: `total * share` is an
  unchecked multiply, but `sale_price * basis_points` is checked and shares sum
  to 100, so `total * share ≤ sale_price * 10⁻²` and the multiply cannot
  overflow. It is safe, and it is safe for a reason that is not written down.
- **Supply and ownership changes are bounded and indexed.** Token ids are never
  recycled, burned tokens do not free their id, and per-owner enumeration is a
  dense index with O(1) swap-removal rather than a scan to `total_supply`.

## Settlement

C4 is the finding that needs a design rather than a repair, so the decision is
recorded here before the code.

**Assets.** Payment settles in any SEP-41 token, addressed by contract id. That
covers the two things this platform actually needs without a custom asset
registry: XLM, through its Stellar Asset Contract, and any issued Stellar asset
(including a stablecoin) that the issuer has deployed an SAC for. Supporting
"asset by contract id" is the whole of the integration — no trustline handling,
no issuer allowlist, no conversion.

**What is not in scope.** Claimable balances (#203), sponsored reserves (#204)
and path payments (#205) each solve a real adjacent problem, and each needs a
decision about who carries the risk before it needs code. They are recorded as
out of scope rather than half-built.

**Enforcement.** A bare `nft.transfer` carries no price, so a royalty cannot be
computed on transfer and paying on one is not well defined — the tracker's #25
is right about this. Enforcement therefore attaches to the operations that _do_
carry a price: a primary mint that is paid, and a sale that settles through the
contract. Both are implemented so the split is computed by `quote_royalty`
rather than re-derived, which is what makes the published quote and the actual
payment the same number.

## Remediation log

Each row lands as its own commit; this table is the index. "Closed, no change"
means the finding was real but its proposed remedy did not survive measurement —
the reason is recorded in [what the measurements changed](#what-the-measurements-changed)
rather than left to be re-derived.

| Finding                   | Tracker   | Status                                       | Commit    |
| ------------------------- | --------- | -------------------------------------------- | --------- |
| C3 resource figures       | #193      | fixed — harness, published tables, CI gate   | `851dc90` |
| C1 collection membership  | #22       | fixed — cap made reachable, guard tested     | `9e2e5af` |
| C7 migration event        | #151      | fixed — `Migrated(from, to)` in all five     | `ece6861` |
| C8 `add_nft` existence    | —         | documented — boundary recorded at the entry  | this pass |
| C9 auto-registration name | —         | fixed in the app — `update_profile` fallback | this pass |
| C5 `starts_with` cost     | #152      | closed, no change — remedy not implementable | —         |
| C6 run-time symbols       | —         | closed, no change — measured as no effect    | —         |
| C2 creator attribution    | —         | open                                         | —         |
| C4 settlement             | #25, #202 | open                                         | —         |

## What the measurements changed

The benchmark in `contracts/benchmarks` was built to find the expensive paths.
It also found that two of this review's own recommendations were wrong, which is
worth recording, because both were plausible from reading the source and both
would have cost a refactor.

**Soroban's fee is rent, and rent is entry count and bytes, not work.** Across
the measured entry points, rent is 97–99% of the fee. A CPU instruction costs
0.0025 stroops (25 stroops per 10,000), while one ledger entry read costs 6,250
and one write costs 10,000. So the O(n) rewrites that C1 and the per-owner index
were written to avoid are, at the fee level, invisible: `collection.add_nft` at
129 members spends 425,516 instructions — 1,064 stroops — against a rent bill of
5,800,055. The lever is the number and size of the entries a call leaves behind,
and the sparse per-index design the NFT contract already uses is the right
shape. What C1 actually needed was the cap fix, not a layout change.

**C5's remedy is not implementable.** The finding said to compare only the bytes
that can matter "without allocating". Soroban's `String` exposes exactly one way
to read its bytes — `copy_into_slice`, which panics unless the destination slice
is the string's _entire_ length — and `String` has no `to_bytes`, no `slice`, and
no `starts_with`. A buffer sized to the string is therefore unavoidable, and the
only remaining cost is zeroing it. At 512 bytes that is ~8,000 instructions
across the 16 checks in one `set_social_links` call, out of 141,677: 0.02% of
that call's fee. Recorded, not changed.

**C6 was measurably neutral.** Replacing `Symbol::new` with `symbol_short!` in
the Factory's inner loop changed `mint_batch_with_royalty(25)` by exactly zero
instructions (23,102,805 before and after). The macro still constructs the symbol
through the host at run time; only the source got longer. Reverted rather than
committed with an unearned justification.

## Repudiated

Claimed from reading, then disproved, and recorded so the next reader does not
re-derive them.

- **`quote_royalty` can overflow on a huge sale price with a 100% rate.**
  Reading `total * (share as i128)` as unchecked suggested `i128::MAX` with
  `basis_points = 10000` and a single 100% recipient would wrap to a negative
  payout. It cannot: `sale_price * basis_points` is checked first, so
  `sale_price ≤ i128::MAX / basis_points`, and shares sum to 100, which bounds
  `total * share ≤ sale_price / 100`. The arithmetic is correct; only the reason
  is unwritten.
- **`validate_recipients` can be bypassed with a share map that sums above 100.**
  `saturating_add` looked like it could mask an overflow. With at most 10
  recipients and a `u32` accumulator, saturation would require shares that
  `Map<Address, u32>` cannot express; a saturated total is also `≠ 100` and so
  rejected. Not a defect.
- **`assert_not_zero` in the NFT contract is reachable and therefore dead
  weight.** It is reachable — `transfer`, `transfer_from` and `approve` all
  reach it with a caller-supplied address — so the cost is real, not dead.
  Whether it is _worth_ its cost is a question for the resource work, not a
  defect.

## Out of scope for this pass

Tracked, and deliberately not attempted here: independent audit (#140),
HSM/multisig custody (#141), pause mechanism (#143), upgrade timelock (#144),
re-runnable wiring (#145), wasm size policy (#146, #147), a shared helper crate
(#135, #136, #137), property and fuzz testing (#46, #149, #187), contract
coverage measurement (#185, #186), claimable balances (#203), sponsored
reserves (#204), path payments (#205), SEP-24/31 anchoring (#206), and the
marketplace contract itself (#200, #201) beyond the settlement entry points
described above.

[storage-docs]: https://developers.stellar.org/docs/build/guides/storage/storage-strategies
