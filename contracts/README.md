# BezaMint Contracts

Five `#![no_std]` Soroban contracts. This document is the interface reference:
every public function, its arguments, and exactly who must authorize it.

For how the contracts compose and why, read [`../docs/architecture.md`](../docs/architecture.md).

---

## Local development

The toolchain is pinned in [`rust-toolchain.toml`](./rust-toolchain.toml); `rustup`
picks it up automatically when you work inside this directory.

```bash
# From contracts/
cargo test --workspace                    # unit + integration tests
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps

# Release wasm, then check the per-contract size budget
cargo build --workspace --release --target wasm32-unknown-unknown
bash ../scripts/check-wasm-size.sh
```

From the repository root, the same checks are exposed as pnpm scripts:
`contract:test`, `contract:clippy`, `contract:fmt`, `contract:size`.

---

## Error codes

Every contract raises typed numeric codes rather than formatted panic strings, so
the host reports a failure as `Error(Contract, #N)` — an integer with no name
attached. The number is only meaningful against the enum of the contract that was
called, so decoding one requires knowing which contract was invoked.

[`../docs/error-codes.md`](../docs/error-codes.md) is the published reference:
every code, the variant it names, what raises it and what it means. It is
**generated** from the `#[contracterror]` enums by
[`../scripts/generate-error-catalog.py`](../scripts/generate-error-catalog.py),
which also emits the TypeScript catalog the web app decodes against:

```bash
pnpm run contract:errors         # regenerate after changing an enum
pnpm run contract:errors:check   # verify without writing (CI runs this)
```

The CI job fails if a code is added, renamed or renumbered in Rust without the
catalog being regenerated, because a stale catalog would have the docs and the
client disagreeing about what `#N` means. Variants are append-only: changing the
number of an existing variant changes the meaning of an error already in the
wild.

Release profile settings live in [`Cargo.toml`](./Cargo.toml) and matter for the
deployed artifact: `opt-level = "z"`, `lto = true`, `panic = "abort"`,
`overflow-checks = true`. Overflow checks are intentional — Soroban fees make the
cost of a checked multiply negligible next to the cost of a silent wrap.

---

## Initialization

Every contract takes its admin through a **constructor**, which runs atomically
inside contract creation:

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/bezamint_nft.wasm \
  --source deployer \
  --network testnet \
  -- --admin G...
