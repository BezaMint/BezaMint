import { describe, it, expect } from 'vitest';
import { validateRoyaltyRecipients } from '@bezamint/shared';

describe('validateRoyaltyRecipients', () => {
  it('accepts empty recipients', () => {
    expect(validateRoyaltyRecipients([]).valid).toBe(true);
  });
  it('rejects shares not totaling 100', () => {
    const r = [{ address: 'GABC', share: 50 }];
    expect(validateRoyaltyRecipients(r).valid).toBe(false);
  });
  it('accepts valid recipients', () => {
    const r = [{ address: 'GABC', share: 100 }];
    expect(validateRoyaltyRecipients(r).valid).toBe(true);
  });
  it('rejects too many recipients', () => {
    const r = Array.from({ length: 11 }, (_, i) => ({ address: 'GABC', share: 9 }));
    expect(validateRoyaltyRecipients(r).valid).toBe(false);
  });
});
