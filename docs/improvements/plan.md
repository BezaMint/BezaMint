# Implementation Status

What has been done, what is open, and where the evidence is.

> **History.** This file previously held a 250-item checklist (50 each across
> frontend, backend, contracts, tooling and docs). The checklist was aspirational
> and its status markers stopped matching the tree almost immediately: the
> frontend and backend sections were reported as almost entirely complete while
> unchecked, and the contract section reported items as missing that had already
> shipped — `transfer_from`, duplicate-token rejection, collection pagination,
> owner token enumeration, approval invalidation, archived-collection guards and
> URI-scheme validation were all present and unmarked.
>
> A status document that is wrong is worse than no status document, because people
> plan against it. This version is derived from the code, and every claim is
> checkable against the file it names. The original list remains in git history.

---

## Where the project stands

The contract layer is the strongest part of the tree: typed storage keys, explicit
TTL management, ERC-721-shaped approvals with operator transfers, a dense
per-owner ownership index, pagination on every unbounded read, and a test suite
that pins emitted event schemas. The API layer has a real error envelope, a
bounded rate limiter, upload hardening and metadata schema validation.

The two things that blocked a production release were **silent failures**: code
that looked correct, passed its tests, and returned wrong answers. Both are now
fixed, and the tests that certified them are rewritten to fail against the old
behaviour:

1. The event indexer decoded a topic layout the contracts never emit, so it
   discarded every event without erroring and every indexed endpoint returned
   `200 OK` with an empty list.
2. `initialize()` was publicly callable after deployment, so anyone could claim
   the admin role in the window between deploying a contract and initializing it.
   On the Factory that meant control of every mint, burn and collection.

The full findings, their evidence, and what remains out of scope are in
[`../review/critical-review.md`](../review/critical-review.md). The contributor
backlog is [`../../ISSUES.md`](../../ISSUES.md).

---

## Fixed

| Area      | Change                                                                                                                                                                    | Evidence                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| API       | Indexer decodes events by variant **name** from the event data, matching how the host actually encodes a `#[contracttype]` enum; legacy two-topic form kept as a fallback | `apps/web/src/lib/server/indexer.ts`, `indexer.test.ts`  |
| API       | Indexer starts from `latestLedger − lookback` (clamped, overridable via `INDEXER_LOOKBACK_LEDGERS`) and advances by RPC cursor, instead of an invalid `startLedger: 0`    | same                                                     |
| API       | Readiness now depends on the contract configuration; a build with no contract IDs answers 503, not 200                                                                    | `apps/web/src/app/api/health/route.ts` + its first tests |
| Contracts | Initialization moved into a Soroban `__constructor` on all five contracts, removing the front-run window entirely                                                         | `contracts/*/src/lib.rs`, `scripts/deploy.sh`            |
| Contracts | `set_contracts` rejects the zero account, self-reference and duplicate addresses                                                                                          | `contracts/factory/src/lib.rs` + tests                   |
| Contracts | Factory wiring getters name the unset slot instead of panicking anonymously                                                                                               | `contracts/factory/src/lib.rs` + test                    |
| Contracts | `quote_royalty` computes the exact per-recipient payout for a sale, with exact rounding and overflow checking                                                             | `contracts/royalty/src/lib.rs` + tests                   |
| Contracts | The inclusive side of the 512-byte URI limit is tested for NFT `mint` and Creator `register`                                                                              | `contracts/{nft,creator}/src/test.rs`                    |
| Tooling   | A guard fails the suite if the dependency security overrides or their resolved versions are lost                                                                          | `apps/web/src/lib/__tests__/supply-chain.test.ts`        |
| Tooling   | The typecheck that was red on `main` passes again                                                                                                                         | `apps/web/src/lib/__tests__/env-example.test.ts`         |
| Docs      | Architecture overview and mainnet readiness checklist exist                                                                                                               | `docs/architecture.md`, `docs/mainnet-readiness.md`      |
| Docs      | `contracts/README.md` is the authoritative interface reference, with the authorization requirement for every function                                                     | `contracts/README.md`                                    |
| Docs      | The root README no longer duplicates contract tables it had let drift                                                                                                     | `README.md`                                              |

---

## Open

Contract work:

- Batch mint, per-collection supply caps, on-chain metadata commitment, and
  enforcement of the stored storage version. See `ISSUES.md` §1–4.
- Marketplace settlement is **not implemented and not in scope**; `quote_royalty`
  makes the obligation exact, and `docs/mainnet-readiness.md` states the boundary.

Backend:

- The indexer is in-memory, per-instance, and recent-only. Durable storage with
  cursor checkpoints is the next substantial piece. See `ISSUES.md` §6.
- API reference documentation and alertable observability. `ISSUES.md` §7–8.

Tooling:

- Coverage threshold, contract ABI drift check, end-to-end smoke tests, and a
  bundle-size budget. See `ISSUES.md` §9–12.

Documentation:

- FAQ, glossary and a deployment runbook. See `ISSUES.md` §13–15.

---

## How this file stays honest

Two rules, learned from the previous revision:

1. **Status comes from the code, not from intent.** An item is done when the file
   it names demonstrates it and a test covers it. Nothing is marked done because
   it was planned or because a similar item was.
2. **Every claim is checkable.** Each row names the file or the test to inspect,
   so a reader can falsify it in a minute. Claims that could not be verified were
   corrected or removed — including two findings in the review that turned out to
   be based on stale roadmap entries rather than on the tree.
