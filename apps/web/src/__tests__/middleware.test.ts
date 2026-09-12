import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

/**
 * The middleware authorized nothing until it gained this check: `API_WRITE_KEY`
 * was documented as required by mutating routes and read by no code at all, and a
 * cross-origin POST was accepted from any page on the internet. Both halves are
 * tested here, including the configuration where the key is absent, because the
 * origin rule is the one that has to hold in that case.
 *
 * Note on test origins: `isAllowedOrigin` trusts any `*.vercel.app` origin while
 * NODE_ENV is not `production`, so a hostile origin in these tests is `.example`.
 * Using a `.vercel.app` host would prove the opposite of what is intended.
 */

const HOST = 'bezamint.vercel.app';
const SAME_ORIGIN = `https://${HOST}`;
const HOSTILE_ORIGIN = 'https://attacker.example';

function request(
  method: string,
  headers: Record<string, string> = {},
  path = '/api/ipfs/upload',
): NextRequest {
  return new NextRequest(`${SAME_ORIGIN}${path}`, { method, headers });
}

/** A mutating request that a browser on the app's own origin would send. */
function browserMutation(overrides: Record<string, string> = {}): NextRequest {
  return request('POST', {
    host: HOST,
    origin: SAME_ORIGIN,
    'content-type': 'application/json',
    ...overrides,
  });
}

/** The status a denial carries; 200 means the request was passed through. */
async function statusOf(response: Response): Promise<number> {
  return response.status;
}

describe('middleware authorization', () => {
  beforeEach(() => {
    // Falsy rather than absent, so the "configured" branch is what is missing.
    vi.stubEnv('API_WRITE_KEY', '');
    vi.stubEnv('CORS_ALLOWED_ORIGINS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lets a read through without credentials', () => {
    const response = middleware(request('GET', { host: HOST }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets the app’s own UI POST', () => {
    const response = middleware(browserMutation());

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects a POST from another origin, even with no key configured', async () => {
    const response = middleware(request('POST', { host: HOST, origin: HOSTILE_ORIGIN }));

    expect(await statusOf(response)).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'This endpoint does not accept requests from that origin.',
      },
    });
  });

  it('rejects every mutating method from another origin', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = middleware(request(method, { host: HOST, origin: HOSTILE_ORIGIN }));
      expect(response.status, `${method} should be rejected`).toBe(403);
    }
  });

  it('falls back to Referer when a browser omits Origin', () => {
    const response = middleware(request('POST', { host: HOST, referer: `${SAME_ORIGIN}/mint` }));

    expect(response.status).toBe(200);
  });

  it('treats a Referer from another site as hostile', () => {
    const response = middleware(request('POST', { host: HOST, referer: `${HOSTILE_ORIGIN}/page` }));

    expect(response.status).toBe(403);
  });

  it('accepts an origin named in CORS_ALLOWED_ORIGINS', () => {
    vi.stubEnv('CORS_ALLOWED_ORIGINS', 'https://partner.example');

    const response = middleware(request('POST', { host: HOST, origin: 'https://partner.example' }));

    expect(response.status).toBe(200);
  });

  describe('with API_WRITE_KEY configured', () => {
    beforeEach(() => {
      vi.stubEnv('API_WRITE_KEY', 's3cret-value');
    });

    it('accepts a non-browser caller that presents the key', () => {
      const response = middleware(request('POST', { host: HOST, 'x-api-key': 's3cret-value' }));

      expect(response.status).toBe(200);
    });

    it('rejects a wrong key', async () => {
      const response = middleware(request('POST', { host: HOST, 'x-api-key': 's3cret-valuf' }));

      expect(await statusOf(response)).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: { code: 'UNAUTHORIZED', message: 'This endpoint requires an API key.' },
      });
    });

    it('rejects a caller with no key and no origin', () => {
      const response = middleware(request('POST', { host: HOST }));

      expect(response.status).toBe(401);
    });

    it('still lets the app’s own UI through, which cannot hold a secret', () => {
      const response = middleware(browserMutation());

      expect(response.status).toBe(200);
    });

    it('does not require a key for reads', () => {
      const response = middleware(request('GET', { host: HOST }));

      expect(response.status).toBe(200);
    });
  });

  it('answers a preflight without credentials', () => {
    const response = middleware(request('OPTIONS', { host: HOST, origin: HOSTILE_ORIGIN }));

    // A preflight carries no credentials by design; it is answered so the
    // browser can learn whether the real request would be allowed.
    expect(response.status).toBe(200);
  });

  it('adds the hardening headers to a denial', () => {
    const response = middleware(request('POST', { host: HOST, origin: HOSTILE_ORIGIN }));

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('leaves requests outside /api alone', () => {
    const response = middleware(request('POST', { host: HOST, origin: HOSTILE_ORIGIN }, '/mint'));

    expect(response.status).toBe(200);
  });
});
