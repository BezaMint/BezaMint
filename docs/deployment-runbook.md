# Deployment Runbook

How to deploy, verify, upgrade and roll back BezaMint's contracts, and what to do
when a step fails. This is the operational counterpart to
[`mainnet-readiness.md`](mainnet-readiness.md), which covers what must be true
_before_ mainnet rather than how to run a deploy.

Commands use the Soroban CLI (`soroban`, ≥ 22.0) and the repository's own scripts.
Everything here targets **testnet**; the differences for mainnet are listed at the
end.

---

## Prerequisites

| Requirement                | Notes                                                        |
| -------------------------- | ------------------------------------------------------------ |
| Rust + `wasm32`            | `rustup target add wasm32-unknown-unknown`                   |
| Soroban CLI ≥ 22.0         | `cargo install soroban-cli` or the release binary            |
| Funded account             | Testnet XLM for fees; fund with Friendbot                    |
| `BEZAMINT_DEPLOYER_SECRET` | Secret key (`S...`) for the deploying account. Testnet only. |
| Node 24 + pnpm 9           | Only needed for the frontend and the repository scripts      |

The CLI flags used throughout:

```bash
CLI_ARGS=(--rpc-url https://soroban-testnet.stellar.org \
          --network-passphrase "Test SDF Network ; September 2015" \
          --network testnet)
```

---

## 1. Fresh testnet deployment

`scripts/deploy.sh` performs every step. It always creates **new** contract
instances and rewrites `apps/web/.env.local`; it does not detect or reuse a
previous deployment, so re-running it abandons the old addresses.

```bash
export BEZAMINT_DEPLOYER_SECRET="S..."
bash scripts/deploy.sh
```

What it does, in order:

1. Builds all five contracts for `wasm32-unknown-unknown` in release mode.
2. Runs `soroban contract optimize` on each wasm.
3. Registers the deployer key in the CLI keyring as `deployer`.
4. Deploys each contract **with its constructor**, passing the deployer as the
   admin argument. Initialization happens inside the deployment transaction, so
   there is no window in which an observer could initialize a contract as
   themselves.
5. Verifies the constructor ran and recorded the deployer as admin, for all five
   contracts. A contract whose admin is not the deployer aborts the deploy.
6. Calls `set_contracts(...)` on the Factory, which also transfers the Royalty
   admin role to the Factory.
7. Writes `apps/web/.env.local` with the new contract IDs and runs
   `scripts/verify-deploy.sh`.

Expected output ends with:

```
✅ bezamint_<contract>: C...
✅ NFT: initialized by constructor, admin is the deployer
...
✅ Factory wired; Royalty admin is now the Factory
✅ Generated apps/web/.env.local with deployed contract IDs
✅ All configured contracts verified on Stellar Testnet.
```

If the script aborts, no Factory wiring happened and `apps/web/.env.local` was not
rewritten. Fix the failure and re-run from the top; nothing is half-applied.

---

## 2. Verifying a deployment

`scripts/verify-deploy.sh` reads `apps/web/.env.local` and checks that each
configured contract answers a read-only call, then checks the cross-contract
wiring:

```bash
BEZAMINT_SOURCE_KEY="deployer" bash scripts/verify-deploy.sh
```

| Contract   | Probe               |
| ---------- | ------------------- |
| NFT        | `total_supply`      |
| Collection | `total_collections` |
| Royalty    | `is_initialized`    |
| Creator    | `total_creators`    |
| Factory    | `get_nft_contract`  |

It then asserts that `royalty.get_admin()` equals the Factory address, which is
the property that makes minting work end-to-end. A failure there means
`set_contracts` did not complete; re-run the deploy.

Verify independently as well:

```bash
# Wasm hashes on chain should match the artifacts you deployed.
soroban contract invoke --id "$NFT_ID" "${CLI_ARGS[@]}" --source deployer -- version
```

