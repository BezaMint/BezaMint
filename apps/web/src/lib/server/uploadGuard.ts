/**
 * Shared upload guard for IPFS routes: file-size cap, MIME allowlist, and
 * per-IP rate limiting. Keeping this in one module means both upload routes
 * enforce identical policy without duplicating the logic.
 */
import { NextRequest, NextResponse } from 'next/server';
import { apiError, rateLimited } from './errors';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_METADATA_SIZE = 1_000_000; // 1MB
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Validate a file against the shared policy; returns an error response or null.
 *
 * Each rejection carries the catalogue code for the rule it broke, in the same
 * envelope every other route returns. These three were the last responses in the
 * app that answered with a bare `{ error: "prose" }` and no code, which left a
 * client unable to tell "too large" from "wrong type" without matching on the
 * sentence -- and the sentences are not a published interface.
 */
export function validateFile(file: File): NextResponse | null {
  const failure = (error: ReturnType<typeof apiError>): NextResponse =>
    NextResponse.json(error.toJson(), { status: error.status });

  if (file.size === 0) {
    return failure(apiError('UPLOAD_EMPTY_FILE'));
  }
  if (file.size > MAX_FILE_SIZE) {
    return failure(
      apiError('UPLOAD_FILE_TOO_LARGE', `File exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB limit`, {
        maxBytes: MAX_FILE_SIZE,
        sizeBytes: file.size,
      }),
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return failure(
      apiError('UPLOAD_MEDIA_TYPE_NOT_ALLOWED', 'Only JPEG, PNG, WebP and GIF images are allowed', {
        allowed: [...ALLOWED_MIME_TYPES],
        received: file.type,
      }),
    );
  }
  return null;
}

// ─────────────────────── Per-IP rate limiting ───────────────────────

interface RateBucket {
  count: number;
  resetAt: number;
}

const UPLOAD_WINDOW_MS = 60_000; // 1 minute
const UPLOAD_MAX_PER_WINDOW = 10;
const buckets = new Map<string, RateBucket>();

/** Best-effort client IP extraction (X-Forwarded-For, CF-Connecting-IP, ...). */
export function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = (xff.split(',')[0] ?? '').trim();
    if (first) return first;
  }
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
}

/** Sliding-window rate limit keyed by IP. Returns an error response when exceeded. */
export function rateLimitUpload(request: NextRequest): NextResponse | null {
  const ip = clientIp(request);
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + UPLOAD_WINDOW_MS });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > UPLOAD_MAX_PER_WINDOW) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return NextResponse.json(rateLimited('Upload rate limit exceeded').toJson(), {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }
  return null;
}

/** Periodic cleanup so the bucket map cannot grow unbounded. */
export function pruneRateBuckets(): void {
  const now = Date.now();
  for (const [ip, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(ip);
  }
}

// Prune expired buckets once a minute.
setInterval(pruneRateBuckets, 60_000).unref?.();
