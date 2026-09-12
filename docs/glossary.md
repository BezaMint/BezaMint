# Glossary

The vocabulary used across this repository's contracts, server code and docs.
Written for contributors who are new to Stellar and Soroban, and for reviewers
from outside the ecosystem.

---

## Stellar basics

**Stellar** — a public blockchain and payment network. Soroban is its smart
contract platform.

**XLM (lumen)** — Stellar's native asset. Fees, minimum account balances and
reserves are denominated in it.

**Stroop** — the smallest unit of XLM: 1 XLM = 10,000,000 stroops. Amounts in
contract code and Horizon responses are generally stroops.

**Account address** — a public key, 56 base32 characters starting with `G`. In
this repo, a "creator", "owner" or "recipient" is an account address.

**Secret key** — the signing half of an account, starting with `S`. It must never
be committed or logged; `BEZAMINT_DEPLOYER_SECRET` is a testnet-only convenience.

**Contract ID** — the address of a Soroban contract instance, starting with `C`.
The app's `NEXT_PUBLIC_*_CONTRACT_ID` variables hold these.

**Ledger** — a batch of transactions agreed by the network roughly every 5 seconds.
Each has a monotonically increasing **sequence number**, used to bound time.

**Transaction** — a signed, atomic bundle. It either applies completely or not at
all; a failed invocation changes no state.

**Sequence number** — a per-account counter that must increase by exactly one per
transaction, which prevents replays.

**Fee** — XLM charged per operation, plus a Soroban resource fee.

---

## Soroban

**Soroban** — Stellar's smart contract runtime. Contracts are written in Rust,
compiled to **wasm** (WebAssembly) and deployed to the network.

**Wasm / wasm hash** — the compiled contract code and its 32-byte content hash.
`upgrade` takes a wasm hash to replace a contract's code in place.

**Constructor (`__constructor`)** — code that runs _inside_ the deployment
transaction. It runs exactly once and cannot be raced, which is why this repo
initializes contracts this way instead of a separate `initialize` transaction.

**Contract invocation** — a call into a contract. An invocation that panics reverts
everything it did, including sub-calls, which is what makes a batch mint atomic.

**Cross-contract call** — one contract invoking another inside a single
invocation. `BezaMintFactory` uses these to mint, link and configure royalties
atomically.

**Footprint / resource budget** — the storage entries an invocation reads and
writes, and the CPU/instructions it consumes. Both are metered and priced, which is
why list reads are paginated and batch operations are bounded.

**Entry durability** — where a value lives. **Instance** storage is loaded with the
contract (this repo keeps admin, counters and contract pointers there);
**persistent** storage is per-key and long-lived (token ownership, profiles);
**temporary** storage is discarded after a lease and is not used here.

**TTL (time to live)** — how many ledgers remain before an entry **archives**.
Archived entries are removed from the live ledger and read as _missing_ unless
restored. Every write in this repo extends the touched entries to the network
maximum, and hot reads bump entries past half-life, so ownership records cannot
silently disappear.

**Archiving / restoration** — the mechanism by which dormant entries leave the live
ledger and can be restored by paying rent again.

**Authorization (`require_auth`)** — the contract asserts that a given address
signed the invocation. This is how ownership, creator and admin rights are
enforced; there is no ambient "caller" identity to read.

**Admin** — the address stored by a contract's constructor. It authorizes
`upgrade` and, on the Factory, `set_contracts` and `set_royalty_admin`.

**Storage version / migration** — the schema version a contract's stored data was
written with. `migrate(from_version)` advances it after an in-place `upgrade`;
mutating calls refuse to run against a mismatched version rather than decode old
bytes as garbage.

**ABI / contract spec (`contractspecv0`)** — the machine-readable description of a
contract's functions and types, embedded in the wasm. This repository snapshots it
under `contracts/abi/` so a Rust signature change cannot silently break the
TypeScript client.

---

## NFT concepts

**NFT** — a non-fungible token: a unique, individually owned on-chain asset. Here
it is a token id owned by an address, with a metadata URI.

**ERC-721 semantics** — the widely used NFT interface from Ethereum: `owner_of`,
`transfer`, `approve`, `set_approval_for_all`, `transfer_from`. BezaMint
deliberately mirrors it so the API is familiar.

**Approval / operator** — an address the owner authorizes to move a token.
Per-token approval (`approve`) covers one token; blanket approval
(`set_approval_for_all`) covers all of the owner's tokens. A transfer clears the
per-token approval so a stale grant cannot be reused.

**Collection** — a named group that tokens are minted into. A token belongs to at
most one collection, and only the collection's creator can add or remove tokens.

**Mint** — create a new token and assign its initial owner. Here it is
recipient-gated: the recipient authorizes, so anyone can mint through the Factory
without the platform admin's involvement.

**Burn** — permanently destroy a token. Token ids are never recycled.

**Metadata URI** — a pointer (https or ipfs) to the token's JSON document. The
contract validates the scheme and length but does not yet commit to the content's
hash; that gap is tracked in [`../ISSUES.md`](../ISSUES.md).

**CID** — a content identifier in IPFS: a hash of the content. Same CID always
means same bytes, which is why the upload routes re-verify pinned content against
the returned CID.

**IPFS / pinning** — a content-addressed store. Content stays available only while
someone **pins** it; this project uses **Pinata** as the pinning service.

**Royalty** — a share of a secondary sale owed to the creator, expressed here in
**basis points** (1 bp = 0.01%, so 10,000 bp = 100%). `quote_royalty` computes the
exact per-recipient payout; `pay_royalty` settles it through the Stellar Asset
Contract of the caller's choosing. Something off chain still has to say a sale
happened, because a bare transfer carries no payment.

---

## This repository

**Factory contract** — the user-facing entry point (`BezaMintFactory`). It performs
the atomic mint → link → configure-royalty flow and holds the Royalty admin role in
production.

**Indexer** — the server-side poller that reads emitted events from Soroban RPC and
keeps recent records in memory so list endpoints do not fan out to RPC per request.
It is bounded and per-instance; durable storage is tracked in `ISSUES.md`.

**Cursor** — the paging token Soroban RPC returns for events and Horizon returns for
operations. The indexer and `/api/wallet/transactions` advance with it.

**Ledger window / retention** — Soroban RPC retains a bounded ledger range;
`getHealth().ledgerRetentionWindow` reports roughly 120,960 ledgers (about 7 days).
Events are retained for far less than that — measured at roughly 10,500 ledgers — and
a `startLedger` outside the event window is **not** rejected: it returns zero events,
which is indistinguishable from a quiet network. That silent empty result is why the
indexer clamps its lookback to 10,000 ledgers instead of trusting the ledger-retention
figure.

**Horizon** — Stellar's REST API for accounts, balances and operation history. The
wallet endpoints use it; contract reads use Soroban RPC instead.

**Simulate / read call** — a dry-run contract invocation that returns a value
without submitting a transaction or paying a fee, used for all reads such as
`owner_of` and `total_supply`.

**Testnet / mainnet** — Stellar's development network (free, reset-resettable, where
this project runs) and the production network holding real value. Mainnet
prerequisites are in [`mainnet-readiness.md`](mainnet-readiness.md).

**Friendbot** — the testnet faucet that funds a new account with free XLM.

**Basis point (bp)** — one hundredth of a percent. Royalty rates are in basis
points: 500 bp = 5%.
