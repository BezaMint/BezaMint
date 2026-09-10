# Event Indexer Schema

`apps/web/src/lib/server/indexer.ts` polls the Factory and Creator
contracts for emitted events and keeps a bounded in-memory store that API
routes read from. This page documents the schema, the event-variant
mapping, and how to extend the indexer when a contract gains new events.

## Event store

The store is a module-level array of `IndexedEvent` records, newest
first, capped at `MAX_STORED_EVENTS` (500). Routes access it through
`getIndexedEvents()` and trigger a refresh with `refreshIndexer()` —
concurrent calls are deduplicated so a burst of requests triggers a
single RPC scan, and scans happen at most once per 15 seconds.

```ts
interface IndexedEvent {
  type: IndexedEventType; // see below
  ledger: number; // ledger the event was emitted in
  ledgerClosedAt: string; // ISO timestamp of ledger close
  pagingToken: string; // RPC paging token (ordering cursor)
  txHash: string; // transaction that emitted the event
  id?: number; // token id (mints) or collection id (creations)
  actor?: string; // creator / minter address when present
}
```

`IndexedEventType` is the union:

```
'nft_minted' | 'collection_created' | 'contracts_set' | 'creator_registered'
```

## Variant mapping

The contracts emit a single event per action with a two-topic header:
`topic[0]` is the contract symbol (`factory` or `creator`), and
`topic[1]` is the Rust enum variant index. The mapping mirrors the
contract enum ordering — **changing an enum variant's position in the
contract requires updating these tables**.

### Factory (`contracts/factory`)

| Variant index | Event type           | Payload          |
| ------------- | -------------------- | ---------------- |
| 0             | `contracts_set`      | —                |
| 1             | `nft_minted`         | `(token_id, to)` |
| 2             | `collection_created` | `(id, creator)`  |

### Creator (`contracts/creator`)

| Variant index | Event type           | Payload     |
| ------------- | -------------------- | ----------- |
| 0             | `creator_registered` | `(creator)` |

Only variants listed above are decoded; unknown indices are skipped
(`ProfileUpdated` and `Verified` events exist in the contract but are
currently unused by the indexer).

## Adding a new event type

1. Extend `IndexedEventType` with the new type name.
2. Add the variant index to the relevant `*_VARIANTS` map.
3. If the payload is not `(id, actor)`, add a `parse` function for the
   source; the `parse` callback receives `scValToNative(raw.value)` and
   returns `{ id?, actor? }`.
4. Consumers: `indexerStats()` counts events per type — extend its
   counts record so the new type is tracked.

## Notes

- **Scan window**: the indexer performs a single bounded `getEvents`
  scan (limit 50, newest events), so it reflects recent activity, not
  full history. Consumers should treat an empty store as "no recent
  activity" rather than "the platform is empty".
- **In-memory only**: the store lives in the Node process; on serverless
  cold starts it is empty until the first refresh.
- **Refresh cadence**: `refreshIndexer()` skips work within 15 seconds
  of the last successful refresh. Use `refreshIndexer(true)` to force.
- **Failure behavior**: a failed refresh is logged and the previous
  store is served; the error is normalized through `normalizeError` so
  callers see a typed API error.
