# BezaMint — Contributor Backlog

Work that is genuinely open, verified against the current tree. Each entry names
the problem, the evidence, and acceptance criteria a reviewer can check
objectively. Every entry here corresponds to an open issue in the tracker, and
every issue in the tracker corresponds to an entry here — the two are kept in
step deliberately.

Start with [`docs/architecture.md`](docs/architecture.md) for how the system fits
together, [`contracts/README.md`](contracts/README.md) for the interface reference
and [`docs/deployment-runbook.md`](docs/deployment-runbook.md) for operating it.
[`docs/review/critical-review.md`](docs/review/critical-review.md) records the
findings that have been fixed.

## How this list is maintained

The tracker previously carried 100 open issues that were auto-generated from an
earlier version of this file. Almost all of them described gaps that had since
been closed, which cost real time: two pull requests were opened against issues
that were already implemented, one adding a second module duplicating
`apps/web/src/lib/explorer.ts` and one adding a `CONTRIBUTING.md` that already
existed.

Those issues have been closed, each with a comment naming the file or function
that satisfies it, and the two pull requests were closed with an explanation and
a pointer to work that is actually open.

Three of the closed issues named a claim that was false while pointing at a real
gap: there is a server-side indexer, a rate limiter and a batch mint, so the
titles were wrong, but the durability, sharing and per-item terms they were
groping toward are genuinely missing. Closing the false claim and dropping the
real work with it would have been its own kind of dishonesty, so that work is
tracked in narrower form as entries 130, 131 and 132.

What remains is this list. Nothing is marked done here — completed work is
removed, and git history keeps it.

A backlog that describes solved problems is worse than no backlog: it wastes
contributor time and it misrepresents the project. If you find an entry here that
does not reproduce against the current tree, that is a bug in this file and worth
an issue of its own.

---

## Contracts

### 22. [collection] `remove_nft` rebuilds its index — O(n) per removal

**Problem.** `remove_nft` rebuilds the collection's token index by iterating
every entry. The original report also named a duplicated
`MAX_NFTS_PER_COLLECTION` constant; that part is resolved — the constant is
declared once at `contracts/collection/src/lib.rs:34`.

**Acceptance criteria.** Either a removal path that avoids rebuilding the whole
index, or a documented decision that an ordered vector is intentional with its
cost stated. Tests that removal preserves order and the remaining count.

**Notes.** The index is an ordered `Vec<u64>` and the order is part of the read
surface (`nfts_in_collection` returns tokens in creation order), so a swap-remove
would change observable behaviour. A tombstone plus a compaction path is the
likely shape.

### 25. [royalty] Royalty enforcement is quote-based and undocumented

**Problem.** Royalty terms are stored and quotable, but nothing obliges a buyer's
client to pay them: `nft.transfer` moves a token with no sale price, so a payout
cannot be computed there and paying on a bare transfer is not well-defined. The
mechanism that does exist is `quote_royalty(target_id, is_collection, sale_price)`
(`contracts/royalty/src/lib.rs:471`), which returns exact per-recipient amounts
with the rounding remainder assigned to the last recipient so no stroop is created
or lost.

**Acceptance criteria.** A decision recorded in `docs/architecture.md` and
`contracts/README.md`:

- **(a)** royalties are marketplace-enforced — document the integration contract
  for a marketplace and state plainly that a client which ignores `quote_royalty`
  can bypass them; or
- **(b)** an escrowed sale entry point is added that atomically collects the sale
  price and distributes the quote, with tests proving the seller receives the
  principal and each recipient the quoted amount.

**Notes.** (a) is the Soroban-idiomatic answer and is what the current interface
supports. (b) is what "this contract enforces royalties" would require. This is a
scope decision before it is an implementation.

### 28. [royalty] No per-collection royalty inheritance

**Problem.** A royalty config can be set for a collection (`is_collection = true`)
or for an individual token (`is_collection = false`), but `get_royalty` does not
fall back from the token to its collection. A token with no config of its own
therefore reads as having no royalty even when its collection has one.

**Acceptance criteria.** `get_royalty` falls back to the collection config when no
token config exists; the precedence is documented; tests for both the fallback and
the override.

**Notes.** The fallback needs the token-to-collection mapping, which currently
lives on the Collection contract, so this either adds a cross-contract read or
moves the mapping somewhere the royalty query can reach.

### 33. [nft] Metadata URI has no content commitment

**Problem.** `metadata_uri` is immutable after mint, which is the right property,
but there is no on-chain commitment to the metadata _content_. A URI can resolve
to different attributes later than the ones a reviewer saw at mint time, and
nothing on-chain could detect it.

