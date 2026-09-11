import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { xdr, Address, Keypair } from '@stellar/stellar-sdk';

// Decode logic is exercised through the exported refresh path with a mocked
// RPC getEvents. Fixtures are built the way the Soroban host actually encodes
// a `#[contracttype]` enum: ONE topic (the contract symbol) and an event value
// of `ScVal::Vec([Symbol("VariantName"), ...fields])`. Verified against the
// host, so this test fails if the decoder regresses to the old assumption that
// the variant index arrives in a second topic.
vi.mock('@/services/stellar', () => ({
  getRpcClient: () => mockedRpc,
  CURRENT_NETWORK: { passphrase: 'Test SDF Network ; September 2015', rpcUrl: 'http://x' },
}));

vi.mock('@/services', () => ({
  CONTRACT_IDS: {
    nft: 'N',
    collection: 'C',
    royalty: 'R',
    creator: 'CR',
    factory: 'F',
  },
}));

vi.mock('@/lib/server/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const FACTORY = 'F';
const CREATOR = 'CR';

const mockedRpc = {
  getEvents: vi.fn(),
  getLatestLedger: vi.fn().mockResolvedValue({ sequence: 100_000 }),
};

// Import after mocks are registered.
const {
  refreshIndexer,
  getIndexedEvents,
  indexerStats,
  getIndexerState,
  getIndexerHealth,
  __resetIndexer,
} = await import('@/lib/server/indexer');

const ACTOR = Keypair.random().publicKey();

function scvSymbol(value: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(value);
}

function scvU64(value: number): xdr.ScVal {
  return xdr.ScVal.scvU64(new xdr.Uint64(value));
}

function scvAddress(value: string): xdr.ScVal {
  return new Address(value).toScVal();
}

/**
 * Build an event exactly as the host emits it: the contract symbol as the only
 * topic, and the enum variant (name first, then fields) as the value.
 */
function contractEvent(opts: {
  contractId: string;
  symbol: string;
  variant: string;
  fields: xdr.ScVal[];
  ledger?: number;
  txHash?: string;
}) {
  const ledger = opts.ledger ?? 90;
  return {
    id: `event-${ledger}-${opts.variant}`,
    type: 'contract',
    ledger,
    ledgerClosedAt: '2026-08-02T00:00:00Z',
    pagingToken: `p-${ledger}-${opts.variant}`,
    inSuccessfulContractCall: true,
    txHash: opts.txHash ?? 'tx1',
    contractId: { toString: () => opts.contractId },
    topic: [scvSymbol(opts.symbol)],
    value: xdr.ScVal.scvVec([scvSymbol(opts.variant), ...opts.fields]),
  };
}

function factoryEvent(variant: string, fields: xdr.ScVal[], ledger = 90) {
  return contractEvent({ contractId: FACTORY, symbol: 'factory', variant, fields, ledger });
}

function creatorEvent(variant: string, fields: xdr.ScVal[], ledger = 90) {
  return contractEvent({ contractId: CREATOR, symbol: 'creator', variant, fields, ledger });
}

describe('indexer', () => {
  beforeEach(() => {
    mockedRpc.getEvents.mockReset();
    mockedRpc.getLatestLedger.mockReset();
    mockedRpc.getLatestLedger.mockResolvedValue({ sequence: 100_000 });
    __resetIndexer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes factory events from the variant name in the event data', async () => {
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100,
      cursor: 'c-100',
      events: [
        factoryEvent('CollectionCreated', [scvU64(7), scvAddress(ACTOR)], 90),
        factoryEvent('NftMinted', [scvU64(42), scvAddress(ACTOR)], 91),
        factoryEvent(
          'ContractsSet',
          [scvAddress(ACTOR), scvAddress(ACTOR), scvAddress(ACTOR), scvAddress(ACTOR)],
          92,
        ),
      ],
    });

    await refreshIndexer(true);

    const all = getIndexedEvents();
    expect(all).toHaveLength(3);
    // Newest first.
    expect(all[0]!.type).toBe('contracts_set');
    expect(all[1]!.type).toBe('nft_minted');
    expect(all[1]!.id).toBe(42);
    expect(all[1]!.actor).toBe(ACTOR);
    expect(all[2]!.type).toBe('collection_created');
    expect(all[2]!.id).toBe(7);
  });

  it('decodes every creator variant, keyed by name rather than position', async () => {
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100,
      cursor: 'c-100',
      events: [
        creatorEvent('Registered', [scvAddress(ACTOR)], 80),
        creatorEvent('ProfileUpdated', [scvAddress(ACTOR)], 81),
        creatorEvent('Verified', [scvAddress(ACTOR)], 82),
      ],
    });

    await refreshIndexer(true);

    const stats = indexerStats();
    expect(stats.creator_registered).toBe(1);
    expect(stats.creator_updated).toBe(1);
    expect(stats.creator_verified).toBe(1);
    expect(getIndexedEvents().every((e) => e.actor === ACTOR)).toBe(true);
  });

  it('skips events from other contracts and unknown variants', async () => {
    const foreign = factoryEvent('NftMinted', [scvU64(1), scvAddress(ACTOR)], 50);
    foreign.contractId = { toString: () => 'OTHER' };
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 50,
      cursor: 'c-50',
      events: [foreign, factoryEvent('SomethingElse', [scvU64(2)], 51)],
    });

    await refreshIndexer(true);
    expect(getIndexedEvents()).toHaveLength(0);
  });

  it('still decodes the legacy two-topic variant-index encoding', async () => {
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100,
      cursor: 'c-100',
      events: [
        {
          id: 'legacy',
          type: 'contract',
          ledger: 95,
          ledgerClosedAt: '2026-08-02T00:00:00Z',
          pagingToken: 'p-95',
          inSuccessfulContractCall: true,
          txHash: 'tx-legacy',
          contractId: { toString: () => FACTORY },
          topic: [scvSymbol('factory'), xdr.ScVal.scvU32(1)],
          value: xdr.ScVal.scvVec([scvU64(9), scvAddress(ACTOR)]),
        },
      ],
    });

    await refreshIndexer(true);
    const all = getIndexedEvents();
    expect(all).toHaveLength(1);
    expect(all[0]!.type).toBe('nft_minted');
    expect(all[0]!.id).toBe(9);
  });

  it('starts from a ledger inside the event window, never zero', async () => {
    mockedRpc.getEvents.mockResolvedValue({ latestLedger: 100_000, cursor: 'c-1', events: [] });

    await refreshIndexer(true);

    const params = mockedRpc.getEvents.mock.calls[0]![0];
    expect(params.startLedger).toBeGreaterThan(0);
    // latest 100_000 minus the 10_000-ledger lookback.
    expect(params.startLedger).toBe(90_000);
    // No cursor yet, so the request uses startLedger rather than cursor.
    expect(params.cursor).toBeUndefined();
  });

  // The measured failure this guards: the public testnet RPC returned events for
  // a 10,500-ledger lookback and *zero* events for 11,000, with no error either
  // way. A fixed window that is too wide therefore produces a feed that stays
  // empty forever, which is what the previous hardcoded 17,000 did.
  it('shrinks the window until the RPC returns events', async () => {
    mockedRpc.getEvents
      .mockResolvedValueOnce({ latestLedger: 100_000, cursor: 'c-1', events: [] })
      .mockResolvedValue({
        latestLedger: 100_000,
        cursor: 'c-2',
        events: [factoryEvent('NftMinted', [scvU64(7), scvAddress(ACTOR)])],
      });

    await refreshIndexer(true);

    const [first, second] = mockedRpc.getEvents.mock.calls;
    expect(first![0].startLedger).toBe(90_000);
    // Halved: the too-wide window yielded nothing, so the search narrows.
    expect(second![0].startLedger).toBe(95_000);
    expect(indexerStats().nft_minted).toBe(1);
  });

  // Without a deadline on the RPC call, a hung upstream does not fail a refresh
  // -- it never settles, and because concurrent callers share one in-flight
  // refresh promise, every endpoint that touches the store waits with it.
  // `/api/stats` was observed at 71 seconds before the client gave up.
  it('fails a refresh whose RPC call never settles, rather than hanging', async () => {
    vi.useFakeTimers();
    try {
      // A promise that never resolves or rejects: the hung upstream.
      mockedRpc.getEvents.mockReturnValue(new Promise(() => {}));

      const pending = refreshIndexer(true);
      const assertion = expect(pending).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(8_000);
      await assertion;

      expect(getIndexerHealth().lastErrorMessage).toMatch(/timed out/i);
      expect(getIndexerHealth().stalled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // The cursor only moves forward, so replacing the store with each page left it
  // holding only what was newer than the cursor -- nothing, on a quiet network --
  // and the feed drained to empty seconds after a successful refresh.
  it('keeps events across refreshes instead of draining the store', async () => {
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100_000,
      cursor: 'cursor-1',
      events: [factoryEvent('NftMinted', [scvU64(5), scvAddress(ACTOR)], 100_000)],
    });
    await refreshIndexer(true);
    expect(indexerStats().nft_minted).toBe(1);

    // Next poll finds nothing new, which is the normal case.
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100_010,
      cursor: 'cursor-2',
      events: [],
    });
    await refreshIndexer(true);

    expect(getIndexerState().eventCount).toBe(1);
    expect(indexerStats().nft_minted).toBe(1);
  });

  it('does not double-count an event that appears in two pages', async () => {
    const repeated = factoryEvent('NftMinted', [scvU64(5), scvAddress(ACTOR)], 100_000);
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100_000,
      cursor: 'cursor-1',
      events: [repeated],
    });
    await refreshIndexer(true);

    // A retry or a rewound cursor can re-deliver a page.
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100_010,
      cursor: 'cursor-2',
      events: [repeated],
    });
    await refreshIndexer(true);

    expect(indexerStats().nft_minted).toBe(1);
  });

  // Guards a bug that every unit test passed and no mock could have caught:
  // the filter was sent as `topics: [[], ['*']]`, and a real RPC rejects that
  // with "topic 1 invalid: topic must have at least 1 segment". Because the RPC
  // validates every filter before returning any event, the rejected filter
  // failed the whole call and every read endpoint answered 500 in production.
  //
  // The assertion is about the *absence* of a `topics` key rather than about a
  // particular wildcard spelling, because the safe form is to omit it: the
  // contract filter already scopes the query and the decoder verifies the
  // symbol. A future edit that reintroduces a topic filter has to say why here.
  it('sends no topic filter, which a live RPC rejects when empty', async () => {
    mockedRpc.getEvents.mockResolvedValue({ latestLedger: 100_000, cursor: 'c-1', events: [] });

    await refreshIndexer(true);

    const params = mockedRpc.getEvents.mock.calls[0]![0];
    expect(params.filters).toBeDefined();
    expect(params.filters.length).toBeGreaterThan(0);
    for (const filter of params.filters) {
      expect(filter).toHaveProperty('type', 'contract');
      expect(filter.contractIds?.length).toBeGreaterThan(0);
      expect(filter).not.toHaveProperty('topics');
    }
  });

  it('pages forward with the cursor once one is known', async () => {
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100_000,
      cursor: 'cursor-1',
      events: [factoryEvent('NftMinted', [scvU64(5), scvAddress(ACTOR)], 100_000)],
    });
    await refreshIndexer(true);

    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100_010,
      cursor: 'cursor-2',
      events: [],
    });
    await refreshIndexer(true);

    const second = mockedRpc.getEvents.mock.calls[1]![0];
    expect(second.cursor).toBe('cursor-1');
    expect(second.startLedger).toBeUndefined();
  });

  it('caches results within the TTL window', async () => {
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100,
      cursor: 'c-100',
      events: [factoryEvent('NftMinted', [scvU64(5), scvAddress(ACTOR)])],
    });

    await refreshIndexer(true);
    await refreshIndexer();
    expect(mockedRpc.getEvents).toHaveBeenCalledTimes(1);
    expect(indexerStats().nft_minted).toBe(1);
    expect(getIndexerState().eventCount).toBe(1);
  });

  it('serves stale events when a refresh fails', async () => {
    mockedRpc.getEvents
      .mockResolvedValueOnce({
        latestLedger: 100,
        cursor: 'c-100',
        events: [factoryEvent('NftMinted', [scvU64(9), scvAddress(ACTOR)])],
      })
      .mockRejectedValueOnce(new Error('rpc down'));

    await refreshIndexer(true);
    await expect(refreshIndexer(true)).rejects.toThrow();
    expect(getIndexedEvents()).toHaveLength(1);
  });
});

