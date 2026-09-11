/**
 * Minimal on-chain event indexer.
 *
 * Polls the Factory and Creator contracts' emitted events from the Soroban
 * RPC and keeps a bounded in-memory store of the most recent records. API
 * routes read from this store instead of doing ad-hoc RPC scans, so list
 * endpoints stay fast and consistent.
 *
 * ## How events are actually shaped
 *
 * The contracts publish a single topic and put the whole `#[contracttype]`
 * enum in the event data:
 *
 * ```text
 * topics: [ Symbol("factory") ]
 * data:   ScVal::Vec([ Symbol("NftMinted"), U64(token_id), Address(actor) ])
 * ```
 *
 * This was verified against the host, not assumed. `scValToNative` therefore
 * yields a plain array whose **first element is the variant name** and whose
 * remaining elements are the variant's fields, so the decoder matches on the
 * name. Matching on the name rather than a positional index keeps decoding
 * correct when variant order changes; a decoder that reads a variant index out
 * of a second topic (as an earlier revision did) receives `undefined` forever
 * and silently drops every event.
 *
 * A legacy `(symbol, u32 index)` topic form is still accepted as a fallback so
 * a change in the emit shape cannot silently regress the feed again.
 *
 * ## Ledger window
 *
 * Soroban RPC retains ledgers and events for different lengths of time, and the
 * difference matters here. `getHealth().ledgerRetentionWindow` describes the
 * range a `startLedger` may fall in; the range that actually *contains events*
 * is much smaller. A request from outside it is not rejected -- it returns no
 * events at all, which is indistinguishable from a quiet network.
 *
 * A cold start therefore searches: it begins at
 * `latestLedger - INDEXER_LOOKBACK_LEDGERS` and halves the window until it finds
 * events or reaches a floor. That keeps the indexer correct on an RPC with a
 * different retention period instead of depending on one measured constant.
 * Later fetches advance with the response cursor, and each page is merged into
 * the store rather than replacing it, so the feed keeps the history it has
 * already seen instead of draining to empty between refreshes.
 */
import { scValToNative, rpc as SorobanRpc } from '@stellar/stellar-sdk';
import { getRpcClient } from '@/services/stellar';
import { CONTRACT_IDS } from '@/services';
import { errorMessage, normalizeError } from './errors';
import { withTimeout } from './http';
import { logger } from './logger';

export type IndexedEventType =
  | 'nft_minted'
  | 'collection_created'
  | 'contracts_set'
  | 'creator_registered'
  | 'creator_updated'
  | 'creator_verified';

export interface IndexedEvent {
  type: IndexedEventType;
  ledger: number;
  ledgerClosedAt: string;
  pagingToken: string;
  txHash: string;
  /** NFT minted: token id; collection created: collection id. */
  id?: number;
  /** Creator/actor address for mints, collection creations and registrations. */
  actor?: string;
}

const MAX_STORED_EVENTS = 500;

/**
 * How far back a cold start looks for history.
 *
 * Measured against the public testnet RPC rather than assumed. `getHealth()`
 * reports a `ledgerRetentionWindow` of 120,960 ledgers (~7 days), which is what
 * the RPC will accept a `startLedger` in -- but events are retained for far
 * less than that. Requests were answered with events from as far back as
 * 10,500 ledgers and with *zero* events from 11,000, and the zero is not an
 * error: asking for events from outside the event window returns an empty
 * result and no indication that anything went wrong.
 *
 * That is what made the previous 17,000-ledger window a silent failure. Every
 * fetch returned no events, so every list endpoint answered `200` with an empty
 * array while the mocked tests, which never see a real retention limit, passed.
 *
 * `discoverColdStartLedger` shrinks further when a given RPC retains less, so
 * this value is a starting point for the search rather than a hard assumption.
 */
const DEFAULT_LOOKBACK_LEDGERS = 10_000;

/**
 * Floor for the cold-start search, about 25 minutes at 5s per ledger. Below
 * this the indexer is pointed so close to the live edge that it would report an
 * empty feed on a quiet network rather than admit the window is wrong.
 */
const MIN_LOOKBACK_LEDGERS = 300;

/**
 * Hard ceiling on one RPC round trip.
 *
 * These calls had no timeout, so a hung RPC did not fail a refresh -- it never
 * settled at all. That is worse than a failure, because concurrent callers share
 * a single in-flight refresh promise: one hung call held every endpoint that
 * touches the store open indefinitely. `/api/stats` was observed at 71 seconds
 * before the client gave up, and `/api/health`, which waits on the same
 * promise, timed out alongside it.
 *
 * A bounded call turns that into an ordinary reported failure: the refresh
 * rejects, `getIndexerHealth` reports the message and marks the store stalled,
 * and the route answers 504 TIMEOUT rather than hanging.
 */
const RPC_TIMEOUT_MS = 8_000;

function withRpcTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  return withTimeout(promise, RPC_TIMEOUT_MS, `Soroban RPC ${what} timed out`);
}

function lookbackLedgers(): number {
  const raw = process.env.INDEXER_LOOKBACK_LEDGERS;
  if (!raw) return DEFAULT_LOOKBACK_LEDGERS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LOOKBACK_LEDGERS;
  return Math.min(parsed, DEFAULT_LOOKBACK_LEDGERS);
}

interface SourceConfig {
  contractId: string;
  /** topic[0] symbol emitted by the contract. */
  symbol: string;
  /** Variant name -> event type. Matching by name survives enum reordering. */
  variants: Record<string, IndexedEventType>;
  /** Positional variant index -> event type, for the legacy topic encoding. */
  legacyVariants: Record<number, IndexedEventType>;
  /** Parse the variant's fields into (id, actor). */
  parse: (fields: unknown[]) => { id?: number; actor?: string };
}

/** Factory events: `NftMinted(u64, Address)`, `CollectionCreated(u64, Address)`. */
function parseIdActor(fields: unknown[]): { id?: number; actor?: string } {
  const [id, actor] = fields;
  const numericId = typeof id === 'number' || typeof id === 'bigint' ? Number(id) : undefined;
  return { id: numericId, actor: typeof actor === 'string' ? actor : undefined };
}

/** Creator events carry a single Address (`Registered`, `ProfileUpdated`, `Verified`). */
function parseActorOnly(fields: unknown[]): { id?: number; actor?: string } {
  const [actor] = fields;
  return { actor: typeof actor === 'string' ? actor : undefined };
}

const FACTORY_VARIANTS: Record<string, IndexedEventType> = {
  ContractsSet: 'contracts_set',
  NftMinted: 'nft_minted',
  CollectionCreated: 'collection_created',
};

const FACTORY_LEGACY_VARIANTS: Record<number, IndexedEventType> = {
  0: 'contracts_set',
  1: 'nft_minted',
  2: 'collection_created',
};

const CREATOR_VARIANTS: Record<string, IndexedEventType> = {
  Registered: 'creator_registered',
  ProfileUpdated: 'creator_updated',
  Verified: 'creator_verified',
};

const CREATOR_LEGACY_VARIANTS: Record<number, IndexedEventType> = {
  0: 'creator_registered',
  1: 'creator_updated',
  2: 'creator_verified',
};

function sources(): SourceConfig[] {
  return [
    {
      contractId: CONTRACT_IDS.factory,
      symbol: 'factory',
      variants: FACTORY_VARIANTS,
      legacyVariants: FACTORY_LEGACY_VARIANTS,
      parse: parseIdActor,
    },
    {
      contractId: CONTRACT_IDS.creator,
      symbol: 'creator',
      variants: CREATOR_VARIANTS,
      legacyVariants: CREATOR_LEGACY_VARIANTS,
      parse: parseActorOnly,
    },
  ].filter((s) => s.contractId) as SourceConfig[];
}

let events: IndexedEvent[] = [];
let cursor: string | undefined;
let lastRefreshAt = 0;
let lastError: { message: string; at: number } | null = null;
let refreshPromise: Promise<IndexedEvent[]> | null = null;

/**
 * How long the store may go without a successful refresh before it is reported
 * as stalled. The refresh interval is 15s, so this tolerates several missed
 * polls before an alert fires.
 */
export const INDEXER_STALE_AFTER_MS = 60_000;

/**
 * Split a decoded event payload into its variant name and field list.
 *
 * Accepts the two shapes the host can produce:
 *  - `['NftMinted', 42n, 'G...']` (native decode of the enum vec), and
 *  - `{ NftMinted: [42n, 'G...'] }` (object form some SDK versions emit for
 *    multi-field variants).
 *
 * Returns `null` when the payload has no recognisable variant.
 */
export function splitVariant(native: unknown): { name: string; fields: unknown[] } | null {
  if (Array.isArray(native)) {
    if (typeof native[0] !== 'string') return null;
    return { name: native[0], fields: native.slice(1) };
  }
  if (native && typeof native === 'object') {
    const keys = Object.keys(native as Record<string, unknown>);
    if (keys.length !== 1) return null;
    const name = keys[0];
    if (typeof name !== 'string') return null;
    const value = (native as Record<string, unknown>)[name];
    return { name, fields: Array.isArray(value) ? value : [value] };
  }
  return null;
}

