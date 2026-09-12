import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/server/rateLimiter';

/**
 * Edge middleware for the API surface.
 *
 * Runs before route handlers to provide request logging with duration,
 * CORS allowlist handling, a shared per-IP rate limit, and the authorization
 * check on mutating requests. Kept dependency-light so it stays compatible with
 * the edge runtime.
 *
 * Why authorization lives here rather than in the two handlers: the only
 * mutating routes today are the IPFS uploads, and they are the ones that spend a
 * third-party quota on someone else's behalf. A rule applied in the middleware
 * cannot be forgotten by a route that is added later, and `prebuild-check.sh`
 * already treats the setting as a platform-wide one.
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

// ─────────────────── Authorization for mutating requests ───────────────────

/**
 * Methods that change state. Reads stay open: they are served from cache, spend
 * no third-party quota, and every public page depends on them.
 */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Compare two strings without an early exit.
 *
 * `===` stops at the first differing character, so the time taken to reject a
 * guess grows with the length of the shared prefix -- enough to recover a secret
 * character by character. This walks the whole string regardless. It is not
 * constant-time in the strict sense (JavaScript offers no such guarantee), but
 * it removes the feedback channel.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/**
 * The origin a request came from, when there is one.
 *
 * A browser sets `Origin` on cross-origin requests and on same-origin requests
 * with a mutating method, and `Referer` covers the paths that omit it. A page
 * cannot forge either, which is what makes them usable as an authorization
 * signal -- unlike a custom header, which any caller can invent.
 */
function requestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (origin) return origin;

  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * The host the request was addressed to.
 *
 * `x-forwarded-host` first: a platform that terminates TLS in front of the app
 * (Vercel does) sets it to the public host, while `host` may be the internal
 * one. Both are read because the header is absent when the app is served
 * directly.
 */
function requestHost(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-host');
  const first = forwarded?.split(',')[0]?.trim();
  return (first || request.headers.get('host')) ?? null;
}

/** True when `origin` is the host this deployment is being served from. */
function isSameOrigin(request: NextRequest, origin: string): boolean {
  const host = requestHost(request);
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function denyMutation(status: number, code: string, message: string): NextResponse {
  const denied = NextResponse.json({ error: { code, message } }, { status });
  applySecurityHeaders(denied);
  return denied;
}

/**
 * Decide whether a mutating request may proceed.
 *
 * Two callers, two rules, because they can offer different things. A script or a
 * service can hold a secret, and presents it as `x-api-key` when `API_WRITE_KEY`
 * is configured. A browser cannot hold a secret without publishing it, so the
 * app's own UI is trusted by origin instead -- and that origin rule is what stops
 * somebody else's page from driving a public upload endpoint. The origin rule is
 * enforced whether or not the key is set, since it costs nothing and closes the
 * hole in the configuration where the key is absent.
 */
function authorizeMutation(request: NextRequest): NextResponse | null {
  const configuredKey = process.env.API_WRITE_KEY;
  const origin = requestOrigin(request);

  if (configuredKey) {
    const provided = request.headers.get('x-api-key');
    if (provided && constantTimeEqual(provided, configuredKey)) return null;

    // No origin at all means no browser: the shared secret is the only thing
    // such a caller could have presented.
    if (!origin) {
      return denyMutation(401, 'UNAUTHORIZED', 'This endpoint requires an API key.');
    }
  } else if (!origin) {
    // Nothing configured to check against and no browser to attribute the call
    // to, which is the documented "unset means no extra check" behaviour.
    return null;
  }

  if (origin && (isSameOrigin(request, origin) || isAllowedOrigin(origin))) return null;

  return denyMutation(403, 'FORBIDDEN', 'This endpoint does not accept requests from that origin.');
}

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

  // Authorization, after the rate limit so a caller cannot use the check as a
  // free way to hammer the deployment.
  if (MUTATING_METHODS.has(request.method)) {
    const denied = authorizeMutation(request);
    if (denied) {
      logRequest(request, denied, startedAt);
      return denied;
    }
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
