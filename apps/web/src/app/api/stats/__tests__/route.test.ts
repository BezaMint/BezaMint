import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../route';

vi.mock('@/lib/server/indexer', () => ({
  refreshIndexer: vi.fn().mockResolvedValue([]),
  indexerStats: () => ({
    nft_minted: 4,
    collection_created: 2,
    contracts_set: 1,
    creator_registered: 3,
  }),
  getIndexerState: () => ({ eventCount: 10, cursor: 'c', lastRefreshAt: 0 }),
  getIndexedEvents: () => [
    { type: 'nft_minted', ledger: 100, ledgerClosedAt: '', pagingToken: '', txHash: '', id: 1 },
    { type: 'nft_minted', ledger: 105, ledgerClosedAt: '', pagingToken: '', txHash: '', id: 2 },
  ],
}));

vi.mock('@/services', () => ({
  CONTRACT_IDS: { nft: 'N', collection: 'C', royalty: 'R', creator: 'CR', factory: 'F' },
}));

vi.mock('@/lib/server/contractReader', () => ({
  simulateRead: vi.fn().mockResolvedValue(42),
}));

vi.mock('@/lib/server/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  newRequestId: () => 'test-request',
  timeRequest: () => ({ done: vi.fn() }),
}));

describe('GET /api/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns counters, mint volume, and indexer state', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.nftSupply).toBe(42);
    expect(body.data.collections).toBe(42);
    expect(body.data.creators).toBe(42);
    expect(body.data.recentMints.count).toBe(4);
    expect(body.data.recentMints.windowLedgers).toBe(5);
    expect(body.data.indexer.eventCount).toBe(10);
    expect(body.data.updatedAt).toBeDefined();
  });

  it('returns a stable shape when contract reads fail', async () => {
    // Run under a fake clock advanced past the 30s TTL so the module-level
    // cache from the previous test is expired and reads re-run.
    vi.useFakeTimers();
    vi.advanceTimersByTime(31_000);

    const { simulateRead } = await import('@/lib/server/contractReader');
    (simulateRead as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('rpc down'));

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.nftSupply).toBeNull();
    expect(body.data.collections).toBeNull();
    expect(body.data.recentMints.count).toBe(4);
  });
});