export function decodeEvent(
  raw: SorobanRpc.Api.EventResponse,
  source: SourceConfig,
): IndexedEvent | null {
  const base = {
    ledger: raw.ledger,
    ledgerClosedAt: raw.ledgerClosedAt,
    pagingToken: raw.pagingToken,
    txHash: raw.txHash,
  };
  const [topic0, topic1] = raw.topic ?? [];
  try {
    if (topic0 && scValToNative(topic0) !== source.symbol) return null;

    // Preferred path: the variant name lives in the event data.
    const native = scValToNative(raw.value);
    const split = splitVariant(native);
    if (split) {
      const type = source.variants[split.name];
      if (type) return { ...base, type, ...source.parse(split.fields) };
    }

    // Legacy path: variant index in the second topic.
    if (topic1) {
      const v = scValToNative(topic1);
      const index = typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : null;
      if (index !== null) {
        const type = source.legacyVariants[index];
        if (type) {
          const fields = Array.isArray(native) ? native : [];
          return { ...base, type, ...source.parse(fields) };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

interface EventSourceLookup {
  getLatestLedger: () => Promise<{ sequence: number }>;
  getEvents: (params: SorobanRpc.Server.GetEventsRequest) => Promise<{
    events?: SorobanRpc.Api.EventResponse[];
    cursor?: string;
  }>;
}

/** Decode a raw response down to the events this indexer understands. */
function decodeResponse(
  response: { events?: SorobanRpc.Api.EventResponse[] },
  sourceByContract: Map<string, SourceConfig>,
): IndexedEvent[] {
  const decoded = (response.events || [])
    .filter((e) => e.inSuccessfulContractCall)
    .map((e) => {
      const contractId = e.contractId?.toString();
      const source = contractId ? sourceByContract.get(contractId) : undefined;
      return source ? decodeEvent(e, source) : null;
    })
    .filter((e): e is IndexedEvent => e !== null);

  // Newest first (RPC returns ascending by paging token).
  return decoded.reverse();
}

/**
 * Find a `startLedger` that actually yields events.
 *
 * A window that reaches outside the RPC's event retention returns nothing at
 * all, and nothing distinguishes that from a network where nothing has happened
 * yet. So a cold start walks the window down until it finds events, which makes
 * the indexer independent of any one RPC's retention: a window that is too wide
 * for this deployment is corrected on the first refresh instead of producing a
 * feed that stays empty forever.
 *
 * Only called when there is no cursor, so the extra requests happen once per
 * process, not once per refresh.
 */
async function discoverColdStart(
  rpc: EventSourceLookup,
  filters: SorobanRpc.Api.EventFilter[],
  limit: number,
  sourceByContract: Map<string, SourceConfig>,
): Promise<{ events: IndexedEvent[]; cursor?: string }> {
  const latest = await withRpcTimeout(rpc.getLatestLedger(), 'getLatestLedger');
  let window = lookbackLedgers();

  for (;;) {
    const response = await withRpcTimeout(
      rpc.getEvents({
        startLedger: Math.max(1, latest.sequence - window),
        filters,
        limit,
      }),
      'getEvents',
    );
    const events = decodeResponse(response, sourceByContract);

    if (events.length > 0 || window <= MIN_LOOKBACK_LEDGERS) {
      return { events, cursor: response.cursor };
    }
    window = Math.max(MIN_LOOKBACK_LEDGERS, Math.floor(window / 2));
  }
}

/**
 * Fetch events from the RPC.
 *
 * The first call after a cold start has no cursor, so it searches for the live
 * edge of the event window; subsequent calls page forward from the stored
 * cursor.
 */
async function fetchEvents(limit = 50): Promise<{ events: IndexedEvent[]; cursor?: string }> {
  const rpc = getRpcClient();
  // No `topics` filter, deliberately. The obvious spelling -- `topics: [[], ['*']]`
  // -- is rejected by the RPC with "filter 1 invalid: topic 1 invalid: topic must
  // have at least 1 segment": an empty segment is not a wildcard, it is an error,
  // and every filter in a request is validated before any event is returned. That
  // one invalid filter failed the whole `getEvents` call, which made every read
  // endpoint answer 500 against a live RPC while the unit tests, which mock the
  // RPC, stayed green.
  //
  // Nothing is lost by omitting it: `contractIds` already scopes the query to
  // these exact contracts, and `decodeEvent` verifies the topic symbol matches the
  // source before decoding, so a contract emitting an unexpected topic is dropped
  // rather than misread.
  const filters: SorobanRpc.Api.EventFilter[] = sources().map((source) => ({
    type: 'contract' as const,
    contractIds: [source.contractId],
  }));
  const sourceByContract = new Map(sources().map((s) => [s.contractId, s]));

  if (cursor) {
    const response = await withRpcTimeout(rpc.getEvents({ cursor, filters, limit }), 'getEvents');
    return { events: decodeResponse(response, sourceByContract), cursor: response.cursor };
  }

  return discoverColdStart(rpc, filters, limit, sourceByContract);
}

/**
 * Resolve a `startLedger` inside the configured lookback window.
 *
 * Exported for the tests that pin the window; the cold-start path goes through
 * `discoverColdStart`, which uses this as the upper bound of its search.
 */
export async function startLedgerFor(rpc: {
  getLatestLedger: () => Promise<{ sequence: number }>;
}): Promise<number> {
  const latest = await rpc.getLatestLedger();
  return Math.max(1, latest.sequence - lookbackLedgers());
}

/**
 * Merge a freshly-fetched page into the store.
 *
 * Newest first, deduplicated by paging token. The cursor only ever moves
 * forward, so replacing the store with each page would leave it holding nothing
 * but the events newer than the cursor -- which, on a quiet network, is usually
 * nothing at all. That drained the feed to empty a few seconds after a
 * successful refresh, while the RPC still held a full window of history.
 *
 * Deduplication matters because pages can overlap: a retry after a partial
 * failure, or a cursor the RPC rewinds, would otherwise show the same mint
 * twice in the activity feed.
 */
export function mergeEvents(incoming: IndexedEvent[], existing: IndexedEvent[]): IndexedEvent[] {
  const seen = new Set(incoming.map((event) => event.pagingToken));
  const merged = [...incoming, ...existing.filter((event) => !seen.has(event.pagingToken))];

  // Paging tokens are only orderable as strings within one ledger, and pages can
  // arrive with the same ledger, so order on the ledger first and the token only
  // as a tie-break.
  merged.sort((a, b) => b.ledger - a.ledger || (a.pagingToken < b.pagingToken ? 1 : -1));
  return merged.slice(0, MAX_STORED_EVENTS);
}

/**
 * Refresh the in-memory store from the RPC. Deduplicates concurrent calls so
 * a burst of requests triggers a single network round-trip.
 */
export async function refreshIndexer(force = false): Promise<IndexedEvent[]> {
  const now = Date.now();
  if (!force && now - lastRefreshAt < 15_000) {
    return events;
  }
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const fresh = await fetchEvents();
      events = mergeEvents(fresh.events, events);
      if (fresh.cursor) cursor = fresh.cursor;
      lastRefreshAt = Date.now();
      lastError = null;
      logger.debug('indexer refreshed', { eventCount: events.length, cursor });
      return events;
    } catch (err) {
      // Record the failure before rethrowing. Callers surface the error to their
      // own client, and `getIndexerHealth` reports it so a monitor can alert on
      // a feed that has stopped advancing rather than only learning about it
      // from a user noticing an empty list.
      lastError = {
        message: errorMessage(err),
        at: Date.now(),
      };
      logger.warn('indexer refresh failed', {
        error: lastError.message,
        eventCount: events.length,
      });
      throw normalizeError(err);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** Return the current event store without triggering a refresh. */
export function getIndexedEvents(): IndexedEvent[] {
  return events;
}

export function getIndexerState() {
  return { eventCount: events.length, cursor, lastRefreshAt };
}

export interface IndexerHealth {
  eventCount: number;
  /** Epoch milliseconds of the last successful refresh (0 when never). */
  lastRefreshAt: number;
  /** Seconds since the last successful refresh, or -1 when there has never been one. */
  ageSeconds: number;
  /** True when the store has never refreshed, or has not refreshed recently. */
  stalled: boolean;
  lastErrorMessage: string | null;
  lastErrorAt: number | null;
}

/**
 * Machine-readable progress report for the indexer.
 *
 * The store is the only thing standing between the RPC's event log and the list
 * endpoints, and it fails quietly: when polling stops, `/api/nfts` and
 * `/api/search` keep answering `200` with stale or empty data. A readiness probe
 * is not the right place to fail for that (the app can still mint), so this is
 * reported as its own signal that a monitor can alert on without taking the
 * instance out of rotation.
 */
export function getIndexerHealth(now = Date.now()): IndexerHealth {
  const age = lastRefreshAt === 0 ? Number.POSITIVE_INFINITY : now - lastRefreshAt;
  return {
    eventCount: events.length,
    lastRefreshAt,
    ageSeconds: Number.isFinite(age) ? Math.round(age / 1000) : -1,
    stalled: lastRefreshAt === 0 || age > INDEXER_STALE_AFTER_MS,
    lastErrorMessage: lastError?.message ?? null,
    lastErrorAt: lastError?.at ?? null,
  };
}

/** Reset module state. Test-only. */
export function __resetIndexer(): void {
  events = [];
  cursor = undefined;
  lastRefreshAt = 0;
  lastError = null;
  refreshPromise = null;
}

/** Types of events currently stored. */
export function indexerStats(): Record<IndexedEventType, number> {
  const counts: Record<IndexedEventType, number> = {
    nft_minted: 0,
    collection_created: 0,
    contracts_set: 0,
    creator_registered: 0,
    creator_updated: 0,
    creator_verified: 0,
  };
  for (const event of events) counts[event.type] += 1;
  return counts;
}
