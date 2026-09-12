import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const ADDRESS_A = 'GCVAA3SLZK7V45R75UGBQF7MZZJRGJX2QDTXLW3K5VB3NSOOUVU7XW3Q';
const ADDRESS_B = 'GBD6V7X3ZJZO2BVOX4NLO2TVXJXPJ2N5L5SYN7QZHZCHNU2ZQ5O2H7YY';
const ADDRESS_C = 'GCVAA3SLZK7V45R75UGBQF7MZZJRGJX2QDTXLW3K5VB3NSOOUVU7XABC';

vi.mock('@/services/stellar', () => ({
  getHorizonServer: () => mockedHorizon,
}));

vi.mock('@/services', () => ({
  CONTRACT_IDS: { nft: 'NFT_CONTRACT', collection: 'C', royalty: 'R', creator: 'CR', factory: 'F' },
}));

vi.mock('@/lib/server/contractReader', () => ({
  simulateRead: vi.fn().mockResolvedValue(3),
  addressScVal: vi.fn((address: string) => address),
}));

vi.mock('@/lib/server/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  newRequestId: () => 'test-request',
  timeRequest: () => ({ done: vi.fn() }),
}));

const mockedHorizon = {
  loadAccount: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedHorizon.loadAccount.mockReset();
});

describe('GET /api/wallet/balance', () => {
  it('returns xlm and nft balances for a funded account', async () => {
    mockedHorizon.loadAccount.mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '12.5' }],
    });

    const request = new NextRequest(`http://localhost/api/wallet/balance?address=${ADDRESS_A}`);
    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.xlm).toEqual({ balance: '12.5', isFunded: true });
    expect(body.data.nfts).toEqual({ balance: 3 });
  });

  it('reports an unfunded account as zero balance', async () => {
    // Horizon answers a funded lookup with 200 and an account that has never
    // been funded with 404. Both are 200 from this route; the SDK's error
    // carries the response, so that is what the distinction is made on.
    mockedHorizon.loadAccount.mockRejectedValue(
      Object.assign(new Error('Not Found'), { response: { status: 404 } }),
    );

    const request = new NextRequest(`http://localhost/api/wallet/balance?address=${ADDRESS_B}`);
    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.xlm).toEqual({ balance: '0', isFunded: false });
  });

  it('does not report a Horizon failure as an empty wallet', async () => {
    // The same catch used to answer `0 XLM, unfunded` for every failure, so an
    // outage looked exactly like a wallet with nothing in it.
    //
    // A distinct address, because the route caches per address and a case that
    // reuses one would be answered from the previous case's cached payload.
    mockedHorizon.loadAccount.mockRejectedValue(new Error('ECONNRESET'));

    const request = new NextRequest(`http://localhost/api/wallet/balance?address=${ADDRESS_C}`);
    const response = await GET(request);
    expect(response.status).toBe(502);

    const body = await response.json();
    expect(body.error.code).toBe('WALLET_BALANCE_UNAVAILABLE');
    expect(body.error.errorCode).toMatch(/^BM-API-/);
  });

  it('rejects a missing address', async () => {
    const request = new NextRequest('http://localhost/api/wallet/balance');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('rejects a malformed address', async () => {
    const request = new NextRequest('http://localhost/api/wallet/balance?address=not-an-address');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });
});
