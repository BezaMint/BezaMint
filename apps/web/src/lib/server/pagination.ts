/**
 * Shared pagination parsing for list endpoints.
 *
 * Accepts `limit` (default 20, max 50) and `offset` (default 0) query params.
 *
 * A non-positive value falls back to the default, which is documented and is
 * what stops a hostile query string producing a pathological RPC fan-out: a
 * caller asking for everything gets a bounded page rather than an error.
 *
 * A value that is *not an integer* is a different thing — a client built the
 * query wrong — and it used to be answered the same way, with a default page,
 * so the mistake was invisible. It is now `PARAMETER_NOT_INTEGER`, and a
 * negative integer is `PARAMETER_NEGATIVE`. Those two codes had no call site
 * before this: the only helper that raised them was dead, so the rule lived
 * where nobody called it.
 */
import { apiError } from './errors';

export interface Pagination {
  limit: number;
  offset: number;
}

const MAX_LIMIT = 50;

export function parsePagination(
  searchParams: URLSearchParams,
  defaults: Pagination = { limit: 20, offset: 0 },
): Pagination {
  return {
    limit: boundedInt(searchParams, 'limit', defaults.limit, MAX_LIMIT),
    offset: boundedInt(searchParams, 'offset', defaults.offset),
  };
}

/** Read an integer param, falling back when absent or non-positive. */
function boundedInt(
  searchParams: URLSearchParams,
  param: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!searchParams.has(param)) return fallback;

  const raw = Number(searchParams.get(param));
  if (!Number.isInteger(raw)) {
    throw apiError('PARAMETER_NOT_INTEGER', `${param} must be an integer`);
  }
  if (raw < 0) {
    throw apiError('PARAMETER_NEGATIVE', `${param} must not be negative`);
  }
  // Zero reads as "unset" for both params: `limit=0` is a client asking for a
  // page of nothing, and answering with the default is the documented contract.
  if (raw === 0) return fallback;

  return Math.min(raw, max);
}
