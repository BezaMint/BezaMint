/**
 * Shared pagination parsing for list endpoints.
 * Accepts `limit` (default 20, max 50) and `offset` (default 0) query params
 * and clamps them to sane bounds so a hostile query string cannot produce a
 * pathological RPC fan-out.
 */

export interface Pagination {
  limit: number;
  offset: number;
}

export function parsePagination(
  searchParams: URLSearchParams,
  defaults: Pagination = { limit: 20, offset: 0 },
): Pagination {
  const rawLimit = Number(searchParams.get('limit'));
  const rawOffset = Number(searchParams.get('offset'));

  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : defaults.limit;
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : defaults.offset;

  return { limit, offset };
}
