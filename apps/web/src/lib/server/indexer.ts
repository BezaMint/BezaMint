/**
 * Minimal on-chain event indexer.
 *
 * Polls the Factory and Creator contracts' emitted events from the Soroban
 * RPC and keeps a bounded in-memory store of the most recent records. API
 * routes read from this store instead of doing ad-hoc RPC scans, so list
 * endpoints stay fast and consistent.
 *
 * Event variant indices are decoded directly from the contract enum ordering:
 *  - Factory:  0 = ContractsSet, 1 = NftMinted, 2 = CollectionCreated
 *  - Creator:  0 = Registered, 1 = ProfileUpdated, 2 = Verified
 */
import { xdr, scValToNative, rpc as SorobanRpc } from '@stellar/stellar-sdk';
import { getRpcClient } from '@/services/stellar';
import { CONTRACT_IDS } from '@/services';
import { normalizeError } from './errors';
import { logger } from './logger';

export type IndexedEventType =
  'nft_minted' | 'collection_created' | 'contracts_set' | 'creator_registered';

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

interface SourceConfig {
  contractId: string;
  /** topic[0] symbol emitted by the contract. */
  symbol: string;
  /** Variant index -> event type. */
  variants: Record<number, IndexedEventType>;
  /** Parse the event payload into (id, actor). */
  parse: (value: unknown) => { id?: number; actor?: string };
}

const FACTORY_VARIANTS: Record<number, IndexedEventType> = {
  0: 'contracts_set',
  1: 'nft_minted',
  2: 'collection_created',
};

const CREATOR_VARIANTS: Record<number, IndexedEventType> = {
  0: 'creator_registered',
};

function parseIdActor(value: unknown): { id?: number; actor?: string } {
  if (!Array.isArray(value)) return {};
  const [id, actor] = value as [number | bigint, string];
  const numericId = typeof id === 'number' || typeof id === 'bigint' ? Number(id) : undefined;
  return { id: numericId, actor: typeof actor === 'string' ? actor : undefined };
}

function sources(): SourceConfig[] {
  return [
    {
      contractId: CONTRACT_IDS.factory,
      symbol: 'factory',
      variants: FACTORY_VARIANTS,
      parse: parseIdActor,
    },
    {
      contractId: CONTRACT_IDS.creator,
      symbol: 'creator',
      variants: CREATOR_VARIANTS,
      parse: (value: unknown) => parseIdActor([undefined, value]),
    },
  ].filter((s) => s.contractId) as SourceConfig[];
}

let events: IndexedEvent[] = [];
let cursor: string | undefined;
let lastRefreshAt = 0;
let refreshPromise: Promise<IndexedEvent[]> | null = null;

function decodeEvent(raw: SorobanRpc.Api.EventResponse, source: SourceConfig): IndexedEvent | null {
  const base = {
    ledger: raw.ledger,
    ledgerClosedAt: raw.ledgerClosedAt,
    pagingToken: raw.pagingToken,
    txHash: raw.txHash,
  };
  const [topic0, topic1] = raw.topic;
  try {
    if (topic0 && scValToNative(topic0) !== source.symbol) return null;
    let variant: number | null = null;
    if (topic1) {
      const v = scValToNative(topic1);
      variant = typeof v === 'number' ? v : null;
    }
    if (variant === null) return null;

    const type = source.variants[variant];
    if (!type) return null;

    return { ...base, type, ...source.parse(scValToNative(raw.value)) };
  } catch {
    return null;
  }
}

/** Fetch the latest events from the RPC (bounded, non-paginated scan). */
async function fetchEvents(limit = 50): Promise<IndexedEvent[]> {
  const response = await getRpcClient().getEvents({
    startLedger: 0,
    filters: sources().flatMap((source) => [
      {
        type: 'contract' as const,
        contractIds: [source.contractId],
        topics: [[], ['*']],
      },
    ]),
    limit,
  });

  cursor = response.cursor;
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
  return decoded.reverse();
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
      events = fresh.slice(0, MAX_STORED_EVENTS);
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

/** Types of events currently stored. */
export function indexerStats() {
  const counts: Record<IndexedEventType, number> = {
    nft_minted: 0,
    collection_created: 0,
    contracts_set: 0,
    creator_registered: 0,
  };
  for (const event of events) counts[event.type] += 1;
  return counts;
}
