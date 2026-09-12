import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The health route is a readiness gate, so it is tested on the two things a
 * deploy actually gets wrong: unreachable dependencies, and unset contract IDs.
 * The second case previously reported 200 because the contract configuration was
 * computed and then never consulted in the healthy decision.
 */

const CONTRACTS = {
  nft: 'N',
  collection: 'C',
  royalty: 'R',
  creator: 'CR',
  factory: 'F',
};

const mockGetLatestLedger = vi.fn().mockResolvedValue({ sequence: 1234 });
const mockIsIpfsAvailable = vi.fn().mockReturnValue(true);
const mockRefreshIndexer = vi.fn().mockResolvedValue([]);
const mockGetIndexerHealth = vi.fn().mockReturnValue({
  eventCount: 3,
  lastRefreshAt: 1_700_000_000_000,
  ageSeconds: 0,
  stalled: false,
  lastErrorMessage: null,
  lastErrorAt: null,
});

vi.mock('@/services/stellar', () => ({
  getRpcClient: () => ({ getLatestLedger: mockGetLatestLedger }),
}));

vi.mock('@/services', () => ({ CONTRACT_IDS: { ...CONTRACTS } }));

vi.mock('@/lib/pinata', () => ({
  isIpfsAvailable: () => mockIsIpfsAvailable(),
}));

vi.mock('@/lib/startup', () => ({
  collectStartupIssues: () => [],
}));

vi.mock('@/lib/server/indexer', () => ({
  refreshIndexer: () => mockRefreshIndexer(),
  getIndexerHealth: () => mockGetIndexerHealth(),
}));

const mockFetchWithTimeout = vi.fn().mockResolvedValue({ ok: true, status: 200 });

vi.mock('@/lib/server/http', () => ({
  withTimeout: <T>(promise: Promise<T>) => promise,
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  FetchTimeoutError: class extends Error {},
}));

const { GET } = await import('../route');
const { CONTRACT_IDS } = await import('@/services');

describe('GET /api/health', () => {
  beforeEach(() => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 1234 });
    mockIsIpfsAvailable.mockReturnValue(true);
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 200 });
    mockRefreshIndexer.mockResolvedValue([]);
    mockGetIndexerHealth.mockReturnValue({
      eventCount: 3,
      lastRefreshAt: 1_700_000_000_000,
      ageSeconds: 0,
      stalled: false,
      lastErrorMessage: null,
      lastErrorAt: null,
    });
    for (const [key, value] of Object.entries(CONTRACTS)) {
      (CONTRACT_IDS as Record<string, string>)[key] = value;
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports healthy when the RPC is reachable and contracts are configured', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.checks.contractsConfigured).toBe(true);
    expect(body.checks.rpc.ok).toBe(true);
  });

  it('reports a build identity so a stale deployment is distinguishable', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.version).toBeDefined();
    expect(body).toHaveProperty('commitSha');
    expect(body.environment).toBeDefined();
  });

  it('is not ready when a contract id is missing, even if every dependency is up', async () => {
    (CONTRACT_IDS as Record<string, string>).nft = '';

    const response = await GET();
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.contractsConfigured).toBe(false);
    expect(body.checks.rpc.ok).toBe(true);
  });

  it('is not ready when the RPC is unreachable', async () => {
    mockGetLatestLedger.mockRejectedValue(new Error('rpc down'));

    const response = await GET();
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.checks.rpc.ok).toBe(false);
    expect(body.checks.rpc.error).toBe('rpc down');
  });

  it('reports indexer progress so a stalled feed is alertable', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.checks.indexer.ok).toBe(true);
    expect(body.checks.indexer.eventCount).toBe(3);
    expect(body.checks.indexer.stalled).toBe(false);
  });

  it('flags a stalled indexer without taking a working instance out of rotation', async () => {
    mockGetIndexerHealth.mockReturnValue({
      eventCount: 0,
      lastRefreshAt: 0,
      ageSeconds: -1,
      stalled: true,
      lastErrorMessage: 'rpc down',
      lastErrorAt: 1_700_000_000_000,
    });

    const response = await GET();
    // The app can still mint, so readiness stays 200; the stalled feed is a
    // separate signal a monitor alerts on.
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.checks.indexer.ok).toBe(false);
    expect(body.checks.indexer.lastErrorMessage).toBe('rpc down');
  });

  it('omits the indexer check when contracts are not configured', async () => {
    (CONTRACT_IDS as Record<string, string>).factory = '';

    const response = await GET();
    const body = await response.json();
    expect(body.checks.indexer).toBeNull();
  });

  it('ignores IPFS reachability when Pinata is not configured', async () => {
    mockIsIpfsAvailable.mockReturnValue(false);

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.checks.ipfs.configured).toBe(false);
  });

  it('stays ready when the gateway throttles this egress IP', async () => {
    // Public gateways answer 429 to datacenter egress while serving the same
    // objects normally to the browsers that read them. Treating that as an
    // outage made a working deployment answer 503 on every check.
    mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 429 });

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.checks.ipfs.ok).toBe(true);
    expect(body.checks.ipfs.status).toBe(429);
    expect(body.checks.ipfs.note).toMatch(/throttl/i);
  });

  it('is not ready when the gateway is down', async () => {
    mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 502 });

    const response = await GET();
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.checks.ipfs.ok).toBe(false);
    expect(body.checks.ipfs.error).toBe('gateway responded 502');
  });

  it('is not ready when the gateway cannot be reached at all', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('gateway probe timed out'));

    const response = await GET();
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.checks.ipfs.ok).toBe(false);
    expect(body.checks.ipfs.gateway).toBeTruthy();
  });
});