`version()` returns the stored schema version of the deployed contract. It is the
value the migration checks below compare against.

---

## 3. Frontend configuration

`deploy.sh` writes the five `NEXT_PUBLIC_*_CONTRACT_ID` values plus the network and
RPC URL. Confirm that a production build reports healthy before relying on it:

```bash
cd apps/web && pnpm run build && pnpm start &
curl -s localhost:3000/api/health | jq
```

A `degraded` status with `contractsConfigured: false` means a contract ID is
missing; the readiness endpoint reports `503` in that case, by design, so a
platform will not route traffic to a deployment that cannot mint.

---

## 4. Upgrading a contract in place

Stored state is preserved: `upgrade(new_wasm_hash)` swaps the code for a contract
instance and leaves its storage alone.

### 4.1 Upload the new wasm and record its hash

```bash
WASM_HASH=$(soroban contract install --wasm contracts/target/wasm32-unknown-unknown/release/bezamint_nft.wasm "${CLI_ARGS[@]}" --source deployer)
echo "$WASM_HASH"
```

`install` is spelled `upload` in newer CLI releases; both return the 32-byte wasm
hash. Keep the previous hash and its wasm artifact — you need them for a rollback.

### 4.2 Check whether the storage schema changed

Compare `STORAGE_VERSION` in the new source with the old one.

- **Unchanged** — call `upgrade` and stop.
- **Bumped** — the stored entries are laid out differently. Mutating calls will
  panic with `storage version N does not match this build (M); run migrate`
  until the migration runs. That is intentional: it is the check that stops old
  entries being decoded into a new struct. Call `upgrade` and then `migrate`:

```bash
soroban contract invoke --id "$NFT_ID" "${CLI_ARGS[@]}" --source deployer -- \
  upgrade --new_wasm_hash "$WASM_HASH"

# from_version must be the version actually stored, which `version()` reports.
soroban contract invoke --id "$NFT_ID" "${CLI_ARGS[@]}" --source deployer -- \
  migrate --from_version 1
```

`migrate` is admin-only, requires the exact stored version, and refuses to run
when the contract is already current, so it cannot be replayed by accident.

### 4.3 Upgrading the Royalty contract

After `set_contracts`, the Royalty admin is the **Factory**, and the Factory does
not forward `upgrade`. Take the role back, upgrade, and hand it over again:

```bash
# 1. Factory admin reclaims the role on the deployer's behalf.
soroban contract invoke --id "$FACTORY_ID" "${CLI_ARGS[@]}" --source deployer -- \
  set_royalty_admin --new_admin "$DEPLOYER_ADDR"

# 2. Now the deployer is the Royalty admin and can upgrade it directly.
soroban contract invoke --id "$ROYALTY_ID" "${CLI_ARGS[@]}" --source deployer -- \
  upgrade --new_wasm_hash "$ROYALTY_WASM_HASH"

# 3. Hand the role back so minting keeps working. `set_contracts` re-transfers it,
#    or transfer it directly:
soroban contract invoke --id "$ROYALTY_ID" "${CLI_ARGS[@]}" --source deployer -- \
  set_admin --new_admin "$FACTORY_ID"
```

Leaving step 3 undone breaks every mint: `configure_royalty` requires the Royalty
admin's authorization, and that role must be held by the Factory for the
cross-contract call to authenticate. Always finish by running
`scripts/verify-deploy.sh`, which checks exactly this.

### 4.4 Update the committed ABI snapshot

A contract change alters the interface, so the drift gate fails until the snapshot
is regenerated. CI is intentionally strict about this: it is the only check that
connects a Rust signature change to the TypeScript client.

```bash
pnpm run contract:build
python3 scripts/check-contract-abi.py --write   # after reviewing contracts/abi/*.spec.txt
pnpm run contract:size                         # confirm the wasm budgets still hold
```

Update `apps/web/src/services/contracts.ts` in the same pull request if the
frontend calls the changed function.

