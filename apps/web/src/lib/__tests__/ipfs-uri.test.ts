import { describe, it, expect } from 'vitest';
import { isValidIpfsUri } from '@bezamint/shared';

describe('isValidIpfsUri', () => {
  it('accepts ipfs://', () => {
    expect(isValidIpfsUri('ipfs://QmTest')).toBe(true);
  });
  it('accepts gateway URL', () => {
    expect(isValidIpfsUri('https://gateway.pinata.cloud/ipfs/QmTest')).toBe(true);
  });
  it('rejects https URL', () => {
    expect(isValidIpfsUri('https://example.com')).toBe(false);
  });
});
