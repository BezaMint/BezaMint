import { describe, it, expect } from 'vitest';
import { MIN_XLM_RESERVE, DEFAULT_TX_TIMEOUT, MAX_TX_RETRIES } from '@/lib/constants';

describe('constants', () => {
  it('MIN_XLM_RESERVE is positive', () => {
    expect(MIN_XLM_RESERVE).toBeGreaterThan(0);
  });
  it('DEFAULT_TX_TIMEOUT is reasonable', () => {
    expect(DEFAULT_TX_TIMEOUT).toBe(30);
  });
});
