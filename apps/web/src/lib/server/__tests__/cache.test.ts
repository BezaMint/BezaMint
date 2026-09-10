import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TtlCache, SHORT_CACHE_CONTROL } from '../cache';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined for missing keys', () => {
    const cache = new TtlCache<number>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('stores and returns values within the TTL', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
  });

  it('expires entries after the TTL elapses', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('k', 'v');
    vi.advanceTimersByTime(1001);
    expect(cache.get('k')).toBeUndefined();
  });

  it('respects a per-set TTL override', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('k', 'v', 50);
    vi.advanceTimersByTime(51);
    expect(cache.get('k')).toBeUndefined();
  });

  it('evicts the oldest entry past the max size', () => {
    const cache = new TtlCache<string>(1000, 2);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    expect(cache.get('c')).toBe('3');
  });

  it('getOrSet memoizes the producer result', async () => {
    const cache = new TtlCache<number>(1000);
    const producer = vi.fn().mockResolvedValue(42);
    const first = await cache.getOrSet('k', producer);
    const second = await cache.getOrSet('k', producer);
    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it('getOrSet deduplicates in-flight producers', async () => {
    const cache = new TtlCache<number>(1000);
    let resolve!: (v: number) => void;
    const producer = vi.fn().mockReturnValue(new Promise<number>((r) => (resolve = r)));
    const first = cache.getOrSet('k', producer);
    const second = cache.getOrSet('k', producer);
    resolve(7);
    await expect(first).resolves.toBe(7);
    await expect(second).resolves.toBe(7);
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it('runs the producer again after expiry', async () => {
    const cache = new TtlCache<number>(1000);
    const producer = vi.fn().mockResolvedValue(1);
    await cache.getOrSet('k', producer);
    vi.advanceTimersByTime(1001);
    await cache.getOrSet('k', producer);
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it('clear empties all entries', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', '1');
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});

describe('SHORT_CACHE_CONTROL', () => {
  it('allows shared caching with a short max-age', () => {
    expect(SHORT_CACHE_CONTROL).toContain('public');
    expect(SHORT_CACHE_CONTROL).toContain('max-age=15');
    expect(SHORT_CACHE_CONTROL).toContain('s-maxage=30');
  });
});
