# FAQ and Troubleshooting

Recurring questions about running, using and debugging BezaMint, with the answer
and the source that backs it. Operational procedures live in the
[deployment runbook](deployment-runbook.md); the HTTP surface is described in the
[API reference](api-reference.md).

---

## Wallet and network

### Which wallet do I need?

[Freighter](https://freighter.app), the browser extension. The app detects it and
shows install guidance when it is missing. Wallet integration is client-side only:
the server never holds a user key, which is why minting is a signed client
transaction rather than an API call.

### "Wallet not detected" or a connect prompt that never resolves

1. Confirm the extension is installed and unlocked.
2. Reload the page after installing it; extensions are not injected into an
   already-loaded page.
3. Check that the site is not blocking third-party context: the integration runs
   against `window.freighter` and a strict content-security policy can hide it.

### Which network does the app use?

Stellar **Testnet** (`soroban-testnet.stellar.org`). The network name is validated
at build time from `NEXT_PUBLIC_STELLAR_NETWORK`. Freighter must be set to the same
network, or every signature will be produced for the wrong chain and rejected as
an auth failure.

### How do I fund a testnet account?

Use [Friendbot](https://friendbot.stellar.org), or from the CLI:

```bash
soroban keys fund deployer --network testnet
curl "https://friendbot.stellar.org?addr=$ADDRESS"
```

### "Insufficient balance" when minting

Every Soroban invocation consumes fees and requires the account to hold enough XLM
to cover the transaction. Fund the account with Friendbot, and note that each
trustline and data entry also locks a small reserve.

---

## Building and running locally

### `pnpm install` fails, or the service will not start

Node **24** and pnpm **9** are required (`engines` in `package.json`, pinned by
`.nvmrc`). An older Node will fail on install, and `pnpm` is the only supported
package manager; `package-lock.json` and `yarn.lock` are gitignored so an
accidental `npm install` cannot introduce a competing dependency graph.

### `cargo: command not found`

Install Rust and add the wasm target:

```bash
rustup target add wasm32-unknown-unknown
```

### `ed25519-dalek` / `rand_core` version conflict

Resolved in the workspace, which pins `ed25519-dalek = "2.2.0"` as a dev
dependency to unify the graph on `rand_core 0.6`. If a fresh clone hits it again,
the fix is in the README's troubleshooting note:
`cargo update -p ed25519-dalek@3.0.0 --precise 2.2.0`.

### Which commands should I run before opening a pull request?

```bash
pnpm format:check && pnpm lint && pnpm test   # web
cd contracts && cargo fmt --all -- --check    # contracts
cd contracts && cargo clippy --workspace -- -D warnings
cd contracts && cargo test --workspace
pnpm run contract:build && pnpm run contract:size && pnpm run contract:abi
pnpm --filter @bezamint/web run test:coverage
```

CI runs all of these, plus the production build and the bundle budget.

### CI says the contract ABI changed

That is the drift gate working: a contract interface changed without the snapshot
being regenerated. Review the diff in `contracts/abi/*.spec.txt`, update
`apps/web/src/services/contracts.ts` if the frontend calls the changed function,
then regenerate with `pnpm run contract:abi:update` and commit the result.

---

## Minting and transactions

### How do I find out why a transaction failed?

Open the transaction on [Stellar Expert](https://stellar.expert/explorer/testnet) —
the app links every transaction hash. On-chain failures carry a result code and, for
Soroban, a diagnostic event with the contract's panic message.

### The contract's panic messages, decoded

The contracts fail loudly and with a prefix naming the contract, so a message is
usually enough to identify the problem:

| Message contains                                      | Meaning                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `not initialized`                                     | The contract instance was never constructed; `deploy.sh` handles this.   |
| `zero address is not allowed`                         | A mint recipient, transfer target or operator was the all-zero account.  |
| `metadata URI must use an https, http or ipfs scheme` | The URI used another scheme (for example `javascript:` or `data:`).      |
| `metadata URI exceeds 512 chars`                      | The URI is longer than the shared 512-byte limit.                        |
| `token <id> not found`                                | The token does not exist, or was burned.                                 |
| `caller not owner` / `from is not the token owner`    | The signer is not the current owner of the token.                        |
| `spender is not approved for token`                   | No per-token or blanket approval exists for the caller.                  |
| `token <id> already belongs to a collection`          | A token can belong to exactly one collection.                            |
| `Collection: <id> is archived`                        | The collection no longer accepts NFTs or updates.                        |
| `Collection: <id> is full`                            | The collection reached `MAX_NFTS_PER_COLLECTION` (8,000).                |
| `max supply of 1000000 reached`                       | The global `MAX_SUPPLY` ceiling was hit.                                 |
| `config already exists for target`                    | `configure_royalty` creates terms once; use `update_royalty` afterwards. |
| `config is frozen`                                    | The creator froze the royalty terms; they are permanent.                 |
| `recipient shares must sum to 100`                    | A royalty split does not total 100%.                                     |
| `basis points must be <= 10000`                       | A royalty rate exceeded 100%.                                            |
| `already registered`                                  | A creator profile exists; use `update_profile`.                          |
| `storage version <n> does not match this build`       | A schema migration has not been run. See the runbook, section 4.2.       |

### Auth-related failures

`require_auth` failures almost always mean one of: the wallet is on the wrong
network, the signing account is not the address the contract expects (for example
minting into a collection you do not own), or a signature was requested for a
different invocation. Check the network first.

### How do I mint several NFTs at once?

`Factory.mint_batch_with_royalty` mints a bounded batch (up to 25) atomically: if
any item fails, the whole call rolls back and nothing is minted.

---

## Metadata and IPFS

### Where does metadata live?

Ownership, mint timestamps and collection membership are on chain. Metadata JSON
and images are pinned to IPFS through Pinata, and the on-chain record stores an
`ipfs://` (or `https://`) URI.

### Does the app work without Pinata configured?

Partly. `/api/ipfs/upload` degrades gracefully and returns `200` with
`fallback: true` and a non-resolvable `beza://metadata/...` URI, so the UI stays
usable. `/api/ipfs/upload-file` returns `503` because there is no useful fallback
for an image. Set `PINATA_JWT` to enable real pinning.

### Upload limits

| Limit                   | Value                                                   |
| ----------------------- | ------------------------------------------------------- |
| Metadata JSON body      | 1 MiB (`MAX_METADATA_SIZE`)                             |
| Image file size         | 5 MiB                                                   |
| Image types             | `image/jpeg`, `image/png`, `image/webp`, `image/gif`    |
| Metadata document fetch | 256 KiB maximum, from `/api/ipfs/metadata`              |
| Upload rate             | 10 per minute per IP; API overall 120 per minute per IP |

### A metadata URI returns 404 or the image never loads

The CID is not pinned anywhere reachable. Pinata retention is a service
guarantee, not a protocol guarantee: if the account lapses, content becomes
unresolvable, and the on-chain URI cannot be rewritten. See
[`mainnet-readiness.md`](mainnet-readiness.md), section 4.

---

## Royalties

### How do royalties work?

A creator sets a rate in basis points (up to 10,000 = 100%) with an optional
multi-recipient split that must total 100%, and can freeze the terms permanently.
`quote_royalty(target_id, is_collection, sale_price)` returns the exact per-recipient
payout for a sale price, with the rounding remainder assigned so amounts sum
precisely.

### Are royalties paid out automatically?

No, and this is deliberate rather than missing. A bare NFT transfer carries no
payment, so there is nothing on chain for the contracts to hook. `quote_royalty`
makes the obligation exact and verifiable; collecting it is the marketplace's
responsibility. See [`contracts/README.md`](../contracts/README.md), and the
settlement note in [`mainnet-readiness.md`](mainnet-readiness.md).

---

## API

### How do I tell a timeout from a network failure?

Branch on `error.code`, not on the status text. `TIMEOUT` (504) means the upstream
was reachable but slow; `NETWORK_ERROR` (502) means it failed or refused;
`CONTRACT_ERROR` (422 or 503) means the Soroban call itself failed. The full table
is in the [API reference](api-reference.md).

### Why am I getting 429?

The per-IP limit is 120 requests per 60 seconds across `/api`, and 10 per 60
seconds for uploads. Read `Retry-After` and `X-RateLimit-Reset` (both in seconds).
The limiter is per instance, so a horizontally scaled deployment permits
`limit × instances`.

### "There are no NFTs" but I minted one

The list endpoints are backed by an in-memory event indexer with a bounded ledger
window and a 500-event store. A cold start can only see the RPC retention window
(roughly 24 hours), so older activity is not listed. This is tracked in
[`../ISSUES.md`](../ISSUES.md) as durable indexer storage.

---

## Still unresolved

Known open work is tracked in [`../ISSUES.md`](../ISSUES.md) with acceptance
criteria, rather than listed here where it would drift.
