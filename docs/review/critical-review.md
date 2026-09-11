# BezaMint — Critical Review

An adversarial, evidence-based review of the BezaMint monorepo against production
readiness criteria: correctness on the Stellar/Soroban network, security of the
five contracts, honesty of the API layer, and the engineering hygiene a reviewer
or auditor will check first.

Every finding below cites the file and the observable behaviour that produced it.
Findings are ordered by blast radius, not by ease of fix. Remediation status is
tracked in the table below and in [`../../docs/improvements/plan.md`](../improvements/plan.md).

Scope: this review targets **testnet deployment**. Mainnet migration, key custody
in an HSM, and a third-party audit are explicitly out of scope and remain release
blockers for mainnet (see [`../mainnet-readiness.md`](../mainnet-readiness.md)).

---

## Verdict

The repository was **not production-ready** when this review began, but the gap was
concentrated rather than diffuse. The contract layer is unusually mature for a
project at this stage — typed storage keys, explicit TTL management,
ERC-721-shaped approvals, dense per-owner ownership indexes, archived-collection
guards, and a test suite that asserts emitted events. The web layer, similarly, has
a real error envelope, a bounded rate limiter, an upload guard, and a metadata
schema.

What blocked release was a small number of **silent failures**: things that look
correct, pass tests, and return wrong answers in production. Those are the most
dangerous class of bug because they survive every green check.

All eighteen findings below are fixed, each in its own commit with tests that fail
against the previous behaviour. "Fixed" means the code and its tests changed, not
that the risk is gone: the review found the problems a reviewer can find by reading
this repository, and passing tests are not evidence of absence. What remains open
is tracked, with acceptance criteria, in [`../../ISSUES.md`](../../ISSUES.md), and
what cannot be discharged by code at all is in
[`../mainnet-readiness.md`](../mainnet-readiness.md).

| #   | Severity     | Area      | Finding                                                                                                                                           | Status |
| --- | ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Critical** | API       | Event indexer decodes a topic layout the contracts never emit; every indexed endpoint is silently empty                                           | Fixed  |
| 2   | **Critical** | API       | Indexer requests `startLedger: 0`, outside the RPC retention window; the request itself fails                                                     | Fixed  |
| 3   | **Critical** | Contracts | `initialize()` is front-runnable: deploy and init are separate transactions, so an attacker can seize the admin role                              | Fixed  |
| 4   | **High**     | Tooling   | Security overrides live in a `package.json` field pnpm 9 honours but has deprecated and pnpm 10 removes; nothing guards against a silent pin loss | Fixed  |
| 5   | **High**     | Contracts | Secondary-sale royalties are configured but never collected; the platform's core promise is unimplemented                                         | Fixed  |
| 6   | **High**     | Contracts | `set_contracts` accepts zero and self addresses; a wiring mistake bricks the mint path with no recovery path                                      | Fixed  |
| 7   | **High**     | API       | The indexer test asserts the same wrong wire format as the code, so a green suite certifies a broken feature                                      | Fixed  |
| 8   | **High**     | Docs      | `ISSUES.md` advertises 100 open issues, most of which are already implemented; it misrepresents the project to contributors and reviewers         | Fixed  |
| 9   | **High**     | Contracts | Storage `Version` keys are written but never read, so a schema change corrupts reads silently                                                     | Fixed  |
| 10  | **High**     | Tooling   | CI has no coverage gate, no wasm ABI drift check, and no bundle budget; regressions are invisible                                                 | Fixed  |
| 11  | **Medium**   | Contracts | Factory getters panic with a bare `unwrap()` and are unusable before wiring                                                                       | Fixed  |
| 12  | **Medium**   | Contracts | No batch mint; a 10-piece drop costs 10 transactions                                                                                              | Fixed  |
| 13  | **Medium**   | Contracts | Boundary coverage at the 512-byte URI limit was inconsistent; NFT and Creator could regress to an exclusive limit silently                        | Fixed  |
| 14  | **Medium**   | API       | Readiness ignores the contract configuration: a deploy with every contract ID unset answers 200 healthy                                           | Fixed  |
| 15  | **Medium**   | Docs      | No architecture overview or contract interface reference for integrators                                                                          | Fixed  |
| 16  | **Medium**   | API       | The declared `TIMEOUT` error code is never produced: a hung upstream is reported as 500 INTERNAL                                                  | Fixed  |
| 17  | **High**     | Contracts | The Royalty admin hand-off is one-way, leaving the Royalty contract permanently un-upgradable                                                     | Fixed  |
| 18  | **Low**      | Docs      | This document's own status table contradicted its remediation log, reporting fixed findings as open                                               | Fixed  |

