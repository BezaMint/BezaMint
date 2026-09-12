# Architecture

How BezaMint fits together: five Soroban contracts on Stellar, a Next.js app that
talks to them directly from the browser for writes, and a small server-side layer
for reads, uploads and metadata resolution.

This document describes the system as it is implemented. Where something is
deliberately unfinished or left to an integrator, it says so.

---

## 1. The shape of the system

```text
                    ┌──────────────────────────────┐
   browser ────────▶│  Next.js app (apps/web)      │
   (Freighter)      │                              │
                    │  client: direct RPC writes   │
                    │  server: /api/* reads        │
                    └───────┬──────────────┬───────┘
                            │              │
              Soroban RPC   │              │  Pinata / IPFS gateways
                            ▼              ▼
        ┌───────────────────────────┐   ┌──────────────┐
        │  Stellar / Soroban        │   │  IPFS        │
        │                           │   │  (metadata + │
        │  BezaMintFactory          │   │   images)    │
        │    ├─ BezaMintNft         │   └──────────────┘
        │    ├─ BezaMintCollection  │
        │    ├─ BezaMintRoyalty     │
        │    └─ BezaMintCreator     │
        └───────────────────────────┘
```

Writes (mint, transfer, create collection, register creator) are **client-side**:
the browser builds the transaction, hands it to Freighter for signing, and submits
it. There is no server-side signing key, so there is no custody risk on the server
and no ability for the backend to act as a user.

Reads are **server-side** through `/api/*`, which lets the app cache, rate-limit,
validate and normalize errors in one place instead of every component talking to
RPC directly.

---

## 2. The five contracts

### `BezaMintNft` — the token registry

One instance serves every collection on the platform. Token ids come from a
monotonic counter and are never recycled, including after a burn.

State lives in typed keys (`NftKey`) rather than string keys: `Owner(token_id)`,
`Data(token_id)`, `Approval(token_id)`, `OperatorApproval(owner, operator)`, plus a
**dense per-owner index** (`OwnedCount`, `OwnedToken`, `OwnedIndex`) that makes
`balance_of` a single read and `tokens_of_owner` paginated, instead of a scan to
`total_supply`.

Authorization:

| Function                           | Who must authorize                          |
| ---------------------------------- | ------------------------------------------- |
| `mint`                             | the recipient (`to`)                        |
| `transfer`                         | the current owner (`from`)                  |
| `transfer_from`                    | the approved spender, with a valid approval |
| `approve` / `set_approval_for_all` | the token owner                             |
| `burn`                             | the token owner                             |
| `set_admin`                        | the contract admin                          |
| `upgrade`                          | the contract admin                          |

Approvals follow ERC-721 semantics (`getApproved` / `isApprovedForAll`), and a
transfer invalidates the previous owner's per-token approval so an old operator
cannot immediately move the token again.

### `BezaMintCollection` — the collection registry

Collections are creator-owned. A collection keeps `nft_count` directly, a dense
per-creator index (`CreatorCollections`) so listing a creator's work never scans
another creator's, and a reverse mapping (`NftCollection`) so a token belongs to at
most one collection.

`add_nft` and `remove_nft` are **collection-creator-gated**, enforced inside the
cross-contract call from the Factory, and `add_nft` refuses archived, full and
already-assigned collections. Archived collections reject updates and new members.

### `BezaMintRoyalty` — royalty terms

Stores a `RoyaltyConfig` per target (an NFT id or a collection id): a basis-point
rate, an optional recipient split, and a frozen flag.

| Function                                          | Who must authorize                                             |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `configure_royalty`                               | the royalty admin (the Factory in production), once per target |
| `update_royalty`                                  | the recorded creator, or the admin; refused when frozen        |
| `freeze_royalty` / `remove_royalty` / `set_admin` | the admin                                                      |
| `upgrade`                                         | the admin                                                      |

A recipient map must be empty (meaning 100% to the creator) or sum to exactly 100
across at most 10 recipients.

