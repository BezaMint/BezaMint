import { describe, it, expect } from 'vitest';
import { ApiError, normalizeError, badRequest, rateLimited } from '@/lib/server/errors';

describe('normalizeError', () => {
  it('passes ApiError instances through unchanged', () => {
    const original = new ApiError('BAD_REQUEST', 'nope', 400);
    const result = normalizeError(original);
    expect(result).toBe(original);
    expect(result.status).toBe(400);
  });

  it('maps network-style errors to NETWORK_ERROR with 502', () => {
    const err = new Error('Failed to fetch');
    Object.assign(err, { code: 'ECONNREFUSED' });
    const result = normalizeError(err);
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.status).toBe(502);
  });

  it('maps fetch failed type errors to NETWORK_ERROR', () => {
    const result = normalizeError(new TypeError('fetch failed'));
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.status).toBe(502);
  });

  it('maps contract panics to CONTRACT_ERROR with 422', () => {
    const result = normalizeError(new Error('host error: contract panicked'));
    expect(result.code).toBe('CONTRACT_ERROR');
    expect(result.status).toBe(422);
  });

  it('collapses unknown errors to INTERNAL with 500', () => {
    const result = normalizeError(new Error('something odd'));
    expect(result.code).toBe('INTERNAL');
    expect(result.status).toBe(500);
  });

  it('normalizes non-Error throws', () => {
    const result = normalizeError('boom');
    expect(result.code).toBe('INTERNAL');
    expect(result.message).toBe('Internal server error');
  });
});

describe('error helpers', () => {
  it('badRequest produces a serializable shape', () => {
    const json = badRequest('bad input').toJson();
    expect(json).toEqual({ error: { code: 'BAD_REQUEST', message: 'bad input' } });
  });

  it('rateLimited sets status 429', () => {
    expect(rateLimited().status).toBe(429);
  });
});
