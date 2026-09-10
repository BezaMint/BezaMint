/**
 * Shared fixed-window rate limiter.
 *
 * Both the API middleware and the upload routes enforce per-IP limits; this
 * store centralizes the window logic so policy differs per caller but the
 * mechanics (fixed window, expiry, bounded memory) are identical. The store
 * is bounded by entry count with LRU-style eviction of the oldest entry, so
 * a flood of distinct IPs cannot grow memory without limit.
 */

export interface RateBucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, RateBucket>();

  constructor(
    private readonly windowMs: number,
    private readonly maxPerWindow: number,
    private readonly maxEntries = 1000,
  ) {}

  /**
   * Record a hit for `key`. Returns `null` when the request is allowed, or
   * a description of the rejection (retry-after seconds) when it exceeds
   * the window limit.
   */
  hit(
    key: string,
    now = Date.now(),
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.enforceBound();
      return { allowed: true };
    }

    bucket.count += 1;
    if (bucket.count > this.maxPerWindow) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true };
  }

  /** Remaining allowed hits in the current window for `key` (0 when over). */
  remaining(key: string, now = Date.now()): number {
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) return this.maxPerWindow;
    return Math.max(0, this.maxPerWindow - bucket.count);
  }

  /** Seconds until the current window resets for `key`. */
  resetInSeconds(key: string, now = Date.now()): number {
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) return 0;
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }

  /** Evict expired buckets; call on a schedule or opportunistically. */
  prune(now = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
    this.enforceBound();
  }

  /** Keep the store within maxEntries, evicting oldest first (LRU). */
  private enforceBound(): void {
    // Map preserves insertion order, so deleting from the front evicts the
    // oldest (least recently inserted) buckets.
    while (this.buckets.size > this.maxEntries) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }

  get size(): number {
    return this.buckets.size;
  }

  clear(): void {
    this.buckets.clear();
  }
}