**Acceptance criteria.** An optional `metadata_hash` recorded at mint, exposed by
`token_data`; the frontend metadata resolver verifies the fetched document against
it and surfaces a mismatch instead of rendering unverified metadata; tests
covering hash recording and mismatch handling.

**Notes.** Optional rather than required, so existing tokens and creators without
a digest are unaffected.

### 34. [nft] Nothing links a transfer to the royalty registry

**Problem.** A transfer already emits `NftEvent::Transferred(token_id, from, to)`
(`contracts/nft/src/lib.rs:457`) and updates the owner index, so the eventing and
ownership bookkeeping an earlier report asked for are in place. What does not
exist is any link from a transfer to the royalty registry: there is nothing for an
operator sync or a stale-config cleanup to hook into.

**Acceptance criteria.** Either a documented statement that royalty configs are
keyed by token id and are deliberately unaffected by transfer, with the reasoning,
or the specific bookkeeping that should change on transfer, with tests.

**Notes.** Entangled with the royalty enforcement decision in entry 25; whichever
way that goes determines whether anything needs to change here.

### 41. [nft] Per-collection supply cap

**Problem.** `MAX_SUPPLY` is a single global constant, so a creator cannot express
"this drop is limited to 100".

**Acceptance criteria.** An optional per-collection cap consulted by `mint`,
falling back to the global limit; tests at the cap, cap − 1 and cap + 1.

**Notes.** The cap has to live where `mint` can read it. The NFT contract serves
every collection and is not wired to the Collection contract, so either the NFT
contract gains an admin-only collection-contract pointer and a cross-contract
read, or the cap is enforced in the Factory where a direct `mint` bypasses it. The
first is correct; the second is cheaper and should be rejected.

### 132. [factory] Batch mint accepts only uniform terms

**Problem.** `mint_batch_with_royalty` mints a bounded batch atomically, but every
token in the batch shares one recipient and one royalty rate. A drop with
distinct recipients, or per-item royalty terms, still costs one transaction per
item — which is the cost the batch path exists to remove.

**Acceptance criteria.** Either a documented statement that uniform batches are
the intended scope, recorded in `contracts/README.md` with the reasoning, or a
batch entry point that takes per-item terms, bounded and proven atomic by the same
mid-batch-failure test the existing batch has.

**Notes.** The per-item variant needs a bounded argument shape: a `Vec` of
recipient/rate pairs is unbounded by construction unless the same `MAX_BATCH_MINT`
guard is applied to it, which is the first thing to get right.

### 44. [nft] No `token_uri` helper for ecosystem interop

**Problem.** `token_data` returns the full contract `NftData` struct, which mixes
on-chain fields with off-chain URI fields. There is no `token_uri` helper, so a
wallet or marketplace looking for the conventional interface has nothing to call.

**Acceptance criteria.** `token_uri(token_id)` returning the metadata URI, with a
clear panic for an unminted token, and tests for both the minted and unminted
cases. `token_data` stays as it is unless there is a reason to change it.

**Notes.** This is about interoperability, not about hiding fields — the existing
read API is a deliberate contract surface, not an accident.

### 45. [royalty] Basis-point bound is not cross-checked

**Problem.** Basis-point validation exists in two places that can drift:
`validate_basis_points` on-chain (`contracts/royalty/src/lib.rs:447`) and the
shared constant `maxBasisPoints` in `packages/shared/src/constants/limits.ts`,
exercised by `apps/web/src/lib/__tests__/royalty-validation.test.ts`. Nothing
asserts that the two agree.

**Acceptance criteria.** A test that fails if the contract's bound and the shared
constant diverge, and a comment in each location naming the other as the
authority.

**Notes.** Some duplication across the language boundary is unavoidable; the goal
is that a change to one bound produces a failing test rather than a silent
mismatch.

### 46. [contracts] No property tests for counters and boundary arithmetic

**Problem.** Counter arithmetic, supply bounds and basis-point math are covered by
example-based tests but not by property tests, so boundary correctness depends on
the author having thought of the boundary.

**Acceptance criteria.** Property-style or exhaustive boundary tests for:

- minting at the supply cap, at cap − 1 and at cap + 1;
- batch mint bounds against `MAX_BATCH_MINT`;
- rounding in `quote_royalty` summing exactly to the computed total for arbitrary
  prices and rates.

**Notes.** The arithmetic is `checked_*` throughout, so the risk is logical rather
than overflow.

---

## Backend / API

### 86. [api] Contract addresses are not validated at startup

**Problem.** Contract addresses are read from environment variables and used
directly. A malformed or truncated identifier produces empty or failing reads far
from the cause — the same class of failure that cost time during the most recent
deployment.

