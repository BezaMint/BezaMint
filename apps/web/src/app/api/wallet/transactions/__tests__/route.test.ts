import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

// One address per case. The route caches history per address for 15 seconds, so
// two cases that shared one would have the second answered from the first's
// cached payload -- which is how a case that expects a failure can pass while
// the code under test is not reached at all.
const ADDRESS = 'GCVAA3SLZK7V45R75UGBQF7MZZJRGJX2QDTXLW3K5VB3NSOOUVU7XW3Q';
const EMPTY_ADDRESS = 'GCVAA3SLZK7V45R75UGBQF7MZZJRGJX2QDTXLW3K5VB3NSOOUVU7XABC';
const OUTAGE_ADDRESS = 'GBD6V7X3ZJZO2BVOX4NLO2TVXJXPJ2N5L5SYN7QZHZCHNU2ZQ5O2HXYZ';
const QUERY_FAILURE_ADDRESS = 'GBD6V7X3ZJZO2BVOX4NLO2TVXJXPJ2N5L5SYN7QZHZCHNU2ZQ5O2H7YY';

const mockedLoadAccount = vi.fn();
const mockedCall = vi.fn();

/** The route chains `operations().forAccount().order().limit()` then `.call()`. */
const chain = {
  forAccount: () => chain,
  order: () => chain,
  limit: () => chain,
  cursor: () => chain,
  call: () => mockedCall(),
};

vi.mock('@/services/stellar', () => ({
  getHorizonServer: () => ({ loadAccount: mockedLoadAccount, operations: () => chain }),
}));

vi.mock('@/lib/server/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  newRequestId: () => 'test-request',
  timeRequest: () => ({ done: vi.fn() }),
}));

/** A 404 as Horizon reports a never-funded account. */
const accountMissing = () => Object.assign(new Error('Not Found'), { response: { status: 404 } });

function get(address = ADDRESS, query = '') {
  return GET(
    new NextRequest(`http://localhost/api/wallet/transactions?address=${address}${query}`),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedLoadAccount.mockReset();
  mockedCall.mockReset();
});

describe('GET /api/wallet/transactions', () => {
  it('maps a Horizon page into the client shape', async () => {
    mockedLoadAccount.mockResolvedValue({ balances: [] });
    mockedCall.mockResolvedValue({
      records: [
        {
          id: '1',
          type: 'payment',
          asset_type: 'native',
          amount: '10.0000000',
          from: ADDRESS,
          created_at: '2026-09-12T11:00:00Z',
          transaction_successful: true,
          paging_token: 'tok-1',
        },
      ],
    });

    const response = await get(ADDRESS, '&limit=5');
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.operations).toEqual([
      {
        id: '1',
        type: 'payment',
        asset: 'XLM',
        amount: '10.0000000',
        counterparty: ADDRESS,
        memo: null,
        successful: true,
        createdAt: '2026-09-12T11:00:00Z',
      },
    ]);
    expect(body.pagination.cursor).toBe('tok-1');
  });

  it('answers a never-funded account with an empty history', async () => {
    // A 404 is the account not existing, which is a normal state for a wallet
    // that has not received anything yet.
    mockedLoadAccount.mockRejectedValue(accountMissing());

    const response = await get(EMPTY_ADDRESS);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.operations).toEqual([]);
    expect(body.pagination.cursor).toBeNull();
  });

  it('reports a Horizon outage instead of an empty history', async () => {
    // The lookup failure used to be swallowed: every Horizon failure produced
    // "no transactions", so an outage was indistinguishable from an empty
    // account. Only a 404 means the account is missing.
    mockedLoadAccount.mockRejectedValue(new Error('ETIMEDOUT'));

    const response = await get(OUTAGE_ADDRESS);
    expect(response.status).toBe(502);

    const body = await response.json();
    expect(body.error.code).toBe('HISTORY_UNAVAILABLE');
    expect(body.error.retryable ?? true).toBe(true);
  });

  it('reports a failing operations query', async () => {
    mockedLoadAccount.mockResolvedValue({ balances: [] });
    mockedCall.mockRejectedValue(new Error('Horizon 503'));

    const response = await get(QUERY_FAILURE_ADDRESS);
    expect(response.status).toBe(502);

    const body = await response.json();
    expect(body.error.code).toBe('NETWORK_ERROR');
  });

  it('rejects a malformed address before calling Horizon', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/wallet/transactions?address=nope'),
    );

    expect(response.status).toBe(400);
    expect(mockedLoadAccount).not.toHaveBeenCalled();
  });
});
