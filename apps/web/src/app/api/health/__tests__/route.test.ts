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

vi.mock('@/lib/server/http', () => ({
  withTimeout: <T>(promise: Promise<T>) => promise,
  fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
  FetchTimeoutError: class extends Error {},
}));

const { GET } = await import('../route');
const { CONTRACT_IDS } = await import('@/services');

describe('GET /api/health', () => {
  beforeEach(() => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 1234 });
    mockIsIpfsAvailable.mockReturnValue(true);
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

  it('ignores IPFS reachability when Pinata is not configured', async () => {
    mockIsIpfsAvailable.mockReturnValue(false);

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.checks.ipfs.configured).toBe(false);
  });
});
