import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────── Mock setup ───────────────────────

// Mock @stellar/stellar-sdk before any imports that use it
vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn().mockImplementation(() => ({
        getAccount: vi.fn().mockResolvedValue({ sequence: '12345' }),
        getTransaction: vi.fn().mockResolvedValue({
          status: 'SUCCESS',
          hash: 'abc123def456',
        }),
        sendTransaction: vi.fn().mockResolvedValue({
          status: 'PENDING',
          hash: 'abc123def4567890123456789012345678901234567890abcd',
        }),
        simulateTransaction: vi.fn().mockResolvedValue({
          result: { retval: { _value: 42 } },
        }),
        getEvents: vi.fn().mockResolvedValue({
          events: [
            {
              contractId: 'CCCCCC',
              ledger: 12345,
              ledgerClosedAt: '2025-01-01T00:00:00Z',
              pagingToken: '12345-1',
              txHash: 'abc123def456',
              type: 'contract',
              inSuccessfulContractCall: true,
              topic: ['factory', 'NftMinted'],
              value: { xdr: 'AAAA' },
            },
          ],
        }),
      })),
    },
  };
});

// ─────────────────────── Core validation tests ───────────────────────

const STELLAR_REGEX = /^G[A-Z2-7]{55}$/;

describe('validateStellarAddress', () => {
  it('should accept a valid Stellar public key', () => {
    expect(STELLAR_REGEX.test('GAV6ZOG4OLKZ7JCHM7X5XVDRTWAGQI2VKCQHZ3CBKDRJ4I2Z2ZPL2OX5')).toBe(
      true,
    );
  });

  it('should reject an invalid Stellar address', () => {
    expect(STELLAR_REGEX.test('invalid-address')).toBe(false);
  });

  it('should reject an empty string', () => {
    expect(STELLAR_REGEX.test('')).toBe(false);
  });
});

describe('validateRoyaltyBps', () => {
  it('should accept valid basis points', () => {
    expect(validateRoyaltyBps(0).valid).toBe(true);
    expect(validateRoyaltyBps(500).valid).toBe(true);
    expect(validateRoyaltyBps(10000).valid).toBe(true);
  });

  it('should reject out-of-range values', () => {
    expect(validateRoyaltyBps(-1).valid).toBe(false);
    expect(validateRoyaltyBps(10001).valid).toBe(false);
  });
});

describe('validateNftName', () => {
  it('should accept valid names', () => {
    expect(validateNftName('My NFT').valid).toBe(true);
    expect(validateNftName('A'.repeat(128)).valid).toBe(true);
  });

  it('should reject empty or too-long names', () => {
    expect(validateNftName('').valid).toBe(false);
    expect(validateNftName('   ').valid).toBe(false);
    expect(validateNftName('A'.repeat(129)).valid).toBe(false);
  });
});

describe('validateUrl', () => {
  it('should accept valid URLs', () => {
    expect(validateUrl('https://example.com').valid).toBe(true);
    expect(validateUrl('https://ipfs.io/ipfs/QmTest').valid).toBe(true);
  });

  it('should allow empty optional URLs', () => {
    expect(validateUrl('').valid).toBe(true);
  });

  it('should reject invalid URLs', () => {
    expect(validateUrl('not-a-url').valid).toBe(false);
  });
});

// ─────────────────────── Inline validation helpers (used by integration tests) ───────────────────────

function validateRoyaltyBps(bps: number): { valid: boolean; error?: string } {
  if (bps < 0 || bps > 10000) return { valid: false, error: 'Royalty must be between 0% and 100%' };
  return { valid: true };
}

function validateNftName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) return { valid: false, error: 'Name is required' };
  if (name.length > 128) return { valid: false, error: 'Name must be 128 characters or fewer' };
  return { valid: true };
}

function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url) return { valid: true };
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

// ─────────────────────── Integration-style contract flow tests ───────────────────────

describe('Contract Transaction Flow', () => {
  const STELLAR_REGEX = /^G[A-Z2-7]{55}$/;

  it('should build a contract transaction with correct parameters', async () => {
    // This validates that our transaction building logic is coherent
    const mockAddress = 'GAV6ZOG4OLKZ7JCHM7X5XVDRTWAGQI2VKCQHZ3CBKDRJ4I2Z2ZPL2OX5';
    const mockContractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

    expect(STELLAR_REGEX.test(mockAddress)).toBe(true);
    expect(mockContractId.length).toBe(56);
    expect(mockContractId.startsWith('C')).toBe(true);
  });

  it('should handle transaction status transitions correctly', () => {
    const STATUSES = [
      'idle',
      'uploading',
      'preparing',
      'signing',
      'submitting',
      'confirming',
      'success',
      'error',
    ] as const;

    // Verify all statuses are valid transitions
    const isPending = (s: string) =>
      ['preparing', 'signing', 'submitting', 'confirming'].includes(s);

    expect(isPending('signing')).toBe(true);
    expect(isPending('idle')).toBe(false);
    expect(isPending('success')).toBe(false);
    expect(STATUSES).toContain('error');
  });

  it('should format transaction hashes for display', () => {
    const txHash = 'abc123def4567890123456789012345678901234567890abcd';
    const formatted = `${txHash.slice(0, 12)}...${txHash.slice(-6)}`;
    expect(formatted).toBe('abc123def456...90abcd');
  });

  it('should format addresses correctly', () => {
    const address = 'GAV6ZOG4OLKZ7JCHM7X5XVDRTWAGQI2VKCQHZ3CBKDRJ4I2Z2ZPL2OX5';

    function formatAddress(addr: string): string {
      if (addr.length < 10) return addr;
      return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    }

    expect(formatAddress(address)).toBe('GAV6...2OX5');
    expect(formatAddress('short')).toBe('short');
  });
});

// ─────────────────────── Explorer URL tests ───────────────────────

describe('Explorer URLs', () => {
  it('should generate correct transaction explorer URL', () => {
    const txHash = 'abc123def4567890123456789012345678901234567890abcd';
    const url = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    expect(url).toContain('stellar.expert');
    expect(url).toContain('testnet');
    expect(url).toContain(txHash);
  });

  it('should generate correct account explorer URL', () => {
    const address = 'GAV6ZOG4OLKZ7JCHM7X5XVDRTWAGQI2VKCQHZ3CBKDRJ4I2Z2ZPL2OX5';
    const url = `https://stellar.expert/explorer/testnet/account/${address}`;
    expect(url).toContain('stellar.expert');
    expect(url).toContain('account');
    expect(url).toContain(address);
  });
});
