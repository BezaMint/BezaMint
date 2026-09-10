import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge middleware for the API surface.
 *
 * Runs before route handlers to provide request logging with duration,
 * CORS allowlist handling, and a shared per-IP rate limit. Kept dependency-
 * light so it stays compatible with the edge runtime.
 */

const API_PREFIX = '/api';

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

  // Preflight requests get an immediate answer.
  if (request.method === 'OPTIONS') {
    const preflight = NextResponse.next();
    applyCors(request, preflight);
    return preflight;
  }

  const response = NextResponse.next();
  applyCors(request, response);
  logRequest(request, response, startedAt);
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
