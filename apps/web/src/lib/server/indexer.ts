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
 * Soroban RPC retains only a bounded ledger range and rejects a `startLedger`
 * outside it, so the first fetch starts at `latestLedger - lookback` (clamped
 * into the retention window, overridable via `INDEXER_LOOKBACK_LEDGERS`) and
 * later fetches advance with the response cursor.
 */
import { scValToNative, rpc as SorobanRpc } from '@stellar/stellar-sdk';
import { getRpcClient } from '@/services/stellar';
import { CONTRACT_IDS } from '@/services';
import { normalizeError } from './errors';
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
 * How far back a cold start looks. Soroban RPC retains roughly 17,280 ledgers
 * (~24h at 5s per ledger) and rejects a `startLedger` outside that window;
 * 17,000 leaves headroom for the few ledgers that pass between reading the
 * latest sequence and issuing the events query.
 */
const DEFAULT_LOOKBACK_LEDGERS = 17_000;

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
let refreshPromise: Promise<IndexedEvent[]> | null = null;

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

/**
 * Fetch the latest events from the RPC.
 *
 * The first call after a cold start has no cursor, so it starts from a ledger
 * inside the RPC retention window; subsequent calls page forward from the
 * stored cursor.
 */
async function fetchEvents(limit = 50): Promise<{ events: IndexedEvent[]; cursor?: string }> {
  const rpc = getRpcClient();
  const filters = sources().map((source) => ({
    type: 'contract' as const,
    contractIds: [source.contractId],
    topics: [[], ['*']],
  }));

  const params: SorobanRpc.Server.GetEventsRequest = cursor
    ? { cursor, filters, limit }
    : { startLedger: await startLedgerFor(rpc), filters, limit };

  const response = await rpc.getEvents(params);

  const sourceByContract = new Map(sources().map((s) => [s.contractId, s]));
  const decoded = (response.events || [])
    .filter((e) => e.inSuccessfulContractCall)
    .map((e) => {
      const contractId = e.contractId?.toString();
      const source = contractId ? sourceByContract.get(contractId) : undefined;
      return source ? decodeEvent(e, source) : null;
    })
    .filter((e): e is IndexedEvent => e !== null);

  // Newest first (RPC returns ascending by paging token).
  return { events: decoded.reverse(), cursor: response.cursor };
}

/** Resolve a `startLedger` guaranteed to fall inside the RPC retention window. */
export async function startLedgerFor(rpc: {
  getLatestLedger: () => Promise<{ sequence: number }>;
}): Promise<number> {
  const latest = await rpc.getLatestLedger();
  return Math.max(1, latest.sequence - lookbackLedgers());
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
      // The RPC window is the newest slice of the chain, so replacing the store
      // (rather than appending) keeps it bounded and always reflects the
      // current lookback window.
      events = fresh.events.slice(0, MAX_STORED_EVENTS);
      if (fresh.cursor) cursor = fresh.cursor;
      lastRefreshAt = Date.now();
      logger.debug('indexer refreshed', { eventCount: events.length, cursor });
      return events;
    } catch (err) {
      logger.warn('indexer refresh failed; serving stale events', {
        error: err instanceof Error ? err.message : String(err),
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

/** Reset module state. Test-only. */
export function __resetIndexer(): void {
  events = [];
  cursor = undefined;
  lastRefreshAt = 0;
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
