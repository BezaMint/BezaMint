import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/server/rateLimiter';

/**
 * Edge middleware for the API surface.
 *
 * Runs before route handlers to provide request logging with duration,
 * CORS allowlist handling, and a shared per-IP rate limit. Kept dependency-
 * light so it stays compatible with the edge runtime.
 */

const API_PREFIX = '/api';

// ─────────────────────── Per-IP rate limiting ───────────────────────

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 120;
const apiLimiter = new RateLimiter(RATE_WINDOW_MS, RATE_MAX_PER_WINDOW);

function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = (xff.split(',')[0] ?? '').trim();
    if (first) return first;
  }
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
}

/** Attach standard X-RateLimit-* headers for the caller's current state. */
function applyRateLimitHeaders(request: NextRequest, response: NextResponse): void {
  const ip = clientIp(request);
  response.headers.set('X-RateLimit-Limit', String(RATE_MAX_PER_WINDOW));
  response.headers.set('X-RateLimit-Remaining', String(apiLimiter.remaining(ip)));
  response.headers.set('X-RateLimit-Reset', String(apiLimiter.resetInSeconds(ip)));
}

/** Returns a 429 response when the caller exceeds the shared limit. */
function rateLimit(request: NextRequest): NextResponse | null {
  const ip = clientIp(request);
  const result = apiLimiter.hit(ip);
  if (!result.allowed) {
    const limited = NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfterSeconds) },
      },
    );
    limited.headers.set('X-RateLimit-Limit', String(RATE_MAX_PER_WINDOW));
    limited.headers.set('X-RateLimit-Remaining', '0');
    limited.headers.set('X-RateLimit-Reset', String(result.retryAfterSeconds));
    return limited;
  }
  return null;
}

// Prune expired buckets once a minute so the map cannot grow unbounded.
setInterval(() => apiLimiter.prune(), RATE_WINDOW_MS).unref?.();

// ─────────────────────── CORS allowlist ───────────────────────

/** Origins allowed to call the API cross-origin. */
function allowedOrigins(): string[] {
  const configured = process.env.CORS_ALLOWED_ORIGINS;
  if (configured) {
    return configured
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  // Same-origin deployments need no CORS headers; a generous default is
  // deliberately NOT used here. Add CORS_ALLOWED_ORIGINS to enable CORS.
  return [];
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === 'http://localhost:3000') return true;
  // Vercel preview deployments share the *.vercel.app suffix.
  if (process.env.NODE_ENV !== 'production' && origin.endsWith('.vercel.app')) return true;
  return allowedOrigins().includes(origin);
}

function applyCors(request: NextRequest, response: NextResponse): void {
  const origin = request.headers.get('origin');
  if (!origin) return;
  if (isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
  }
}

// ─────────────────────── Security headers ───────────────────────

/** Hardening headers for every API response. */
function applySecurityHeaders(response: NextResponse): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '0'); // modern browsers: off is safer than legacy filter
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

// ─────────────────────── Request logging ───────────────────────

function logRequest(request: NextRequest, response: NextResponse | null, startedAt: number) {
  const durationMs = Date.now() - startedAt;
  const entry = {
    level: 'info',
    message: 'request complete',
    time: new Date().toISOString(),
    method: request.method,
    path: request.nextUrl.pathname,
    status: response?.status ?? 0,
    durationMs,
  };
  if (process.env.NODE_ENV === 'development') {
    console.info(
      `${entry.time} [INFO] ${entry.method} ${entry.path} ${entry.status} ${durationMs}ms`,
    );
  } else {
    console.info(JSON.stringify(entry));
  }
}

export function middleware(request: NextRequest) {
  const startedAt = Date.now();

  if (!request.nextUrl.pathname.startsWith(API_PREFIX)) {
    return NextResponse.next();
  }

  const limited = rateLimit(request);
  if (limited) {
    logRequest(request, limited, startedAt);
    return limited;
  }

  // Preflight requests get an immediate answer.
  if (request.method === 'OPTIONS') {
    const preflight = NextResponse.next();
    applyCors(request, preflight);
    return preflight;
  }

  const response = NextResponse.next();
  applyCors(request, response);
  applyRateLimitHeaders(request, response);
  applySecurityHeaders(response);
  logRequest(request, response, startedAt);
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
