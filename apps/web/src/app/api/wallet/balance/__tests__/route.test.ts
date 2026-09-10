import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const ADDRESS_A = 'GCVAA3SLZK7V45R75UGBQF7MZZJRGJX2QDTXLW3K5VB3NSOOUVU7XW3Q';
const ADDRESS_B = 'GBD6V7X3ZJZO2BVOX4NLO2TVXJXPJ2N5L5SYN7QZHZCHNU2ZQ5O2H7YY';

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
    mockedHorizon.loadAccount.mockRejectedValue(new Error('account not found'));

    const request = new NextRequest(`http://localhost/api/wallet/balance?address=${ADDRESS_B}`);
    const response = await GET(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.xlm).toEqual({ balance: '0', isFunded: false });
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
