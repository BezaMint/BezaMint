# BezaMint — Contributor Backlog

Work that is genuinely open, verified against the current tree. Each entry names
the problem, the evidence, and acceptance criteria a reviewer can check
objectively.

> **History.** This file previously listed 100 issues, most of which had since
> been implemented — `transfer_from`, duplicate-token rejection, collection
> pagination, owner token enumeration, approval invalidation and the indexer were
> all described as missing while being present in the code. A backlog that
> describes solved problems wastes contributor time and misrepresents the project
> to reviewers, so it has been rebuilt around what is actually left.

Start with [`docs/architecture.md`](docs/architecture.md) for how the system fits
together and [`contracts/README.md`](contracts/README.md) for the interface
reference. [`docs/review/critical-review.md`](docs/review/critical-review.md)
records the findings that have been fixed and the ones still open.

---

## Contracts

### 1. [nft] Batch mint

**Problem.** `mint_with_royalty` mints one token per transaction, so a ten-piece
drop costs ten signatures and ten sets of fees.

**Acceptance criteria.** A bounded batch entry point on the Factory that mints N
tokens, links each to the collection and applies one royalty configuration, all
atomically; a test proving a mid-batch failure reverts the whole call; a
documented maximum batch size.

### 2. [nft] Per-collection supply cap

**Problem.** `MAX_SUPPLY` is a single global constant. A creator cannot express
"this drop is limited to 100".

**Acceptance criteria.** An optional per-collection cap consulted by `mint`,
falling back to the global limit; tests at the cap, cap − 1 and cap + 1.

### 3. [nft] Metadata content commitment

**Problem.** `metadata_uri` can point anywhere and is never hashed, so a
provider can serve different attributes than were reviewed at mint time. The
frontend renders whatever the URI returns.

**Acceptance criteria.** An optional on-chain digest recorded at mint, exposed by
`token_data`, with the frontend's metadata resolver verifying it and surfacing a
mismatch instead of rendering unverified metadata.

### 4. [contracts] Enforce the storage version

**Problem.** `initialize` writes `Version = 1` in every contract and nothing ever
reads it. After an `upgrade` that changes a stored layout, old entries would be
decoded into the new struct and read as garbage rather than failing.

**Acceptance criteria.** A documented versioning convention, a `version()` getter,
a check on the mutating paths that fails loudly on a mismatch, and a test that a
mismatched version is rejected.

### 5. [royalty] Marketplace settlement reference

**Problem.** `quote_royalty` computes who is owed what, but nothing demonstrates
how a marketplace would actually pay it out. The gap between "quoted" and "paid"
is where an integrator has to make design decisions.

**Acceptance criteria.** A documented settlement flow (order of operations,
who signs, failure handling) and, if the project wants one, an example settlement
contract with tests. Otherwise an explicit statement in
[`docs/mainnet-readiness.md`](docs/mainnet-readiness.md) that no settlement
implementation is provided.

---

## Backend / API

### 6. [api] Durable indexer storage and cursor checkpoints

**Problem.** `apps/web/src/lib/server/indexer.ts` keeps the most recent 500 events
in process memory. It is per-instance on a multi-instance deployment, lost on
restart, and cold-starts only within the RPC's ~17,280-ledger retention window, so
it cannot answer historical queries at all.

**Acceptance criteria.** A persistent store fed by a poller that checkpoints its
cursor, so a restart resumes instead of truncating history; a documented schema;
backfill from a known ledger; the in-memory path retained as a read-through cache.

### 7. [api] API reference documentation

**Problem.** There is no description of the `/api/*` surface: endpoints, query
parameters, response shapes, error codes or rate limits. Integrators have to read
the route handlers.

**Acceptance criteria.** A reference covering every route with its parameters, a
success response example, the `{ error: { code, message } }` envelope and its
codes, pagination parameters, and the rate-limit headers.

### 8. [api] Observability beyond logs

**Problem.** Request logs exist with durations and request IDs, and `/api/health`
covers readiness, but nothing emits a signal a system outside the process can
alert on — for example, that the indexer has stopped advancing its cursor.

**Acceptance criteria.** A documented metric or event for indexer progress and
route error rates, wired to something alertable; an alert rule that fires when the
indexer stalls.

---

## Tooling / CI

### 9. [ci] Coverage threshold

**Problem.** `apps/web/vitest.config.ts` has no coverage configuration, so coverage
can regress silently and no reviewer can see what the suite actually exercises.

**Acceptance criteria.** Coverage collection in CI with a documented threshold that
fails the build below it, and the report uploaded as a build artifact.

### 10. [ci] Contract ABI drift check

**Problem.** Nothing verifies that `apps/web/src/services/contracts.ts` still
matches the contract interfaces. Argument order is constructed by hand, and a
mismatched call fails only at runtime, in simulation, for a user.

**Acceptance criteria.** Exported contract interfaces committed to the repository
and a CI job that fails when a build would change them, plus a documented procedure
for updating the frontend when an interface changes.

### 11. [tests] End-to-end smoke tests

**Problem.** There are no E2E tests. The critical path — connect wallet, create a
collection, mint, view the result — is covered only by unit and component tests
that stub every boundary, so an integration break between the app and the RPC
would not be caught.

**Acceptance criteria.** A browser-driven smoke suite for the mint flow against a
testnet deployment, run on a schedule or before release.

### 12. [perf] Bundle size budget

**Problem.** The Next.js output can grow without anyone noticing; no CI check
measures it.

**Acceptance criteria.** A documented budget for the client bundle and a CI check
that fails when a pull request exceeds it.

---

## Documentation

### 13. FAQ and troubleshooting

**Problem.** Recurring questions — Freighter setup, testnet funding, why a
transaction failed, IPFS/Pinata limits — are answered only if the reader finds the
right source file.

**Acceptance criteria.** A FAQ covering wallet setup, testnet funding via
Friendbot, IPFS limits and the common Soroban error codes, each linking to the
deployment or architecture doc it relates to.

### 14. Glossary

**Problem.** Soroban, ledger, TTL, stroop, basis points, archiving, contract wasm
hash — the domain vocabulary is unfamiliar to new contributors and to reviewers
from outside the ecosystem.

**Acceptance criteria.** A glossary covering the terms used across the docs and
the contract source.

### 15. Deployment runbook

**Problem.** `docs/mainnet-readiness.md` says what must be true before launch, but
there is no operational runbook: how to deploy, how to verify, how to roll back,
and how to upgrade a contract in place.

**Acceptance criteria.** A step-by-step runbook covering a fresh testnet deploy,
verification, an in-place upgrade via `upgrade`, and the rollback procedure, each
with the commands and the expected output.

---

## Labels

`contracts` · `frontend` · `backend` · `tests` · `ci` · `docs` · `enhancement` ·
`bug` · `security` · `performance` · `accessibility` · `good-first-issue` ·
`help-wanted`

Difficulty mapping: **Easy** → `good-first-issue`; **Medium** → `help-wanted`;
**Hard** → `help-wanted` plus `design-decision-needed`.
