/**
 * Server-side input validation shared by API routes.
 *
 * Route handlers previously re-declared their own address regexes, so a
 * tightening in one route wouldn't propagate. This module is the single
 * source of truth for address/query-param checks and throws typed
 * ApiErrors that the routes' normalizers already understand.
 */
import { ApiError, badRequest } from './errors';

/** Stellar public keys are 56-char base32 strings starting with 'G'. */
export const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export function isValidStellarAddress(value: string): boolean {
  return STELLAR_ADDRESS_RE.test(value);
}

/** Parse and validate a required address query param. */
export function requireStellarAddress(searchParams: URLSearchParams, param = 'address'): string {
  const value = searchParams.get(param)?.trim() ?? '';
  if (!value) {
    throw badRequest(`${param} query parameter is required`);
  }
  if (!isValidStellarAddress(value)) {
    throw badRequest(`${param} must be a valid Stellar account address`);
  }
  return value;
}

/** Validate an optional address query param; undefined when absent/empty. */
export function optionalStellarAddress(
  searchParams: URLSearchParams,
  param: string,
): string | undefined {
  const value = searchParams.get(param)?.trim();
  if (!value) return undefined;
  if (!isValidStellarAddress(value)) {
    throw badRequest(`${param} must be a valid Stellar account address`);
  }
  return value;
}

/** Parse a bounded non-negative integer query param with a default. */
export function intParam(
  searchParams: URLSearchParams,
  param: string,
  defaultValue: number,
  max: number,
): number {
  const raw = Number(searchParams.get(param));
  if (!searchParams.has(param)) return defaultValue;
  if (!Number.isInteger(raw) || raw < 0) {
    throw new ApiError('BAD_REQUEST', `${param} must be a non-negative integer`, 400);
  }
  return Math.min(raw, max);
}