---

## 5. Rollback

There is no automated rollback; the operation is `upgrade` with the previous wasm
hash.

```bash
soroban contract invoke --id "$NFT_ID" "${CLI_ARGS[@]}" --source deployer -- \
  upgrade --new_wasm_hash "$PREVIOUS_WASM_HASH"
```

Read this before relying on it:

- **Interface-only change (schema version unchanged):** rollback is safe. Storage
  is untouched and the previous build reads it normally.
- **After a schema migration:** rollback is **not** straightforward. The previous
  build expects the older version, and `assert_version` will reject every mutation
  with a clear message rather than corrupting state. Rolling back requires either
  a migration the old build accepts or a fresh deployment; decide which before
  migrating, not after.
- **No downgrade protection exists beyond the admin key.** Nothing on chain stops
  an admin from downgrading. The version check protects the data, not the code.

### Recovering a lost or compromised admin

1. If the admin key is lost, the contracts cannot be upgraded or rewired. There is
   no on-chain recovery. This is why `mainnet-readiness.md` requires the key to
   live in a hardware wallet or HSM and why custody must be decided before launch.
2. If the key is compromised, the attacker can replace contract code. Containment
   is off-chain: revoke the API keys the app uses, take the frontend down, and
   deploy fresh contracts. Contract state is public and a signed transaction cannot
   be undone.
3. The only _role_ that can be moved from the contract side is the Royalty admin,
   via `factory.set_royalty_admin`.

---

## 6. Recovering a failed or partial deployment

| Symptom                                                         | Cause                                                   | Action                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `BEZAMINT_DEPLOYER_SECRET environment variable is required`     | Secret not exported.                                    | Export it and re-run.                                                   |
| `soroban CLI not found`                                         | CLI not installed or not on `PATH`.                     | `cargo install soroban-cli`.                                            |
| `Wasm not found: …bezamint_<name>.wasm`                         | Build did not produce the artifact.                     | `pnpm run contract:build`, then re-run.                                 |
| `constructor did not initialize the contract`                   | The deploy transaction did not run the constructor.     | Re-run the deploy; the instance is unusable as-is.                      |
| `admin is '…', expected the deployer`                           | The constructor was passed a different address.         | Re-run with the intended `BEZAMINT_DEPLOYER_SECRET`.                    |
| Deploy succeeded but `verify-deploy.sh` fails on `total_supply` | Contract instance is not the one in `.env.local`.       | Re-run `deploy.sh`; it rewrites the env file.                           |
| `Royalty admin is '…', expected the Factory`                    | `set_contracts` did not complete.                       | Run `factory.set_contracts(...)` with the four current contract IDs.    |
| `storage version N does not match this build (M); run migrate`  | Schema changed without a migration.                     | Run `migrate --from_version N` as admin (section 4.2).                  |
| Minting fails with an auth error after a Royalty upgrade        | The Royalty admin role was not handed back.             | `royalty.set_admin(FACTORY_ID)` or re-run `set_contracts`.              |
| CI: `Contract ABI check failed`                                 | An interface changed without regenerating the snapshot. | Review `contracts/abi/*.spec.txt`, then `pnpm run contract:abi:update`. |

---

## 7. Mainnet differences

Do not change `NEXT_PUBLIC_STELLAR_NETWORK` to `mainnet` until
[`mainnet-readiness.md`](mainnet-readiness.md) is satisfied in full. In particular:

- `deploy.sh` is a testnet convenience that reads a hot secret from the
  environment. A mainnet deployment must sign with a hardware wallet or HSM.
- The rate limiter and the indexer are per-instance and in memory (see
  [`../ISSUES.md`](../ISSUES.md)); both need durable backing before they can be
  trusted for traffic and history.
- Publish the deployed addresses with their wasm hashes and the deployment commit
  so a user can verify the frontend points at the contracts it claims.