---

## Critical findings

### 1. The event indexer drops 100% of on-chain events

**Evidence.** `apps/web/src/lib/server/indexer.ts` decodes an event by reading the
variant index out of the _second_ topic:

```ts
const [topic0, topic1] = raw.topic;
...
if (variant === null) return null;
const type = source.variants[variant];
```

The contracts publish exactly **one** topic:

```rust
env.events().publish((symbol_short!("factory"),), event);
```

A `#[contracttype]` enum is serialised into the event _data_, not into additional
topics. The XDR encoding was verified from the host itself:

```
ScVal::Vec([Symbol("NftMinted"), U64(42), Address(...)])
```

Because `topic1` is always `undefined` in production, `variant` is always `null`,
`decodeEvent` always returns `null`, and every event is discarded. The store stays
permanently empty, so `/api/nfts`, `/api/collections`, `/api/creators`,
`/api/search`, `/api/stats` and `/api/wallet/transactions` all degrade to empty
results. Nothing in the system throws; the endpoints return `200 OK` with `[]`.

**Why it matters.** This is the difference between "the app is quiet" and "the app
is broken". A reviewer who only reads status codes would pass it. A reviewer who
mints an NFT and then looks at the activity feed would not.

**Root cause.** The decoder was written against an assumed wire format rather than
the host's actual encoding, and the test was written from the same assumption, so
the two agreed with each other and with nothing else.

**Remediation.** Decode by **variant name** (element 0 of the native-decoded
vector), not by positional index read from a topic. Names survive enum reordering;
indices do not. Additionally support the legacy `(symbol, u32 index)` topic form so
the decoder cannot silently regress if the contracts' emit shape ever changes.
Covered by `apps/web/src/lib/server/__tests__/indexer.test.ts`, rewritten to
construct ScVals the way the host does.

### 2. The indexer's `startLedger: 0` is rejected by Soroban RPC

**Evidence.** `fetchEvents()` calls `getEvents({ startLedger: 0, ... })`.

Soroban RPC retains only a bounded ledger window (currently ~17,280 ledgers, about
24 hours). A `startLedger` of `0` is outside that window and the node rejects the
request with a `startLedger must be within the ledger range` style error. So even
after finding 1 is fixed, the first fetch fails. The failure is caught and logged
as a warning, then swallowed — the store keeps serving stale data (initially,
nothing), which is why it presents as "empty" rather than "erroring".

**Remediation.** Query `getLatestLedger()`, start from
`max(1, latest - LOOKBACK_LEDGERS)`, and advance with the RPC's `cursor` on
subsequent polls. Keep the lookback well inside the retention window so a cold
start never lands outside it.

### 3. `initialize()` is front-runnable

**Evidence.** Every contract exposes a public, one-shot `initialize(admin)` that
authenticates the _supplied_ admin:

```rust
pub fn initialize(env: Env, admin: Address) {
    if Self::is_initialized(env.clone()) { panic!("NFT: already initialized"); }
    admin.require_auth();
    env.storage().instance().set(&NftKey::Admin, &admin);
```

`deploy.sh` deploys each contract and initializes it in **separate CLI
invocations**. Between those two transactions any observer can call `initialize`
with their own address, satisfy `require_auth()` with their own signature, and
become admin. On the Factory contract that is total compromise: the attacker can
`set_contracts` to hostile addresses and every mint, burn and collection creation
routes through their code.

