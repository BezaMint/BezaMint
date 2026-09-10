/**
 * Shared upload guard for IPFS routes: file-size cap, MIME allowlist, and
 * per-IP rate limiting. Keeping this in one module means both upload routes
 * enforce identical policy without duplicating the logic.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rateLimited } from './errors';

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_METADATA_SIZE = 1_000_000; // 1MB
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** Validate a file against the shared policy; returns an error response or null. */
export function validateFile(file: File): NextResponse | null {
  if (file.size === 0) {
    return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
      { status: 413 },
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, WebP and GIF images are allowed' },
      { status: 415 },
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