`quote_royalty(target_id, is_collection, sale_price)` is the settlement primitive:
it returns the exact per-recipient payout for a sale, with the rounding remainder
assigned to the final recipient so the amounts always sum to precisely
`sale_price × rate ÷ 10_000`. A bare NFT transfer carries no payment, so the
contracts cannot collect royalties themselves; **settlement is the marketplace's
responsibility**, and `quote_royalty` is what removes the ambiguity about who is
owed what.

### `BezaMintCreator` — creator profiles

One profile per address, keyed by that address, holding a display name, bio,
optional avatar/banner URIs and up to 8 social links. Registration, updates and
social links are creator-gated; `verify_creator` is admin-gated.

Validation is strict because these strings are rendered into the DOM: profile URIs
must be `https`, `http` or `ipfs`, social platforms must be on a fixed allowlist,
and social URLs must be `https`/`http`. This closes a stored-XSS vector that a
permissive URL field would otherwise leave open.

### `BezaMintFactory` — the entry point

The user-facing contract that composes the other four atomically:

- **`mint_with_royalty(caller, to, collection_id, metadata_uri, basis_points)`**
  mints the NFT, links it to the collection and configures its royalty in one
  invocation. If any step fails the whole call reverts: no orphan tokens, no
  unlinked mints, no partially configured royalties.
- **`mint_batch_with_royalty(caller, to, collection_id, metadata_uris, basis_points)`**
  runs that same sequence for every URI in a batch bounded by `MAX_BATCH_MINT` (25),
  inside one invocation. A drop is therefore minted in one transaction and either
  completes fully or reverts fully; a ten-piece collection no longer costs ten
  signatures, ten fees and ten chances to be left half-finished. Each token emits
  its own `NftMinted` event, so the event stream keeps one shape.
- **`burn_nft(caller, collection_id, token_id)`** burns the token and removes it
  from its collection, so `nft_count` cannot drift from reality.
- **`create_collection_for_creator(caller, metadata_uri)`** creates the collection
  and auto-registers the creator if they have no profile yet.
- **`set_contracts(nft, collection, royalty, creator)`** wires the platform and
  hands the Royalty admin role to the Factory. It rejects the zero account, the
  Factory's own address, and duplicates.
- **`set_royalty_admin(new_admin)`** moves the Royalty admin role on the Factory's
  behalf. It exists so the hand-off above is reversible: otherwise the Factory
  would hold the role and forward no `upgrade`, and the Royalty contract could
  never be upgraded again.
- **`set_admin(new_admin)`** transfers the Factory's own admin role. The Factory
  admin can rewire every contract slot and seize the Royalty role, so it is the
  most privileged key in the system and the one most in need of rotation.

Every cross-contract mutation delegates its authorization to the callee, and the
Factory's `configure_royalty` call authenticates because `set_contracts` transferred
that role to it.

---

## 3. Initialization and upgrades

Every contract initializes through a Soroban **`__constructor`**, which the host
runs inside contract creation. This is deliberate: an earlier design used a public
`initialize()` after deployment, and because deployment and initialization are two
separate transactions, anyone could call `initialize` first and seize the admin
role. A constructor has no such window.

`upgrade(new_wasm_hash)` is admin-only (`update_current_contract_wasm`), preserving
all storage. `set_admin(new_admin)` is likewise admin-only on **all five** contracts:
it moves the admin role and emits `AdminChanged`, so the role is rotatable rather
than welded to the deployer address. The zero account is rejected, because Soroban
has no null address and an admin that cannot sign is indistinguishable from no admin
at all. There is no downgrade protection beyond the admin key, so that key must be
held operationally — see [`mainnet-readiness.md`](./mainnet-readiness.md) for custody,
and [`deployment-runbook.md`](./deployment-runbook.md) for the rotation procedure.

Because storage survives an upgrade, the code that reads it may not match the code
that wrote it. Every contract declares a `STORAGE_VERSION`, exposes it through
`version()`, and asserts it at the top of every mutating function. When a release
changes the persisted layout it bumps `STORAGE_VERSION`, and the admin runs
`migrate(from_version)` after `upgrade`: until then, mutations fail with a named
error rather than decoding old entries into a new struct and returning garbage. The
full procedure, including why a rollback after a migration is not a simple
`upgrade`, is in [`deployment-runbook.md`](./deployment-runbook.md).