**Acceptance criteria.** Boot-time validation of every configured contract id
against the StrKey format, failing fast with a message naming the offending
variable; unit tests for the parser including a truncated id and a valid one.

**Notes.** This is a fail-fast check, not a runtime guard: the aim is that a
misconfiguration is visible at startup rather than as an empty result later.

### 130. [api] Indexer state is in-memory — no durable store or cursor checkpoint

**Problem.** The event indexer keeps recent events and its cursor in process
memory (`apps/web/src/lib/server/indexer.ts`). On a multi-instance deployment each
instance has its own view, the state is lost on restart, and a cold start can only
reach back as far as the RPC's event retention window — observed to be roughly
10,500 ledgers and materially less than the 17,000 the client initially assumed —
so historical queries cannot be answered at all. `/api/health` reports
`checks.indexer.stalled` so the condition is alertable, but alerting is not a fix.

**Acceptance criteria.** A persistent store fed by a poller that checkpoints its
cursor, so a restart resumes instead of truncating history; a documented schema;
backfill from a known ledger; the in-memory path retained as a read-through cache.
Tests covering resume-after-restart and a cold start with no stored cursor.

**Notes.** The retention window is why this is not merely a scaling concern:
without a durable cursor, a restart that lands outside the window loses history
permanently, and the failure is silent rather than an error.

### 131. [api] Rate limiter state is per instance

**Problem.** The per-IP limiter in `apps/web/src/middleware.ts` keeps its counters
in memory. On a horizontally scaled deployment the effective limit is the
configured limit multiplied by the instance count, and every deploy resets it.
[`docs/api-reference.md`](docs/api-reference.md) states this limitation rather
than hiding it, but the limit is still not enforced as documented.

**Acceptance criteria.** A shared store behind the existing limiter interface,
with the in-memory implementation retained for local development and tests; a
documented and deliberate failure mode for when the store is unreachable — fail
open or fail closed, chosen explicitly rather than by default. Tests for the
shared-store path and for the chosen failure mode.

**Notes.** The failure-mode decision is the part worth thinking about: failing
open removes the protection exactly when the system is degraded, and failing
closed turns a cache outage into an outage of the API.

---

## Frontend

### 55. [web] Transaction status has no success deep-links

**Problem.** `TransactionStatus` reports a state but offers no link to the asset a
transaction produced, so after a successful mint the user has to go and find it.

**Acceptance criteria.** On success, the component renders an explorer link for
the transaction hash and a link to the affected collection or token page where one
exists, both built through `apps/web/src/lib/explorer.ts` rather than literal
URLs. A component test covers the success branch.

**Notes.** Ledger and network come from the same configuration the rest of the app
uses, so a testnet deployment links to testnet.

### 59. [web] Attributes are not validated before submit

**Problem.** The attribute editor accepts empty trait names, empty values and
duplicate trait names. Shared limits exist in
`packages/shared/src/constants/limits.ts` but are not applied to the form before
submit.

**Acceptance criteria.** Inline validation for a non-empty name and value, a
maximum attribute count sourced from the shared limits rather than a literal, and
duplicate-name rejection. Tests covering each rule.

**Notes.** Validation should also be mirrored server-side where the metadata is
assembled, so a direct API caller is not validated differently from the form.

### 60. [web] Explore page featured cards present no data

**Problem.** The featured cards on the explore page are styled entry points. They
link onward but present no data, so a visitor cannot tell whether they lead
anywhere meaningful.

**Acceptance criteria.** Each featured card either renders a real figure from an
existing endpoint (for example recent mints or collections per the stats route)
and links to the corresponding real page, or is removed. No card should imply a
capability the app does not have.

**Notes.** This is the same class of problem as the placeholder content previously
served on this page; the standard to hold it to is that every number on screen
traces to an endpoint.

### 64. [web] Form inputs lack visible focus rings (WCAG 2.4.7)

**Problem.** Several custom inputs and the royalty slider suppress the default
outline without providing a replacement focus indicator, so keyboard focus can be
invisible.

**Acceptance criteria.** A consistent `focus-visible` ring on inputs, buttons and
the slider, defined once as a shared utility or token rather than per component.
Verified with an automated accessibility check or an explicit keyboard pass.

**Notes.** The theme system is CSS-variable based, so the ring should be a token
that works in both themes rather than a hardcoded colour.

### 66. [web] Toast system has no action buttons

**Problem.** `ToastContext` delivers a message and nothing else, so a success
toast cannot offer the obvious next action — opening the transaction in an
explorer.

**Acceptance criteria.** An optional action on the toast API (label plus handler
or href), rendered accessibly, dismissible by keyboard, and used for transaction
success. Tests for the action being invoked and for keyboard dismissal.

