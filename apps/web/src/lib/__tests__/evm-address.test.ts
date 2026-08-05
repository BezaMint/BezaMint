import { describe, it, expect } from 'vitest';
import { isValidEvmAddress } from '@bezamint/shared';

describe('isValidEvmAddress', () => {
  it('accepts valid EVM address', () => {
    expect(isValidEvmAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
  });
  it('rejects address without 0x', () => {
    expect(isValidEvmAddress('1234567890abcdef1234567890abcdef12345678')).toBe(false);
  });
  it('rejects short address', () => {
    expect(isValidEvmAddress('0x123')).toBe(false);
  });
});
