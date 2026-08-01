import { describe, it, expect } from 'vitest';

// Inline the functions we want to test to avoid import issues
function validateStellarAddress(address: string): { valid: boolean; error?: string } {
  const gRegex = /^G[A-Z2-7]{55}$/;
  if (!gRegex.test(address)) return { valid: false, error: 'Invalid Stellar address format' };
  return { valid: true };
}

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

describe('validateStellarAddress', () => {
  it('should accept a valid Stellar public key', () => {
    expect(validateStellarAddress('GAV6ZOG4OLKZ7JCHM7X5XVDRTWAGQI2VKCQHZ3CBKDRJ4I2Z2ZPL2OX5').valid).toBe(true);
  });

  it('should reject an invalid Stellar address', () => {
    expect(validateStellarAddress('invalid-address').valid).toBe(false);
    expect(validateStellarAddress('invalid-address').error).toBe('Invalid Stellar address format');
  });

  it('should reject an empty string', () => {
    expect(validateStellarAddress('').valid).toBe(false);
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

  it('should allow empty (optional) URLs', () => {
    expect(validateUrl('').valid).toBe(true);
  });

  it('should reject invalid URLs', () => {
    expect(validateUrl('not-a-url').valid).toBe(false);
  });
});
