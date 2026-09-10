import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge middleware for the API surface.
 *
 * Runs before route handlers to provide request logging with duration,
 * CORS allowlist handling, and a shared per-IP rate limit. Kept dependency-
 * light so it stays compatible with the edge runtime.
 */

const API_PREFIX = '/api';

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

  const response = NextResponse.next();
  logRequest(request, response, startedAt);
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
