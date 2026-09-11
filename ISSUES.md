# BezaMint — Contributor Backlog

Work that is genuinely open, verified against the current tree. Each entry names
the problem, the evidence, and acceptance criteria a reviewer can check
objectively.

> **History.** This file previously listed 100 issues, most of which had since
> been implemented — `transfer_from`, duplicate-token rejection, collection
> pagination, owner token enumeration, approval invalidation and the indexer were
> all described as missing while being present in the code. A backlog that
> describes solved problems wastes contributor time and misrepresents the project
> to reviewers, so it is rebuilt around what is actually left. Items that have
> since been completed are removed rather than marked done; git history keeps them.

Start with [`docs/architecture.md`](docs/architecture.md) for how the system fits
together, [`contracts/README.md`](contracts/README.md) for the interface reference
and [`docs/deployment-runbook.md`](docs/deployment-runbook.md) for operating it.
[`docs/review/critical-review.md`](docs/review/critical-review.md) records the
findings that have been fixed.

---

## Contracts

### 1. [nft] Per-collection supply cap

**Problem.** `MAX_SUPPLY` is a single global constant. A creator cannot express
"this drop is limited to 100".

**Acceptance criteria.** An optional per-collection cap consulted by `mint`,
falling back to the global limit; tests at the cap, cap − 1 and cap + 1.

**Note.** The cap has to live where `mint` can read it. The NFT contract serves
every collection and is not wired to the Collection contract today, so either the
NFT contract gains an admin-only collection-contract pointer and a cross-contract
read, or the cap is enforced in the Factory and documented as bypassable by a
direct `mint`. The first is correct; the second is cheaper and should be rejected.

### 2. [nft] Metadata content commitment

**Problem.** `metadata_uri` can point anywhere and is never hashed, so a provider
can serve different attributes than were reviewed at mint time. The frontend
renders whatever the URI returns.

**Acceptance criteria.** An optional on-chain digest recorded at mint, exposed by
`token_data`, with the frontend's metadata resolver verifying it and surfacing a
mismatch instead of rendering unverified metadata.

### 3. [factory] Batch mint with per-token terms

**Problem.** `mint_batch_with_royalty` mints a bounded batch atomically, but every
token in the batch shares one recipient and one royalty rate. A drop with distinct
recipients, or per-item royalty terms, still costs one transaction per item.

**Acceptance criteria.** Either a documented statement that uniform batches are the
intended scope, or a batch entry point taking per-item terms, bounded and proven
atomic by the same mid-batch-failure test the existing batch has.

---

## Backend / API

### 4. [api] Durable indexer storage and cursor checkpoints

**Problem.** `apps/web/src/lib/server/indexer.ts` keeps the most recent 500 events
in process memory. It is per-instance on a multi-instance deployment, lost on
restart, and cold-starts only within the RPC's ~17,280-ledger retention window, so
it cannot answer historical queries at all.

`/api/health` reports `checks.indexer.stalled` so the failure is alertable, but
alerting is not a fix: the feed still cannot answer history.

**Acceptance criteria.** A persistent store fed by a poller that checkpoints its
cursor, so a restart resumes instead of truncating history; a documented schema;
backfill from a known ledger; the in-memory path retained as a read-through cache.

### 5. [api] Shared rate-limit store

**Problem.** The per-IP limiter in `apps/web/src/middleware.ts` is in memory, so
the effective limit is `limit × instances` on a horizontally scaled deployment and
resets on every deploy. The [API reference](docs/api-reference.md) states this
rather than hiding it, but the limit is not a real limit.

**Acceptance criteria.** A shared store (Redis or equivalent) behind the existing
limiter interface, with the in-memory implementation retained for local
development and tests; a documented failure mode for when the store is unreachable
(fail open or fail closed, deliberately chosen).

---

## Tests

### 6. [tests] End-to-end smoke tests

**Problem.** There are no E2E tests. The critical path — connect wallet, create a
collection, mint, view the result — is covered only by unit and component tests
that stub every boundary, so an integration break between the app and the RPC
would not be caught.

**Acceptance criteria.** A browser-driven smoke suite for the mint flow against a
testnet deployment, run on a schedule or before release.

---

## Labels

`contracts` · `frontend` · `backend` · `tests` · `ci` · `docs` · `enhancement` ·
`bug` · `security` · `performance` · `accessibility` · `good-first-issue` ·
`help-wanted`

Difficulty mapping: **Easy** → `good-first-issue`; **Medium** → `help-wanted`;
**Hard** → `help-wanted` plus `design-decision-needed`.
