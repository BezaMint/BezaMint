# Mainnet Readiness

What must be true before this system holds real value. Nothing here is optional, and
nothing here is discharged by the test suite passing — these are operational and
assurance requirements, not code requirements.

The application is currently **testnet-only**. `NEXT_PUBLIC_STELLAR_NETWORK` is
validated at build time and the deployment scripts target testnet; there is no
mainnet configuration path in the repository, deliberately.

---

## Blocking requirements

### 1. Independent security audit

The five contracts handle ownership, admin authority and royalties. They have not
been reviewed by anyone outside the project. The `__constructor` migration, the
`set_contracts` validation and `quote_royalty` are all unreviewed code paths in the
current tree.

Before mainnet, engage an auditor with Soroban experience and give them, at minimum:
the contract sources, `docs/architecture.md`, the review at
[`review/critical-review.md`](./review/critical-review.md), and the test suite as
evidence of intended behaviour. Findings must be resolved or explicitly accepted in
writing.

### 2. Admin key custody and recovery

`upgrade` and `set_contracts` are admin-only and irreversible from the contract's
perspective. Whoever holds the admin key can replace contract code and rewire the
Factory.

- The admin key must live in a hardware wallet or HSM, not an environment variable
  or a hot key on a server.
- `BEZAMINT_DEPLOYER_SECRET` in `scripts/deploy.sh` is a testnet convenience. It must
  not be used for a mainnet deployment.
- Decide and document what happens if the admin key is lost. Today the answer is
  "the contracts cannot be upgraded or rewired", which is safe but permanent.
- Consider whether the admin should be a multisig or governed by a timelock before
  launch. The contracts support a contract address as admin, so this is a deployment
  choice rather than a code change.

### 3. Durable indexer storage

The server-side indexer keeps the most recent 500 events in process memory. On
mainnet this is not sufficient for browsing or activity history:

- it is per-instance, so a multi-instance deployment has inconsistent reads;
- it is lost on every restart and cold-starts from the RPC retention window only;
- it cannot answer historical queries at all.

Replace it with a durable store (Postgres or equivalent) fed by a cursor-checkpointed
poller, keeping the current in-memory path as a read-through cache.

### 4. Durable metadata and image storage

Metadata and images live on IPFS through Pinata. Pinata's retention is a service
guarantee, not a protocol guarantee: if the account lapses, the content becomes
unresolvable.

- Pin at least one additional independent service, or run a node.
- Treat the metadata URI as immutable once minted — the on-chain record cannot be
  rewritten, so a lost pin is permanently lost content.
- Document the rotation and revocation procedure for the Pinata key. See
  [`pinata-key-rotation.md`](./pinata-key-rotation.md).

---

## Required before launch, not before audit

### 5. Contract addresses per network

Publish a signed address registry per network with the deployment commit and wasm
hashes, so a user can verify that the frontend points at the contracts it claims.
`scripts/verify-deploy.sh` performs the reachability and wiring half of this; the
publication half does not exist yet.

### 6. Monitoring and alerting

`/api/health` and `/api/health/live` exist and are wired for probes, and
`/api/health` reports an indexer progress check at `checks.indexer`:

```json
"indexer": {
  "eventCount": 42,
  "lastRefreshAt": 1767225600000,
  "ageSeconds": 3,
  "stalled": false,
  "lastErrorMessage": null,
  "lastErrorAt": null,
  "ok": true
}
```

The indexer fails quietly by nature: while its poll is broken, the list endpoints
keep answering `200` with stale data. Readiness deliberately stays `200` in that
case, because the application can still mint, so the alert must target
`checks.indexer.ok` (and `checks.indexer.lastErrorMessage` for the cause) rather
than the readiness status. A mainnet deployment additionally needs:

- alerting on the readiness endpoint, not just a dashboard;
- an alert on `checks.indexer.stalled`, since that is the only signal that browsing
  has stopped reflecting the chain;
- an alert on contract-admin activity, since any use of `upgrade`, `set_contracts`
  or `set_royalty_admin` should be a deliberate, noticed event.

Route error rates are not exposed by the process. Each request already logs one
structured line with `status` and `durationMs`, so error rates and latency
percentiles must be derived in the platform's log/metric pipeline. In-process
counters were deliberately not added: the app is deployed as ephemeral,
horizontally scaled instances, where a per-process counter cannot be aggregated
and would be a misleading number to alert on.

### 7. Incident response

Write down who is on call, how the contracts would be paused or upgraded, and how a
suspected key compromise is handled. Contract state is public and there is no way to
undo a signed transaction, so the runbook should assume the worst case is already on
chain.

---

## Deliberately out of scope

- **On-chain royalty settlement.** A bare NFT transfer carries no payment, so there is
  nothing for the contracts to hook. `quote_royalty` makes the obligation exact and
  verifiable; collecting it requires a marketplace, which this project does not
  include. This is documented rather than hidden.
- **Per-collection supply caps.** `MAX_SUPPLY` is global; a creator cannot cap an
  individual drop. See [`../ISSUES.md`](../ISSUES.md) §1.
- **On-chain metadata hashing.** There is no commitment to the metadata content, so a
  provider could serve different attributes than were reviewed at mint time. See
  [`../ISSUES.md`](../ISSUES.md) §2.
- **Uniform batches.** `mint_batch_with_royalty` mints up to 25 tokens atomically,
  but every token in a batch shares one recipient and one royalty rate. See
  [`../ISSUES.md`](../ISSUES.md) §3.