There is no deployer binding and no way to derive "the deployer" from the host API,
so this cannot be fixed by checking `env.invoker()`.

**Remediation.** Move initialization into a Soroban `__constructor`, which runs
atomically as part of contract creation and therefore cannot be raced. Verified
supported by `soroban-sdk 22.0.11`. `deploy.sh` passes constructor args at deploy
time. This is a breaking deployment change, which is acceptable pre-mainnet and
would in any case have required a redeploy.

### 4. The dependency security pins are one upgrade away from disappearing

**Evidence.** `package.json` declares:

```json
"pnpm": { "overrides": { "nanoid@<3.3.18": "^3.3.18", ... } }
```

and pnpm 9.15.4 warns on every command:

```
[WARN] The "pnpm" field in package.json is no longer read by pnpm.
       The following keys were ignored: "pnpm.overrides".
```

That warning is misleading in the current version, and it matters that this was
checked rather than assumed. Running `pnpm install --lockfile-only` with the field
in place reproduces `pnpm-lock.yaml` **byte-identically**, keeping `toml@4.3.0` and
`postcss@8.5.25`; the advertised replacement (moving `overrides` into
`pnpm-workspace.yaml`) under pnpm 9.15.4 _drops_ the pins and downgrades `toml` to
`3.0.0` and `postcss` to `8.4.31`, reintroducing the vulnerabilities.

So the pins are in force today, but the field they live in is deprecated and is
removed in pnpm 10. The failure mode is therefore a silent one on upgrade: pnpm or
Node is bumped, the lockfile is regenerated in good faith, the overrides vanish,
vulnerable versions resolve, and the audit gate passes because nothing declares
the pins any more.

**Remediation.** Keep the field (it is the only location pnpm 9 honours) and add a
guard that fails loudly if either half of the guarantee is lost:
`apps/web/src/lib/__tests__/supply-chain.test.ts` asserts the overrides are
declared, that the lockfile records a top-level `overrides:` block, and that every
resolved occurrence of the five packages is at or above its patched floor. The
same test is the migration checklist for a future pnpm 10 upgrade.

---

## High findings

### 5. Royalties are configured but never collected

The Royalty contract stores `RoyaltyConfig` and the Factory records a rate on every
mint, but nothing ever transfers the royalty on a secondary sale. There is no
marketplace contract in the repo, and a bare `transfer` of an NFT carries no
payment, so the payout has nowhere to hook.

This is not a bug so much as an unfinished core feature that the README presented as
delivered. It is listed here because "royalties" is the platform's headline claim
and a reviewer will test it.

**Remediation (chosen).** Added a pure on-chain
`quote_royalty(target_id, is_collection, sale_price) -> Vec<RoyaltyPayout>` that
returns the exact per-recipient payout for a sale, computed from the stored config.
It covers the documented zero-recipient default (100% to creator), returns nothing
when the rate, price, or rounded share is zero, checks the multiplication for
overflow, and assigns the rounding remainder to the final recipient so the amounts
always sum to exactly the royalty total — no stroop created or lost. Shares are
matched by address rather than iteration order.

This is the piece a marketplace must call: deterministic, unit-testable, and
unambiguous about who gets paid what, without inventing an escrow design the
project has not committed to. Settlement itself remains a marketplace
responsibility, because a bare NFT `transfer` carries no payment for the contracts
to hook, and that boundary is documented in the contract itself and in
[`../mainnet-readiness.md`](../mainnet-readiness.md).

### 6. `set_contracts` accepts unusable addresses

`set_contracts` writes whatever it is handed. There was no zero-address check, no
self-reference check, and no duplication check. A typo in one address produced a
Factory that permanently panics on every mint (`Factory: NFT contract not set`
never fires — the value _is_ set, it is just wrong), and the only recovery was
another admin call, which is exactly the point: the guard should exist so the
misconfiguration is rejected at the moment it is made rather than discovered by
users.

