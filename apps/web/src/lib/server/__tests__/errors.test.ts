import { describe, it, expect } from 'vitest';
import { ERROR_CODE_BY_NAME } from '@bezamint/shared';
import {
  ApiError,
  apiError,
  errorMessage,
  normalizeError,
  badRequest,
  rateLimited,
} from '@/lib/server/errors';
import { FetchTimeoutError } from '@/lib/server/http';

describe('errorMessage', () => {
  it('reads a plain Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  // The case that motivated this helper. A duplicated dependency (common in a
  // pnpm store tree) does not share prototypes with this realm, so its error
  // classes fail `instanceof Error` here even though they carry a message. The
  // indexer logged a live RPC rejection as "[object Object]" for exactly this
  // reason, discarding the detail needed to diagnose it.
  it('reads an error-like object that is not instanceof Error', () => {
    const foreign = Object.create(null);
    foreign.message = 'filter 1 invalid: topic must have at least 1 segment';
    expect(errorMessage(foreign)).toBe('filter 1 invalid: topic must have at least 1 segment');
  });

  it('unwraps a JSON-RPC style error envelope', () => {
    expect(errorMessage({ error: { code: -32602, message: 'invalid parameters' } })).toBe(
      'invalid parameters',
    );
  });

  it('falls back to a JSON rendering rather than an opaque tag', () => {
    expect(errorMessage({ code: -32602, data: 'x' })).toContain('-32602');
  });

  it('handles strings and objects with no message at all', () => {
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage({})).toBe('[object Object]');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});

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

  it('maps a hung upstream to TIMEOUT with 504', () => {
    // The exact error `fetchWithTimeout`/`withTimeout` reject with. Before this
    // was handled it fell through to INTERNAL/500, so the declared TIMEOUT code
    // was dead and a slow upstream looked like a server crash.
    const result = normalizeError(new FetchTimeoutError('metadata fetch timed out'));
    expect(result.code).toBe('TIMEOUT');
    expect(result.status).toBe(504);
  });

  it('maps an ETIMEDOUT socket error to TIMEOUT rather than NETWORK_ERROR', () => {
    const err = new Error('connect ETIMEDOUT');
    Object.assign(err, { code: 'ETIMEDOUT' });
    const result = normalizeError(err);
    expect(result.code).toBe('TIMEOUT');
    expect(result.status).toBe(504);
  });
});

describe('error helpers', () => {
  it('badRequest produces a serializable shape', () => {
    const json = badRequest('bad input').toJson();
    expect(json).toEqual({
      error: {
        code: 'BAD_REQUEST',
        // The catalogue id is published alongside the symbolic name: an operator
        // greps a log for `BM-API-0001`, a client branches on `BAD_REQUEST`.
        errorCode: 'BM-API-0001',
        message: 'bad input',
      },
    });
  });

  it('takes the default message and status from the catalogue', () => {
    // A call site with nothing to add should not restate what the catalogue
    // already documents, or the docs and the response drift apart.
    const error = apiError('TOKEN_ALREADY_IN_COLLECTION');
    expect(error.message).toBe(ERROR_CODE_BY_NAME['TOKEN_ALREADY_IN_COLLECTION']?.message);
    expect(error.status).toBe(409);
    expect(error.retryable).toBe(false);
  });

  it('classifies a Horizon submission failure by its result code', () => {
    // Before this, `result_codes` was ignored entirely and a stale sequence
    // number was answered with 500 INTERNAL.
    const err = new Error('Transaction submission failed');
    Object.assign(err, { result_codes: { transaction: 'tx_bad_seq' } });
    const result = normalizeError(err);
    expect(result.code).toBe('TX_SEQUENCE_STALE');
    expect(result.status).toBe(409);
    expect(result.retryable).toBe(true);
  });

  it('prefers the operation result over the generic transaction result', () => {
    // `tx_failed` only says "something substantive failed"; the operation result
    // says which. Reporting the outer code discards the useful half.
    const err = new Error('Transaction submission failed');
    Object.assign(err, {
      result_codes: { transaction: 'tx_failed', operations: ['op_underfunded'] },
    });
    const result = normalizeError(err);
    expect(result.code).toBe('PAYMENT_UNDERFUNDED');
  });

  it('reads result codes out of a Horizon response wrapper too', () => {
    const err = new Error('Request failed with status code 400');
    Object.assign(err, {
      response: { data: { extras: { result_codes: { transaction: 'tx_insufficient_fee' } } } },
    });
    expect(normalizeError(err).code).toBe('TX_FEE_TOO_LOW');
  });

  it('names a host authorization failure precisely rather than as a generic contract error', () => {
    // There is no `Error(Contract, #N)` here, so this is not a contract error the
    // catalogue can name by number -- it is the host refusing an authorization.
    // Reporting 403 with the reason beats reporting 422 with "a contract call
    // failed".
    const result = normalizeError(new Error('HostError: Error(Auth, InvalidAction)'));
    expect(result.code).toBe('HOST_AUTH_FAILED');
    expect(result.status).toBe(403);
    expect(result.details).toMatchObject({ stellar: { code: 'HOST_AUTH_FAILED' } });
  });

  it('keeps CONTRACT_ERROR for a numbered contract failure and adds the protocol detail', () => {
    const err = new Error('HostError: Error(Contract, #12)');
    const result = normalizeError(err, { contract: 'nft' });
    expect(result.code).toBe('CONTRACT_ERROR');
    expect(result.details).toMatchObject({
      contractError: { code: 12, contract: 'nft', variant: 'FromIsNotOwner' },
    });
  });

  it('rateLimited sets status 429', () => {
    expect(rateLimited().status).toBe(429);
  });
});
