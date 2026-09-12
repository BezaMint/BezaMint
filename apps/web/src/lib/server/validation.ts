/**
 * Server-side input validation shared by API routes.
 *
 * Route handlers previously re-declared their own address regexes, so a
 * tightening in one route wouldn't propagate. This module is the single
 * source of truth for address/query-param checks and throws typed
 * ApiErrors that the routes' normalizers already understand.
 */
import { apiError } from './errors';

/** Stellar public keys are 56-char base32 strings starting with 'G'. */
export const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export function isValidStellarAddress(value: string): boolean {
  return STELLAR_ADDRESS_RE.test(value);
}

/** Parse and validate a required address query param. */
export function requireStellarAddress(searchParams: URLSearchParams, param = 'address'): string {
  const value = searchParams.get(param)?.trim() ?? '';
  if (!value) {
    throw apiError('ADDRESS_REQUIRED', `${param} query parameter is required`);
  }
  if (!isValidStellarAddress(value)) {
    throw apiError('ADDRESS_MALFORMED', `${param} must be a valid Stellar account address`);
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
    throw apiError('ADDRESS_MALFORMED', `${param} must be a valid Stellar account address`);
  }
  return value;
}

/**
 * Parse a required JSON body, distinguishing "absent" from "unparseable".
 *
 * The two are different answers to a caller and were previously the same
 * `BAD_REQUEST`: an empty body is a client that forgot, malformed JSON is a
 * client that built the payload wrong.
 */
export async function requireJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim().length === 0) {
    throw apiError('JSON_BODY_REQUIRED');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw apiError('JSON_BODY_MALFORMED');
  }
}