**Remediation.** Reject the zero account, reject the Factory's own address, and
reject duplicate addresses across the four slots.

### 7. A green test suite certifies a broken feature

`apps/web/src/lib/server/__tests__/indexer.test.ts` built fixtures with

```ts
topic: [scvSymbol('factory'), scvU32(variant)];
```

This is the same incorrect assumption as the code under test (finding 1). The suite
passed, the feature did not work. A test that encodes the implementation's
misconception is worse than no test: it converts an unknown-unknown into a
believed-known.

**Remediation.** Rebuild the fixtures from the host's real encoding (verified above)
so the test fails against the old decoder.

### 8. The public issue backlog misrepresents the project

`ISSUES.md` announced "100 Contributor Issues" and described many already-solved
problems as open: `transfer_from` missing (it exists), `add_nft` allowing
duplicates (it is guarded), pagination absent (implemented), approvals dead code
(they work). `docs/improvements/plan.md` had the same problem in the opposite
direction: 250 improvements with the frontend and backend largely complete but
unchecked, so the document read as a project that has done nothing.

Both files are the first thing a contributor or reviewer reads. They were damaging
the project's credibility more than any missing feature.

**Remediation.** Regenerate both against the actual tree, with a per-item status
and an evidence pointer.

### 9. Storage versions are written but never enforced

`initialize` wrote `Version = 1` in every contract, and no read path ever consulted
it. The intent — a schema-versioned store that refuses to read data written by a
future version — was documented in the roadmap but not implemented, so a
post-upgrade contract could read a struct laid out differently and produce garbage
rather than a clear error.

**Remediation.** Declare a `STORAGE_VERSION` per contract, add a `version()` getter,
invoke an `assert_version` check on every mutating path, and add an admin-only
`migrate(from_version)` that requires the exact stored version, refuses to run when
already current, and is the only function exempt from the check because it is what
repairs a mismatch. Tests stamp a foreign version directly into storage to prove
mutation is refused and that naming the stored version restores normal operation.

### 10. CI verifies compilation, not correctness

`.github/workflows/ci.yml` ran lint, format, typecheck, unit tests, clippy, rustdoc
and wasm size checks — a genuinely strong baseline. Missing: a coverage threshold,
an ABI/wasm drift check that would catch a frontend/contract argument-order
divergence, and a bundle-size budget. All three classes of regression were
invisible.

**Remediation.** All three now exist and fail the build:

- **Coverage** — `@vitest/coverage-v8` with thresholds set just under the measured
  baseline (a ratchet, not a target), and the report uploaded as a build artifact
  so a reviewer can see the uncovered lines.
- **Contract ABI** — `scripts/check-contract-abi.py` extracts the `contractspecv0`
  section each release wasm carries and verifies a committed digest. It caught its
  own first interface change (finding 17) during this pass.
- **Bundle budget** — `scripts/check-bundle-size.sh` sums the client JavaScript and
  fails above a budget set just above the current size.

### 11. Factory getters panic opaquely

`get_nft_contract` and friends called `.unwrap()`, producing a host-level
"unexpected panic" with no message when the contract is unwired. Every other error
path in the codebase uses a prefixed message (`Factory: ...`). A small consistency
bug with an outsized effect on debuggability, because these getters are exactly
what deploy tooling calls to verify wiring.

### 12. No batch mint

`mint_with_royalty` mints one token per transaction. A ten-piece collection cost ten
signatures and ten fees, and offered ten chances to leave a partial drop behind.

**Remediation.** `mint_batch_with_royalty` performs the full mint → link →
configure-royalty sequence for each URI inside a single invocation, so the batch
either fully succeeds or the whole invocation rolls back. Each token still emits its
own `NftMinted` event, so the indexer and activity feed need no new shape. The batch
is bounded by `MAX_BATCH_MINT` (25) with empty and oversized batches rejected by
name. The per-token sequence is shared with the single-mint path through one helper
so the two cannot drift apart.

---

## Medium findings