```

There is no public `initialize`. This is deliberate: a public initializer after
deployment leaves a window between the two transactions in which anyone can claim
the admin role. See `__constructor` in each contract and the note in
[`../docs/architecture.md`](../docs/architecture.md).

Every contract also exposes:

| Function                   | Description                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `get_admin() -> Address`   | Current admin; panics with `... not initialized` if unset          |
| `is_initialized() -> bool` | True once the constructor has run                                  |
| `upgrade(new_wasm_hash)`   | Replace contract code, storage preserved. **Admin only**           |
| `version() -> u32`         | Stored schema version (`0` before the constructor runs)            |
| `migrate(from_version)`    | Advance the stored schema version after an upgrade. **Admin only** |

Every mutating function first asserts that the stored schema version matches the
build's `STORAGE_VERSION`, so an in-place `upgrade` that changed a layout fails
loudly with `storage version N does not match this build (M); run migrate` instead
of decoding old entries into a new struct. `migrate` requires the exact stored
version, refuses to run when already current, and is the only function exempt from
the check because it is what repairs a mismatch. See the upgrade procedure in
[`../docs/deployment-runbook.md`](../docs/deployment-runbook.md).

---

## NFT — `BezaMintNft`

| Function               | Arguments                              | Authorization                  |
| ---------------------- | -------------------------------------- | ------------------------------ |
| `mint`                 | `to, collection_id: u64, metadata_uri` | `to`                           |
| `transfer`             | `from, to, token_id: u64`              | `from` (must be current owner) |
| `transfer_from`        | `spender, from, to, token_id: u64`     | `spender` (must be approved)   |
| `approve`              | `operator, token_id: u64`              | token owner                    |
| `set_approval_for_all` | `owner_addr, operator, approved: bool` | `owner_addr`                   |
| `burn`                 | `token_id: u64`                        | token owner                    |
| `total_supply`         | —                                      | none                           |
| `owner_of`             | `token_id: u64`                        | none                           |
| `token_data`           | `token_id: u64`                        | none                           |
| `balance_of`           | `owner`                                | none                           |
| `tokens_of_owner`      | `owner, start: u64, limit: u32`        | none                           |
| `is_approved`          | `operator, token_id: u64`              | none                           |
| `is_approved_for_all`  | `owner, operator`                      | none                           |

`metadata_uri` must be a non-empty `https`/`http`/`ipfs` URL of at most 512 bytes.
The zero account is rejected as a mint recipient, transfer recipient and approval
operator. A transfer clears the previous per-token approval. `tokens_of_owner`
clamps `limit` to `MAX_PAGE_SIZE` (100).

## Collection — `BezaMintCollection`

| Function                     | Arguments                                    | Authorization                                                      |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `create_collection`          | `creator, metadata_uri`                      | `creator`                                                          |
| `update_collection`          | `creator, id: u64, new_metadata_uri`         | collection creator; refused if archived                            |
| `archive_collection`         | `creator, id: u64`                           | collection creator                                                 |
| `add_nft`                    | `collection_id: u64, token_id: u64`          | collection creator; refused if archived, full, or already assigned |
| `remove_nft`                 | `collection_id: u64, token_id: u64`          | collection creator (idempotent)                                    |
| `total_collections`          | —                                            | none                                                               |
| `get_collection`             | `id: u64`                                    | none                                                               |
| `get_nfts_in_collection`     | `collection_id: u64, start: u64, limit: u32` | none                                                               |
| `get_collection_for_nft`     | `token_id: u64`                              | none                                                               |
| `get_collections_by_creator` | `creator, start: u64, limit: u32`            | none                                                               |

Metadata URIs are validated exactly as in the NFT contract, on create _and_ on
update, so a collection cannot be edited into a state it could never have been
created in. `get_collections_by_creator` skips archived collections, so a page may
contain fewer than `limit` entries. Both paginated reads clamp `limit` to 100.

## Royalty — `BezaMintRoyalty`

| Function                | Arguments                                                                     | Authorization                                |
| ----------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `configure_royalty`     | `creator, target_id: u64, basis_points: u32, recipients, is_collection: bool` | royalty admin; once per target               |
| `update_royalty`        | `caller, target_id, basis_points, recipients, is_collection`                  | recorded creator or admin; refused if frozen |
| `freeze_royalty`        | `target_id, is_collection`                                                    | admin; irreversible                          |
| `remove_royalty`        | `target_id, is_collection`                                                    | admin; refused if frozen                     |
| `set_admin`             | `new_admin`                                                                   | current admin                                |
| `validate_basis_points` | `basis_points: u32`                                                           | none                                         |
| `quote_royalty`         | `target_id, is_collection, sale_price: i128`                                  | none                                         |
| `pay_royalty`           | `target_id, is_collection, asset, payer, sale_price: i128`                    | `payer`                                      |
| `get_royalty`           | `target_id, is_collection`                                                    | none                                         |
| `is_frozen`             | `target_id, is_collection`                                                    | none                                         |

`basis_points` must be ≤ 10000. `recipients` must be empty (100% to the creator) or
contain at most 10 entries with non-zero shares summing to exactly 100.

`quote_royalty` returns `Vec<RoyaltyPayout>`, the exact per-recipient payout for a
sale. It returns an empty vector when nothing is owed (zero rate, zero price, or a
rounded-to-zero share), rejects a negative price, checks the multiplication for
overflow, and assigns the rounding remainder to the final recipient so the amounts
sum to exactly `sale_price × basis_points ÷ 10000`.

**Settlement oracles are the marketplace's; the transfer is the contract's.**
A bare NFT transfer carries no payment, so nothing tells the chain a sale happened
and the contracts cannot collect on their own. `quote_royalty` answers _who is owed
what_, and `pay_royalty` pays it: it takes the Stellar Asset Contract address of the
settlement currency -- the native XLM SAC, or an issued asset's SAC such as USDC --
and transfers each recipient's share from the payer in the same invocation as the
rest of the settlement. A failed transfer reverts the whole invocation, so there is
no partial payout to reconcile and no escrow to hold.

## Creator — `BezaMintCreator`

| Function           | Arguments                                            | Authorization   |
| ------------------ | ---------------------------------------------------- | --------------- |
| `register`         | `creator, display_name, bio, avatar_uri, banner_uri` | `creator`, once |
| `update_profile`   | `creator, display_name, bio, avatar_uri, banner_uri` | `creator`       |
| `set_social_links` | `creator, links: Vec<SocialLink>`                    | `creator`       |
| `verify_creator`   | `creator`                                            | admin           |
| `total_creators`   | —                                                    | none            |
| `get_profile`      | `creator`                                            | none            |
| `is_registered`    | `creator`                                            | none            |
| `is_verified`      | `creator`                                            | none            |

`display_name` must be non-empty and ≤ 64 bytes; `bio` ≤ 512 bytes. `avatar_uri` and
`banner_uri` are optional but must be `https`/`http`/`ipfs` when present (≤ 512
bytes). Up to 8 social links; each platform must be on the contract's allowlist and
each URL must be `https`/`http` (≤ 256 bytes). These checks exist because the
frontend renders these strings into the DOM.

## Factory — `BezaMintFactory`

| Function                                                                                         | Arguments                                                             | Authorization                 |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------- |
| `set_contracts`                                                                                  | `nft, collection, royalty, creator`                                   | admin                         |
| `set_royalty_admin`                                                                              | `new_admin`                                                           | admin                         |
| `mint_with_royalty`                                                                              | `caller, to, collection_id, metadata_uri, basis_points`               | `caller` (plus callee checks) |
| `mint_batch_with_royalty`                                                                        | `caller, to, collection_id, metadata_uris: Vec<String>, basis_points` | `caller` (plus callee checks) |
| `burn_nft`                                                                                       | `caller, collection_id, token_id`                                     | `caller` (plus callee checks) |
| `create_collection_for_creator`                                                                  | `caller, metadata_uri`                                                | `caller`                      |
| `get_nft_contract` / `get_collection_contract` / `get_royalty_contract` / `get_creator_contract` | —                                                                     | none                          |

`set_contracts` also transfers the Royalty admin role to the Factory, which is what
lets the Factory's cross-contract `configure_royalty` call authenticate. It rejects
the zero account, the Factory's own address, and duplicate addresses. The wiring
getters panic with the unset slot's name (`Factory: NFT contract not set`).

`set_royalty_admin` makes that hand-off reversible. Without it the Factory would
hold the Royalty admin role and forward no `upgrade`, leaving the Royalty contract
permanently un-upgradable. The sequence for upgrading Royalty is
`set_royalty_admin(deployer)` → `royalty.upgrade(hash)` → hand the role back, either
with `set_royalty_admin(factory)` or by re-running `set_contracts`.

`mint_with_royalty` is atomic: the NFT is minted, added to the collection and given
its royalty terms in one invocation, and any failing step reverts all of them.
`burn_nft` is atomic in the same way, so `nft_count` cannot drift from reality.

`mint_batch_with_royalty` runs the same sequence for every URI in a bounded batch
(at most `MAX_BATCH_MINT` = 25, empty and oversized batches rejected by name). It is
atomic in the same way: a failure on the third token reverts the first two as well,
so a drop is never left half-minted. Each token still emits its own `NftMinted`
event, so indexers and the activity feed see exactly the records the single-mint
path produces.

---

## Storage and expiration

Keys are typed enums (`NftKey`, `ColKey`, `RoyaltyKey`, `CreatorKey`, `FactoryKey`)
rather than runtime-built strings. Ownership data lives in persistent storage;
counters and admin bindings live in instance storage.

Every write extends the touched entries to the network-maximum TTL
(`TTL_LEDGERS = 6_312_000`, about a year at 5 seconds per ledger) and refreshes
instance data plus contract code. The primary getters bump entries that have fallen
below half-life. Without this, a dormant record would archive and read as missing —
an NFT would appear to vanish while the counter still counted it.

## Events

Each contract publishes one topic (its own name) and puts the variant in the event
data, with the variant name at element 0:

| Contract   | Topic     | Variants                                                                                                                                    |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| NFT        | `nft`     | `Minted(u64, Address)`, `Transferred(u64, Address, Address)`, `Burned(u64, Address)`, `Approved(u64, Address)`                              |
| Collection | `col`     | `Created(u64, Address)`, `Updated(u64)`, `Archived(u64)`, `NftAdded(u64, u64)`, `NftRemoved(u64, u64)`                                      |
| Royalty    | `royalty` | `Configured(u64, u32)`, `Updated(u64, u32)`, `Frozen(u64)`, `Removed(u64)`, `AdminChanged(Address)`                                         |
| Creator    | `creator` | `Registered(Address)`, `ProfileUpdated(Address)`, `Verified(Address)`                                                                       |
| Factory    | `factory` | `ContractsSet(Address, Address, Address, Address)`, `NftMinted(u64, Address)`, `NftBurned(u64, Address)`, `CollectionCreated(u64, Address)` |

Contract tests assert the emitted event for each mutation, so these schemas are
pinned rather than incidental. The off-chain decoder matches on the variant name,
not a positional index, so inserting a variant cannot silently break the feed.

---

## Interface stability

There is no shared IDL between these contracts and the TypeScript client, so a
changed function signature would otherwise surface only at runtime, in simulation,
for a user. The repository therefore snapshots each contract's on-chain interface

- the `contractspecv0` section `soroban-sdk` embeds in the release wasm - under
  [`abi/`](abi/), and CI fails when a rebuild differs.

```bash
pnpm run contract:abi          # verify the build against the snapshot
pnpm run contract:abi:update   # regenerate after reviewing an interface change
```

The snapshot also renders each interface as readable text, so regenerating it
produces a diff that shows what changed rather than an opaque hash. When a change
lands, update `apps/web/src/services/contracts.ts` in the same pull request.

---

## Deploying to testnet

```bash
export BEZAMINT_DEPLOYER_SECRET="S..."
bash ../scripts/deploy.sh
```

The script builds and optimizes the wasm, deploys all five contracts passing the
deployer as each constructor's admin argument, verifies that each constructor ran
and recorded the deployer as admin, wires the Factory with `set_contracts`, and
writes `apps/web/.env.local`. It always deploys fresh instances; it does not detect
or reuse a previous deployment.

Verify an existing deployment with:

```bash
bash ../scripts/verify-deploy.sh
```

which checks that each configured contract answers a read-only call and that the
Royalty admin is the Factory.

Before mainnet, read [`../docs/mainnet-readiness.md`](../docs/mainnet-readiness.md).