**Notes.** Any URL passed in should come from `apps/web/src/lib/explorer.ts` so
network selection stays in one place.

### 67. [web] No pagination for the collections grid

**Problem.** The collections grid renders every item in one pass, so a wallet with
many collections produces a large DOM and a slow first paint.

**Acceptance criteria.** Pagination or virtualization with a page size taken from
the shared limits rather than a literal, and a documented choice between the two
approaches. A test that the initial render is bounded regardless of input size.

**Notes.** The API already supports paginated collection queries, so server-side
paging is available if the client prefers not to load everything first.

### 74. [web] Mint form does not estimate or report network fees

**Problem.** The mint form submits without telling the user what a transaction
will cost or whether the wallet can cover it, so an avoidable failure surfaces
only after signing.

**Acceptance criteria.** An estimated fee for the prepared transaction, shown
alongside the balance already available from `checkBalance`, with a warning when
the balance cannot cover the fee plus any required reserve. A test for the
insufficient-balance branch.

**Notes.** Estimation should not block submission on its own failure — a missing
estimate is a missing hint, not a reason to prevent a mint.

---

## Tests

### 93. [tests] No browser-driven suite for the write path

**Problem.** The critical path — connect, mint, confirm, view — is covered only by
unit and component tests that stub every boundary. A break in signing, submission
or confirmation handling would not be caught before a user hit it.
`scripts/smoke-test.sh` covers the read path over HTTP but not the browser flow.

**Acceptance criteria.** A browser-driven suite asserting that a minted token
later appears with the metadata it was minted with, split into two runs:

- a wallet-less smoke of landing to explore to an asset page, runnable in CI on
  every push;
- the mint flow, which needs a funded account and a live network, run before a
  release rather than on every push.

Both documented in [`docs/deployment-runbook.md`](docs/deployment-runbook.md).

**Notes.** Keeping the two runs separate is the point: a suite that needs a funded
key cannot be a required check, and a required check that stubs the network does
not test this.

### 100. [tests] No table test for the shared limit constants

**Problem.** The shared limit constants are asserted piecemeal, so a single edit
to `packages/shared/src/constants/limits.ts` can break several hidden
expectations at once, and nothing states which consumers depend on which value.

**Acceptance criteria.** A table or snapshot test that pins every exported limit
and names its consumers, so a change to a bound shows up as a visible diff rather
than as a silent behaviour change.

**Notes.** The value is in the consumer list as much as the numbers — it is the
thing that is missing today.

---

## CI

### 105. [ci] `prebuild-check.sh` is not run in CI

**Problem.** `scripts/prebuild-check.sh` validates prebuild state but CI never
runs it. The companion `check-lockfile.sh` an earlier report named no longer
exists in the repository.

**Acceptance criteria.** `prebuild-check.sh` runs in CI and exits non-zero on
failure, or is deleted with the reason recorded. A demonstration of the failure
path, either as a test or an observed failing CI run.

**Notes.** A script that nothing runs is worse than no script: it implies a
guarantee that is not being enforced.

### 107. [ci] The shared package lint is not run as its own CI job

**Problem.** `packages/shared` has its own `lint` script (`tsc --noEmit`) that can
break while the web job still passes, because CI does not check the shared package
on its own.

**Acceptance criteria.** A CI step running the shared package's lint, so a type
error there fails the build independently of the web app.

**Notes.** The shared package is consumed by the web app, so a type error there is
a real build risk even when the web job happens to typecheck.

### 110. [ci] Supported Node version is neither tested nor documented

**Problem.** CI runs a single Node version and `engines` declares `>=24.0.0`, so
neither the code nor the documented support policy states which LTS lines are
actually intended. An implied range with a single tested version is the mismatch
to remove.

**Acceptance criteria.** A documented decision: either widen `engines` to cover
the intended LTS range and test that range in a CI matrix, or keep the single
supported version and say so explicitly in the README and in `engines`.

**Notes.** `engines` is enforced by the package manager, so it is a promise to
contributors, not just metadata.

---

## Labels

Every open entry carries exactly one difficulty label, and the difficulty decides
its discovery label:

| Difficulty            | Label                | Discovery label                          |
| --------------------- | -------------------- | ---------------------------------------- |
| Small, self-contained | `difficulty: easy`   | `good first issue`                       |
| Needs design thought  | `difficulty: medium` | `help wanted`                            |
| Cross-cutting         | `difficulty: hard`   | `help wanted` + `design-decision-needed` |

Area labels: `contracts` · `frontend` · `backend` · `tests` · `ci` · `docs` ·
`accessibility` · `performance` · `security` · `i18n` · `community`.

Change labels: `enhancement` · `bug` · `documentation`.
