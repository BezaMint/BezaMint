import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { xdr, Address } from '@stellar/stellar-sdk';

// Decode logic is exercised through the exported refresh path; the decode
// helpers are internal, so test via the module's public surface with a mocked
// RPC getEvents.
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

const mockedRpc = {
  getEvents: vi.fn(),
};

// Import after mocks are registered.
const { refreshIndexer, getIndexedEvents, indexerStats, getIndexerState } =
  await import('@/lib/server/indexer');

function scvSymbol(value: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(value);
}

function scvU32(value: number): xdr.ScVal {
  return xdr.ScVal.scvU32(value);
}

function scvU64(value: number): xdr.ScVal {
  return xdr.ScVal.scvU64(new xdr.Uint64(value));
}

function scvAddress(value: string): xdr.ScVal {
  return new Address(value).toScVal();
}

function factoryEvent(
  ledger: number,
  variant: number,
  payload: xdr.ScVal[],
  txHash = 'tx1',
  pagingToken = `p-${ledger}`,
) {
  return {
    id: `event-${ledger}`,
    type: 'contract',
    ledger,
    ledgerClosedAt: '2026-08-02T00:00:00Z',
    pagingToken,
    inSuccessfulContractCall: true,
    txHash,
    contractId: { toString: () => 'F' },
    topic: [scvSymbol('factory'), scvU32(variant)],
    value: xdr.ScVal.scvVec(payload),
  };
}

describe('indexer', () => {
  beforeEach(() => {
    mockedRpc.getEvents.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes factory mint and collection events with correct variant indices', async () => {
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100,
      cursor: 'c-100',
      events: [
        factoryEvent(
          90,
          2,
          [scvU64(7), scvAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF')],
          'txA',
          'p-90',
        ),
        factoryEvent(
          91,
          1,
          [scvU64(42), scvAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF')],
          'txB',
          'p-91',
        ),
        factoryEvent(
          92,
          0,
          [
            scvAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
            scvAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
            scvAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
            scvAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
          ],
          'txC',
          'p-92',
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
    expect(all[1]!.actor).toBe('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
    expect(all[2]!.type).toBe('collection_created');
    expect(all[2]!.id).toBe(7);
  });

  it('skips events from other contracts and unparseable payloads', async () => {
    const foreign = factoryEvent(50, 1, [
      scvU64(1),
      scvAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
    ]);
    foreign.contractId = { toString: () => 'OTHER' };
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 50,
      cursor: 'c-50',
      events: [foreign, { ...factoryEvent(51, 9, [scvU64(2)]) }],
    });

    await refreshIndexer(true);
    expect(getIndexedEvents()).toHaveLength(0);
  });

  it('caches results within the TTL window', async () => {
    mockedRpc.getEvents.mockResolvedValue({
      latestLedger: 100,
      cursor: 'c-100',
      events: [
        factoryEvent(90, 1, [
          scvU64(5),
          scvAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
        ]),
      ],
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
        events: [
          factoryEvent(90, 1, [
            scvU64(9),
            scvAddress('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'),
          ]),
        ],
      })
      .mockRejectedValueOnce(new Error('rpc down'));

    await refreshIndexer(true);
    await expect(refreshIndexer(true)).rejects.toThrow();
    expect(getIndexedEvents()).toHaveLength(1);
  });
});