---

## 4. Storage lifetime

Soroban entries silently archive when their TTL elapses and then read as missing, so
an ownership record that expired would make an NFT appear to vanish while the
counter still counted it. Every contract therefore applies the same policy:

- **Writes** extend the touched persistent entries to the network maximum
  (`TTL_LEDGERS` = 6,312,000, about a year at 5s per ledger) and refresh instance
  data + contract code.
- **Hot reads** (`owner_of`, `token_data`, `balance_of`, `get_collection`,
  `get_profile`, `get_royalty`) bump entries that have fallen below half-life, so
  actively used records stay alive indefinitely.

This is a real correctness requirement on Stellar, not an optimisation, and it is
why the TTL helpers appear on nearly every path.

---

## 5. Events and the off-chain indexer

Each contract publishes a single topic (its name) and puts a typed enum in the event
data:

```text
topics: [ Symbol("factory") ]
data:   ScVal::Vec([ Symbol("NftMinted"), U64(token_id), Address(actor) ])
```

`scValToNative` turns that into `['NftMinted', 42n, 'G...']`, so the indexer decodes
by **variant name** — a position-independent match that survives enum reordering.
See [`indexer-schema.md`](./indexer-schema.md) for the full event list and the
mapping into the server-side store.

The indexer polls Soroban RPC starting at `latestLedger − lookback` on a cold start and
advancing by cursor afterwards, and keeps the most recent 500 events in memory. The
lookback is bounded because the RPC's **event** retention is much shorter than its
**ledger** retention, and the two figures are easy to confuse: `getHealth()` reports a
`ledgerRetentionWindow` of ~120,960 ledgers (~7 days), while events were measurably
served only from the most recent ~10,500 ledgers. A request from further back returns
an empty page rather than an error, which is why the lookback is clamped to 10,000.
Two consequences worth stating plainly:

- It is a **recent-activity** feed, not a full history. A durable backfill (a real
  store, cursor checkpoints across restarts) is the next step for scale.
- Because the store is in-process, it is per-instance on a multi-instance
  deployment.

---

## 6. Request path and hardening

API routes sit behind `middleware.ts`, which applies a per-IP fixed-window rate limit
with `X-RateLimit-*` headers, a CORS allowlist (same-origin unless
`CORS_ALLOWED_ORIGINS` is set), hardening headers, and request logging with
durations. It also **authorizes mutating requests**: `POST`, `PUT`, `PATCH` and
`DELETE` on `/api/*` must present `x-api-key` (when `API_WRITE_KEY` is set) or come
from the deployment's own origin, because a browser cannot hold a shared secret and
a public upload endpoint would otherwise be usable from any page on the internet.
Reads are left open. [`api-reference.md`](api-reference.md#authorizing-a-mutating-request)
documents the rule in full. Routes normalize failures through one error module into a stable envelope:

```json
{ "error": { "code": "BAD_REQUEST", "message": "..." } }
```

Uploads are the most exposed surface, so `/api/ipfs/upload` enforces a size cap, a
MIME allowlist, a per-IP limit, JSON-schema validation of the metadata, and CID
verification against the pinned bytes before reporting success.

`/api/health` is a readiness probe: it answers 503 unless the RPC is reachable, every
contract ID is configured, and the IPFS gateway responds when Pinata is configured.
`/api/health/live` answers 200 whenever the process is serving, so a dependency blip
cannot trigger a restart loop.

---

## 7. Package layout

```text
apps/web            Next.js app: routes, API handlers, UI, services
packages/shared     Types, constants and validation shared by app and tests
contracts/          Five Soroban crates + rust-toolchain.toml + wasm size budgets
scripts/            deploy.sh, verify-deploy.sh, prebuild-check.sh, size checks
docs/               This file plus the schema, caching, design-token and review docs
```

`packages/shared` is imported by path rather than published, so contract limits and
constants have one definition that both the app and its tests read.