/**
 * The indexer is the only path from the RPC event log to the list endpoints and
 * it fails quietly: when polling stops, `/api/nfts` and `/api/search` keep
 * answering `200` with stale data. `getIndexerHealth` is the signal that makes
 * that observable to something outside the process.
 */
describe('getIndexerHealth', () => {
  it('reports a store that has never refreshed as stalled', () => {
    __resetIndexer();
    const health = getIndexerHealth();
    expect(health.stalled).toBe(true);
    expect(health.ageSeconds).toBe(-1);
    expect(health.eventCount).toBe(0);
    expect(health.lastErrorMessage).toBeNull();
  });

  it('reports progress after a successful refresh', async () => {
    __resetIndexer();
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100,
      cursor: 'c-1',
      events: [factoryEvent('NftMinted', [scvU64(1), scvAddress(ACTOR)])],
    });
    await refreshIndexer(true);

    const health = getIndexerHealth();
    expect(health.stalled).toBe(false);
    expect(health.ageSeconds).toBe(0);
    expect(health.eventCount).toBe(1);
  });

  it('records the failure so a stalled feed is observable, not only logged', async () => {
    __resetIndexer();
    mockedRpc.getEvents.mockRejectedValue(new Error('rpc down'));
    await expect(refreshIndexer(true)).rejects.toThrow();

    const health = getIndexerHealth();
    expect(health.stalled).toBe(true);
    expect(health.lastErrorMessage).toContain('rpc down');
    expect(health.lastErrorAt).toBeGreaterThan(0);
  });
});
