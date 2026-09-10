/**
 * Central error normalization for API routes.
 *
 * Soroban RPC and Horizon failures surface as a tangle of library-specific
 * error shapes (JSON-RPC errors, Axios errors, XDR parse errors, contract
 * panics). This module maps them onto a small set of typed API errors with
 * stable codes + HTTP statuses, so handlers can respond consistently and
 * clients can branch on `error.code` instead of string matching.
 */

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'CONTRACT_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INTERNAL';

export interface ApiErrorShape {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJson(): ApiErrorShape {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

/** Heuristic: does this look like a contract-level (panic/auth) failure? */
function isContractError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('host error') ||
    message.includes('contract error') ||
    message.includes('InvokeHostFunction') ||
    message.includes('require_auth') ||
    message.includes('panicked')
  );
}

/** Heuristic: does this look like a network / RPC failure? */
function isNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const anyErr = err as { code?: string; name?: string };
  return (
    anyErr.code === 'ECONNREFUSED' ||
    anyErr.code === 'ETIMEDOUT' ||
    anyErr.code === 'ENOTFOUND' ||
    anyErr.name === 'TimeoutError' ||
    message.includes('Failed to fetch') ||
    message.includes('network') ||
    message.includes('connection')
  );
}

/**
 * Normalize any thrown value into an ApiError.
 * Unknown errors collapse to INTERNAL; caller-supplied status is preserved.
 */ export function normalizeError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof TypeError && err.message === 'fetch failed') {
    return new ApiError('NETWORK_ERROR', 'Upstream service unreachable', 502, message);
  }

  if (isNetworkError(err)) {
    return new ApiError('NETWORK_ERROR', 'Network request failed', 502, message);
  }

  if (isContractError(err)) {
    return new ApiError('CONTRACT_ERROR', 'Contract call failed', 422, message);
  }

  return new ApiError(
    'INTERNAL',
    'Internal server error',
    500,
    process.env.NODE_ENV === 'development' ? message : undefined,
  );
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError('BAD_REQUEST', message, 400, details);

export const notFound = (message: string) => new ApiError('NOT_FOUND', message, 404);

export const rateLimited = (message = 'Too many requests') =>
  new ApiError('RATE_LIMITED', message, 429);

export const internalError = (message = 'Internal server error', details?: unknown) =>
  new ApiError('INTERNAL', message, 500, details);
