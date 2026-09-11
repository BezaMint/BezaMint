# BezaMint — Critical Review

An adversarial, evidence-based review of the BezaMint monorepo against production
readiness criteria: correctness on the Stellar/Soroban network, security of the
five contracts, honesty of the API layer, and the engineering hygiene a reviewer
or auditor will check first.

Every finding below cites the file and the observable behaviour that produced it.
Findings are ordered by blast radius, not by ease of fix. Remediation status is
tracked in the table at the end and in [`../../docs/improvements/plan.md`](../improvements/plan.md).

Scope: this review targets **testnet deployment**. Mainnet migration, key custody
in an HSM, and a third-party audit are explicitly out of scope and remain release
blockers for mainnet (see [`mainnet-readiness.md`](./mainnet-readiness.md)).

---

## Verdict

The repository is **not yet production-ready**, but it is close and the gap is
concentrated rather than diffuse. The contract layer is unusually mature for a
project at this stage — typed storage keys, explicit TTL management, ERC-721-shaped
approvals, dense per-owner ownership indexes, archived-collection guards, and a
test suite that asserts emitted events. The web layer, similarly, has a real
error-envelope, a bounded rate limiter, an upload guard, and a metadata schema.

What blocks release is a small number of **silent failures**: things that look
correct, pass tests, and return wrong answers in production. Those are the most
dangerous class of bug because they survive every green check.

| #   | Severity     | Area      | Finding                                                                                                                                           | Status |
| --- | ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Critical** | API       | Event indexer decodes a topic layout the contracts never emit; every indexed endpoint is silently empty                                           | Fixed  |
| 2   | **Critical** | API       | Indexer requests `startLedger: 0`, outside the RPC retention window; the request itself fails                                                     | Fixed  |
| 3   | **Critical** | Contracts | `initialize()` is front-runnable: deploy and init are separate transactions, so an attacker can seize the admin role                              | Fixed  |
| 4   | **High**     | Tooling   | Security overrides live in a `package.json` field pnpm 9 honours but has deprecated and pnpm 10 removes; nothing guards against a silent pin loss | Fixed  |     | 5   | **High** | Contracts | Secondary-sale royalties are configured but never collected; the platform's core promise is unimplemented | Fixed |
| 6   | **High**     | Contracts | `set_contracts` accepts zero and self addresses; a wiring mistake bricks the mint path with no recovery path                                      | Open   |
| 7   | **High**     | API       | The indexer test asserts the same wrong wire format as the code, so a green suite certifies a broken feature                                      | Fixed  |
| 8   | **High**     | Docs      | `ISSUES.md` advertises 100 open issues, most of which are already implemented; it misrepresents the project to contributors and reviewers         | Open   |
| 9   | **High**     | Contracts | Storage `Version` keys are written but never read, so a schema change corrupts reads silently                                                     | Open   |
| 10  | **High**     | Tooling   | CI has no coverage gate, no wasm ABI drift check, and no bundle budget; regressions are invisible                                                 | Open   |
| 11  | **Medium**   | Contracts | Factory getters panic with a bare `unwrap()` and are unusable before wiring                                                                       | Open   |
| 12  | **Medium**   | Contracts | No batch mint; a 10-piece drop costs 10 transactions                                                                                              | Open   |
| 13  | **Medium**   | Contracts | No boundary tests at the 512-byte metadata-URI limit (511/512/513)                                                                                | Open   |
| 14  | **Medium**   | API       | Health endpoint reports no build identity, so a stale deployment is indistinguishable from a fresh one                                            | Open   |
| 15  | **Medium**   | Docs      | No architecture overview or contract interface reference for integrators                                                                          | Open   |

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
invocations** (lines checked: `soroban contract deploy` followed by
`init_if_needed ... initialize --admin ...`). Between those two transactions any
observer can call `initialize` with their own address, satisfy `require_auth()` with
their own signature, and become admin. On the Factory contract that is total
compromise: the attacker can `set_contracts` to hostile addresses and every mint,
burn and collection creation routes through their code.

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

This is not a bug so much as an unfinished core feature that the README presents as
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
responsibility, because a bare NFT `transfer` carries no payment for the
contracts to hook, and that boundary is now documented in the contract itself.

### 6. `set_contracts` accepts unusable addresses

`set_contracts` writes whatever it is handed:

```rust
env.storage().instance().set(&FactoryKey::NftContract, &nft);
```