### 13. Boundary coverage at the URI limit was inconsistent

Off-by-one errors in `<=` versus `<` are the classic failure mode for a length
guard, and they fail _open_ in one direction: a limit that becomes exclusive
silently rejects URLs the contract previously accepted, with no error anywhere.

The Collection contract already had the 512-accept boundary test. The NFT contract
only asserted the 513 rejection, so a `<` regression in `mint` would have shipped
undetected, and the Creator contract's 512-byte avatar/banner limit had no boundary
test at all.

**Remediation.** Add the missing boundaries: NFT `mint` at 511 and 512 (both
accepted, measured on the stored URI), and Creator `register` at a 512-byte avatar
(accepted) and 513 (rejected with the field-named message).

### 14. Readiness ignored the contract configuration

**Evidence.** `apps/web/src/app/api/health/route.ts` computed whether every
contract is configured and then did not consult it:

```ts
const allContracts = Object.values(contracts).every(Boolean);
const healthy = rpc.ok && (!isIpfsAvailable() || ipfs.ok);
```

**Why it matters.** A build with every `NEXT_PUBLIC_*_CONTRACT_ID` unset can mint
nothing, browse nothing, verify nothing — and it reported `200 healthy`. A
readiness probe is the one check that is supposed to catch exactly this deploy, and
`allContracts` was the value that would have caught it.

**Remediation.** Include the contract configuration in the readiness decision and
add the route's first tests, covering both failure modes a deploy actually hits:
an unset contract ID with every dependency up, and an unreachable RPC.

_Correction:_ an earlier revision of this document listed "health reports no build
identity" here instead. That was wrong — the route already returns `version` and
`commitSha`. The entry came from a stale roadmap checkbox rather than from the
code, which is the same class of mistake as finding 7.

### 15. No architecture or interface documentation

There was no single document explaining how the five contracts compose, what each
public function's authorization requirement is, or how the off-chain indexer maps
events to storage. Integrators had to reverse-engineer it from Rust, which is how
argument-order mistakes are made.

**Remediation.** `docs/architecture.md`, `contracts/README.md`, and during this
second pass `docs/api-reference.md`, `docs/deployment-runbook.md`, `docs/faq.md`
and `docs/glossary.md`.

### 16. The declared `TIMEOUT` code was never produced

**Evidence.** `ApiErrorCode` in `apps/web/src/lib/server/errors.ts` declared
`TIMEOUT`, but nothing ever produced it. Every outbound call goes through
`fetchWithTimeout`/`withTimeout`, which reject with `FetchTimeoutError`;
`normalizeError` only matched a `TimeoutError` (a different class) and then fell
through to the catch-all, so a hung Soroban RPC or IPFS gateway was answered with
`500 INTERNAL`.

**Why it matters.** It hid the one upstream condition a caller can act on: the
dependency is reachable but slow, so backing off or retrying is correct, and
treating the API as broken is not. A dead error code is also a signal that the
behaviour was never exercised.

**Remediation.** Recognise `FetchTimeoutError` by name and `ETIMEDOUT`, map to
`TIMEOUT` with `504 Gateway Timeout`, and run the check before the generic network
heuristic so "refused" and "too slow" stay distinguishable. Covered by tests using
the exact rejection type.

### 17. The Royalty admin hand-off was one-way

**Evidence.** `set_contracts` transfers the Royalty admin role to the Factory so
the Factory's cross-contract `configure_royalty` calls authenticate. No Factory
entry point forwarded `upgrade`, so after wiring the Royalty contract's admin was a
contract with no path to upgrade it.

**Why it matters.** The Royalty contract holds a `RoyaltyConfig` layout, which makes
it one of the most likely contracts to need a change. A defect in it would have
been unfixable in place, forcing a fresh deployment and the loss of every
configured royalty — the opposite of what the upgrade path exists for. Found by
writing the deployment runbook, which is an argument for writing operational
documentation before it is needed.

