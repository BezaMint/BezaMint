import { describe, it, expect } from 'vitest';
import { validateStellarAddress, validateRoyaltyBps, validateNftName, validateUrl } from '@bezamint/shared/utils';

describe('validateStellarAddress', () => {
  it('should accept a valid Stellar public key', () => {
    expect(validateStellarAddress('GAV6ZOG4OLKZ7JCHM7X5XVDRTWAGQI2VKCQHZ3CBKDRJ4I2Z2ZPL2OX5').valid).toBe(true);
  });
  it('should reject an invalid Stellar address', () => {
    expect(validateStellarAddress('invalid-address').valid).toBe(false);
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
  it('should allow empty optional URLs', () => {
    expect(validateUrl('').valid).toBe(true);
  });
  it('should reject invalid URLs', () => {
    expect(validateUrl('not-a-url').valid).toBe(false);
  });
});