There is no zero-address check, no self-reference check, and no duplication check.
A typo in one address produces a Factory that permanently panics on every mint
(`Factory: NFT contract not set` never fires — the value _is_ set, it is just wrong),
and the only recovery is another admin call, which is exactly the point: the guard
should exist so the misconfiguration is rejected at the moment it is made rather
than discovered by users. This also makes `set_contracts` idempotent-safe for
re-pointing after an upgrade.

**Remediation.** Reject the zero account, reject the Factory's own address, and
reject duplicate addresses across the four slots.

### 7. A green test suite certifies a broken feature

`apps/web/src/lib/server/__tests__/indexer.test.ts` builds fixtures with

```ts
topic: [scvSymbol('factory'), scvU32(variant)];
```

This is the same incorrect assumption as the code under test (finding 1). The suite
passes, the feature does not work. A test that encodes the implementation's
misconception is worse than no test: it converts an unknown-unknown into a
believed-known.

**Remediation.** Rebuild the fixtures from the host's real encoding (verified above)
so the test would fail against the old decoder.

### 8. The public issue backlog misrepresents the project

`ISSUES.md` announces "100 Contributor Issues" and describes many already-solved
problems as open: `transfer_from` is missing (it exists), `add_nft` allows
duplicates (it is guarded), pagination is absent (it is implemented), approvals are
dead code (they work). `docs/improvements/plan.md` has the same problem in the
opposite direction: it tracks 250 improvements with the frontend and backend largely
complete but unchecked, so the document reads as a project that has done nothing.

Both files are the first thing a contributor or reviewer reads. They currently
damage the project's credibility more than any missing feature.

**Remediation.** Regenerate both against the actual tree, with a per-item status
and an evidence pointer.

### 9. Storage versions are written but never enforced

`initialize` writes `Version = 1` in every contract, and no read path ever consults
it. The intent — a schema-versioned store that refuses to read data written by a
future version — is documented in the roadmap but not implemented, so a post-upgrade
contract could read a struct laid out differently and produce garbage rather than a
clear error.

**Remediation.** Add a `version()` getter and a shared `assert_version` helper
invoked on the mutating paths, plus a test that a mismatched version fails loudly.
Document the migration convention.

### 10. CI verifies compilation, not correctness

`.github/workflows/ci.yml` runs lint, format, typecheck, unit tests, clippy, rustdoc
and wasm size checks — a genuinely strong baseline. What is missing: a coverage
threshold, an ABI/wasm-hash drift check that would catch a frontend/contract
argument-order divergence, and a bundle-size budget. All three classes of regression
are currently invisible.

---

## Medium findings

### 11. Factory getters panic opaquely

`get_nft_contract` and friends call `.unwrap()`, producing a host-level "unexpected
panic" with no message when the contract is unwired. Every other error path in the
codebase uses a prefixed message (`Factory: ...`). This is a small consistency bug
with an outsized effect on debuggability, because these getters are exactly what
deploy tooling calls to verify wiring.

### 12. No batch mint

`mint_with_royalty` mints one token per transaction. A ten-piece collection costs
ten signatures and ten fees. A batch entry point is a straightforward, high-value
addition provided it is atomic and bounded.

### 13. No boundary tests at the URI limit

Length caps are asserted for values comfortably under and over the limit, but not
at exactly 511, 512 and 513 bytes. Off-by-one errors in `<=` versus `<` are the
classic failure mode for exactly this kind of guard, and the collection update path
previously had no validation at all before it was fixed.

### 14. Health endpoint reports no build identity

`/api/health` checks contract configuration and upstream reachability but cannot
answer "which build is this?". During a rolling deploy that ambiguity makes a stale
instance indistinguishable from a healthy one.

### 15. No architecture or interface documentation

There is no single document explaining how the five contracts compose, what each
public function's authorization requirement is, or how the off-chain indexer maps
events to storage. Integrators must reverse-engineer it from Rust, which is how
argument-order mistakes are made.

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

---

## Remediation log

Findings above are fixed in the order listed under "Execution" in the improvement
plan, one commit per item, each with tests. Anything not yet marked _Fixed_ in the
table at the top is open and should not be assumed correct.

## Out of scope for mainnet

These are **not** optional for mainnet and are deliberately excluded from this pass:

- Third-party security audit of the five contracts.
- Admin key custody (hardware wallet or HSM), rotation policy, and a documented
  recovery procedure for a lost admin key.
- Mainnet deployment, contract migration and state transfer from testnet.
- Independent verification of Pinata's retention guarantees and a durable pinning
  fallback.
