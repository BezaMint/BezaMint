import { describe, it, expect } from 'vitest';
import {
  METADATA_LIMITS,
  ROYALTY_LIMITS,
  CREATOR_LIMITS,
  COLLECTION_LIMITS,
} from '@bezamint/shared';

describe('METADATA_LIMITS', () => {
  it('name max is 128', () => {
    expect(METADATA_LIMITS.name.max).toBe(128);
  });
  it('description max is 2000', () => {
    expect(METADATA_LIMITS.description.max).toBe(2000);
  });
});
describe('ROYALTY_LIMITS', () => {
  it('maxBasisPoints is 10000', () => {
    expect(ROYALTY_LIMITS.maxBasisPoints).toBe(10000);
  });
});
