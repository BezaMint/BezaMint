/**
 * Minimal in-memory TTL cache for server-side values.
 *
 * Used by API routes to absorb repeated on-chain/IPFS reads without a
 * backing store. Bounded by entry count with LRU-style eviction of the
 * oldest entries, and fully synchronous so callers can read cached values
 * without restructuring async code.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 500;

export class TtlCache<T> {
  private entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxEntries: number = MAX_ENTRIES,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.prune();
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.ttlMs),
    });
    if (this.entries.size > this.maxEntries) {
      // Evict the oldest entry (Map preserves insertion order).
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /** Memoize an async producer with a TTL; deduplicates in-flight calls. */
  async getOrSet(key: string, producer: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    // Guard against stampedes: a short-lived in-flight promise cache.
    const inflight = this.inflight.get(key);
    if (inflight) return inflight;

    const promise = producer().then((value) => {
      this.set(key, value, ttlMs);
      this.inflight.delete(key);
      return value;
    });
    this.inflight.set(key, promise);
    return promise;
  }

  private inflight = new Map<string, Promise<T>>();

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAt) this.entries.delete(key);
    }
  }
}

/** Cache-Control value for short-lived, shared-cacheable API responses. */
export const SHORT_CACHE_CONTROL = 'public, max-age=15, s-maxage=30, stale-while-revalidate=60';