**Remediation.** Add an admin-only `set_royalty_admin(new_admin)` on the Factory
that invokes the Royalty contract's `set_admin` on its behalf, rejecting the zero
account. The recovery sequence is
`set_royalty_admin(deployer)` → `royalty.upgrade(hash)` →
`set_royalty_admin(factory)`. The new function changes the Factory's interface; the
ABI gate (finding 10) flagged it, and the committed snapshot was regenerated in the
same commit. The sequence is documented in the runbook.

### 18. This document contradicted itself

**Evidence.** The status table marked findings 6 and 11 as `Open` while the
remediation log below it described both as fixed, and several rows had been merged
into single malformed lines by an editing error.

**Why it matters.** A review is only useful if its status claims are true; one that
reports fixed findings as open is as misleading as a backlog that reports open work
as done (finding 8). It was also the document most likely to be read first.

**Remediation.** Table rebuilt, statuses reconciled against the remediation log, and
this pass's findings (16–18) added.

---

## What is already strong

Reviewing honestly cuts both ways, and these are not accidents:

- **Typed storage keys** (`#[contracttype] enum NftKey`) instead of string keys.
  Eliminates a heap allocation per access and makes key typos compile errors.
- **Explicit TTL management.** Every write extends entries to the network maximum
  and reads bump past half-life, so ownership records cannot silently archive.
  Most Soroban projects ship without this and discover it in production.
- **A dense per-owner ownership index** with swap-removal, making `balance_of` O(1)
  and `tokens_of_owner` paginated rather than a scan to `total_supply`.
- **Approvals match ERC-721 semantics** including `transfer_from`, blanket approval
  and approval invalidation on transfer.
- **URI scheme validation** (`https`/`http`/`ipfs`) at every write path, closing a
  stored-XSS vector that is easy to miss when URIs are rendered as images.
- **Event assertions in the contract tests.** Rare and valuable.
- **A bounded, LRU-evicting rate limiter** shared by middleware and route handlers,
  with `X-RateLimit-*` headers on both the success and rejection paths.
- **Upload hardening**: size cap, MIME allowlist, per-IP limits, schema validation
  and CID verification, all backed by tests.
- **A consistent error envelope** `{ error: { code, message } }` and a normalizer
  that maps Soroban/Horizon failure shapes onto it.
- **Atomic, bounded batch minting**, plus an indexer progress signal on
  `/api/health` so a stalled feed is alertable rather than only logged.

---

## Remediation log

Findings are fixed one commit at a time, each with tests that fail against the old
behaviour. [`../improvements/plan.md`](../improvements/plan.md) tracks what is
fixed, with a pointer to the file or test that demonstrates it.

All eighteen findings above are fixed. What remains open is tracked in
[`../../ISSUES.md`](../../ISSUES.md):

- **Per-collection supply caps.** `MAX_SUPPLY` is a single global constant; a
  creator cannot express "this drop is limited to 100".
- **Metadata content commitment.** `metadata_uri` is validated but never hashed, so
  a provider could serve different attributes than were reviewed at mint time.
- **Durable indexer storage.** The event store is per-instance and in memory, so it
  cannot answer historical queries and is inconsistent across instances.
- **A shared rate-limit store.** The limiter is per instance, so limits multiply
  under horizontal scaling.
- **End-to-end smoke tests.** The critical path is covered by unit and component
  tests that stub every boundary, so an integration break against a real RPC would
  not be caught.

Anything not marked _Fixed_ above should be treated as unverified. Neither this
review nor the status document asserts correctness for it.

## Out of scope for this pass

These are **not** optional for mainnet, are deliberately excluded here, and are
tracked with owners and rationale in [`../mainnet-readiness.md`](../mainnet-readiness.md):

- Third-party security audit of the five contracts.
- Admin key custody (hardware wallet or HSM), rotation policy, and a documented
  recovery procedure for a lost admin key.
- Durable indexer storage; the current store is per-instance and in memory.
- Mainnet deployment, contract migration and state transfer from testnet.
- Independent verification of Pinata's retention guarantees and a durable pinning
  fallback.
