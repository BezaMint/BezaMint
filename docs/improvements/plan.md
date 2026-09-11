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

| Area      | Change                                                                                                                                                                    | Evidence                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| API       | Indexer decodes events by variant **name** from the event data, matching how the host actually encodes a `#[contracttype]` enum; legacy two-topic form kept as a fallback | `apps/web/src/lib/server/indexer.ts`, `indexer.test.ts`                                  |
| API       | Indexer starts from `latestLedger − lookback` (clamped, overridable via `INDEXER_LOOKBACK_LEDGERS`) and advances by RPC cursor, instead of an invalid `startLedger: 0`    | same                                                                                     |
| API       | Readiness now depends on the contract configuration; a build with no contract IDs answers 503, not 200                                                                    | `apps/web/src/app/api/health/route.ts` + its first tests                                 |
| Contracts | Initialization moved into a Soroban `__constructor` on all five contracts, removing the front-run window entirely                                                         | `contracts/*/src/lib.rs`, `scripts/deploy.sh`                                            |
| Contracts | `set_contracts` rejects the zero account, self-reference and duplicate addresses                                                                                          | `contracts/factory/src/lib.rs` + tests                                                   |
| Contracts | Factory wiring getters name the unset slot instead of panicking anonymously                                                                                               | `contracts/factory/src/lib.rs` + test                                                    |
| Contracts | `quote_royalty` computes the exact per-recipient payout for a sale, with exact rounding and overflow checking                                                             | `contracts/royalty/src/lib.rs` + tests                                                   |
| Contracts | The inclusive side of the 512-byte URI limit is tested for NFT `mint` and Creator `register`                                                                              | `contracts/{nft,creator}/src/test.rs`                                                    |
| Tooling   | A guard fails the suite if the dependency security overrides or their resolved versions are lost                                                                          | `apps/web/src/lib/__tests__/supply-chain.test.ts`                                        |
| Tooling   | The typecheck that was red on `main` passes again                                                                                                                         | `apps/web/src/lib/__tests__/env-example.test.ts`                                         |
| Docs      | Architecture overview and mainnet readiness checklist exist                                                                                                               | `docs/architecture.md`, `docs/mainnet-readiness.md`                                      |
| Docs      | `contracts/README.md` is the authoritative interface reference, with the authorization requirement for every function                                                     | `contracts/README.md`                                                                    |
| Docs      | The root README no longer duplicates contract tables it had let drift                                                                                                     | `README.md`                                                                              |
| Contracts | Every contract enforces the storage schema version on mutating paths, with a `version()` getter and an admin-only `migrate(from_version)`                                 | `contracts/*/src/lib.rs`, `contracts/*/src/test.rs`                                      |
| Contracts | `mint_batch_with_royalty` mints a bounded batch atomically, sharing one mint/link/configure sequence with the single-mint path                                            | `contracts/factory/src/lib.rs` + tests                                                   |
| Contracts | The Royalty admin hand-off is reversible via `factory.set_royalty_admin`, so the Royalty contract can be upgraded in place                                                | `contracts/factory/src/lib.rs` + tests                                                   |
| API       | A hung upstream is reported as `TIMEOUT`/504 instead of falling through to `INTERNAL`/500                                                                                 | `apps/web/src/lib/server/errors.ts` + tests                                              |
| API       | `/api/health` reports indexer progress (`checks.indexer.stalled`) so a stalled feed is alertable                                                                          | `apps/web/src/lib/server/indexer.ts`, health route + tests                               |
| Tooling   | Coverage is measured in CI with a ratcheted threshold and an uploaded report                                                                                              | `apps/web/vitest.config.ts`, `ci.yml`                                                    |
| Tooling   | A contract ABI drift gate verifies the committed `contractspecv0` snapshot against a fresh build                                                                          | `scripts/check-contract-abi.py`, `contracts/abi/`                                        |
| Tooling   | A client bundle-size budget fails the build above a documented ceiling                                                                                                    | `scripts/check-bundle-size.sh`, `ci.yml`                                                 |
| Docs      | API reference, deployment runbook, FAQ and glossary exist, and the README links them as a documentation index                                                             | `docs/api-reference.md`, `docs/deployment-runbook.md`, `docs/faq.md`, `docs/glossary.md` |

---

## Open

Everything below is described, with acceptance criteria, in
[`../../ISSUES.md`](../../ISSUES.md):

Contract work:

- Per-collection supply caps and on-chain metadata commitment (`ISSUES.md` #41 and
  #33).
- Batch minting is implemented for uniform drops; per-item terms are not
  (`ISSUES.md` #132).
- Marketplace settlement is **not implemented**. `quote_royalty` makes the
  obligation exact and `docs/mainnet-readiness.md` states the boundary; whether to
  enforce it on-chain is the scope decision tracked as `ISSUES.md` #25.

Backend:

- Contract addresses are read from the environment without validation
  (`ISSUES.md` #86).
- The indexer is in-memory, per-instance, and recent-only. `/api/health` reports a
  stall, but durable storage with cursor checkpoints is the real fix
  (`ISSUES.md` #130).
- The rate limiter is per instance, so its configured limit is not a real limit
  under horizontal scaling (`ISSUES.md` #131).

Tests:

- Browser-driven end-to-end coverage of the write path, split into a wallet-less
  CI smoke and a funded pre-release run (`ISSUES.md` #93).

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
