import { describe, it, expect } from 'vitest';
import { validateNftName, validateUrl, validateStellarAddress } from '@bezamint/shared';

describe('validateNftName', () => {
  it('rejects empty names', () => {
    expect(validateNftName('').valid).toBe(false);
  });
  it('accepts valid names', () => {
    expect(validateNftName('My NFT').valid).toBe(true);
  });
  it('rejects names over 128 chars', () => {
    expect(validateNftName('x'.repeat(129)).valid).toBe(false);
  });
});

describe('validateStellarAddress', () => {
  it('rejects invalid format', () => {
    expect(validateStellarAddress('bad').valid).toBe(false);
  });
  it('accepts valid G address', () => {
    expect(
      validateStellarAddress('GBMQK57VHOA7TIA3PCEFFFVOFYEV2VVPLPGEMU5QLXYJA5WVCRAICRHU').valid,
    ).toBe(true);
  });
});
