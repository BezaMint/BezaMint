import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../rateLimiter';

const T0 = 1_000_000;

describe('RateLimiter', () => {
  it('allows requests within the window limit and rejects beyond it', () => {
    const limiter = new RateLimiter(60_000, 3);
    expect(limiter.hit('a', T0)).toEqual({ allowed: true });
    expect(limiter.hit('a', T0 + 1)).toEqual({ allowed: true });
    expect(limiter.hit('a', T0 + 2)).toEqual({ allowed: true });
    // 4th hit exceeds the limit of 3.
    expect(limiter.hit('a', T0 + 3)).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it('rejects with a retry-after derived from the window', () => {
    const limiter = new RateLimiter(10_000, 1);
    limiter.hit('a', T0);
    const result = limiter.hit('a', T0 + 5_000);
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 5 });
  });

  it('resets the window after it elapses', () => {
    const limiter = new RateLimiter(10_000, 1);
    limiter.hit('a', T0);
    expect(limiter.hit('a', T0 + 9_999)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.hit('a', T0 + 10_000)).toEqual({ allowed: true });
  });

  it('tracks separate keys independently', () => {
    const limiter = new RateLimiter(60_000, 1);
    limiter.hit('a', T0);
    expect(limiter.hit('b', T0)).toEqual({ allowed: true });
    expect(limiter.hit('b', T0 + 1)).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.remaining('a', T0 + 1)).toBe(0);
    expect(limiter.remaining('b', T0 + 1)).toBe(0);
    expect(limiter.remaining('c', T0 + 1)).toBe(1);
  });

  it('prunes expired buckets', () => {
    const limiter = new RateLimiter(1_000, 5);
    limiter.hit('a', T0);
    expect(limiter.size).toBe(1);
    limiter.prune(T0 + 1_001);
    expect(limiter.size).toBe(0);
  });

  it('evicts the oldest entry when the hard bound is exceeded', () => {
    const limiter = new RateLimiter(60_000, 1, 2);
    limiter.hit('a', T0);
    limiter.hit('b', T0);
    expect(limiter.size).toBe(2);
    limiter.hit('c', T0);
    expect(limiter.size).toBe(2);
    // 'a' was evicted, so it starts fresh; 'b' and 'c' are exhausted.
    expect(limiter.remaining('a', T0)).toBe(1);
    expect(limiter.remaining('b', T0)).toBe(0);
    expect(limiter.remaining('c', T0)).toBe(0);
  });

  it('reports remaining and reset values', () => {
    const limiter = new RateLimiter(10_000, 5);
    limiter.hit('a', T0);
    limiter.hit('a', T0 + 100);
    expect(limiter.remaining('a', T0 + 100)).toBe(3);
    expect(limiter.resetInSeconds('a', T0 + 100)).toBe(10);
  });

  it('clears all buckets', () => {
    const limiter = new RateLimiter(60_000, 1);
    limiter.hit('a', T0);
    limiter.clear();
    expect(limiter.size).toBe(0);
    expect(limiter.remaining('a', T0)).toBe(1);
  });
});
