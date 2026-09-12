import { METADATA_LIMITS, ROYALTY_LIMITS, CREATOR_LIMITS } from '../constants/limits';
import type { DeclaredErrorCode } from '../errors';

/**
 * The result of a validation rule.
 *
 * `error` is the sentence a user sees; `code` is the stable identifier a caller
 * branches on. They used to be the same thing — a caller that wanted to
 * distinguish "name is missing" from "name is too long" had to match on the
 * prose, which the next copy edit silently broke. Every failure now carries the
 * catalogue code for the rule it broke.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: DeclaredErrorCode;
}

const fail = (code: DeclaredErrorCode, error: string): ValidationResult => ({
  valid: false,
  error,
  code,
});

/**
 * Validate NFT name
 */
export function validateNftName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) return fail('NAME_REQUIRED', 'Name is required');
  if (name.length > METADATA_LIMITS.name.max)
    return fail('NAME_TOO_LONG', `Name must be ${METADATA_LIMITS.name.max} characters or fewer`);
  return { valid: true };
}

/**
 * Validate NFT description
 */
export function validateDescription(desc: string): ValidationResult {
  if (desc.length > METADATA_LIMITS.description.max)
    return fail(
      'DESCRIPTION_TOO_LONG',
      `Description must be ${METADATA_LIMITS.description.max} characters or fewer`,
    );
  return { valid: true };
}

/**
 * Validate royalty basis points
 */
export function validateRoyaltyBps(bps: number): ValidationResult {
  if (!Number.isInteger(bps))
    return fail('BASIS_POINTS_OUT_OF_RANGE', 'Royalty must be a whole number of basis points');
  if (bps < ROYALTY_LIMITS.minBasisPoints || bps > ROYALTY_LIMITS.maxBasisPoints)
    return fail('BASIS_POINTS_OUT_OF_RANGE', 'Royalty must be between 0% and 100%');
  return { valid: true };
}

/**
 * Validate Stellar wallet address format
 */
export function validateStellarAddress(address: string): ValidationResult {
  if (!address) return fail('ADDRESS_REQUIRED', 'A Stellar account address is required');
  const gRegex = /^G[A-Z2-7]{55}$/;
  if (!gRegex.test(address)) return fail('ADDRESS_MALFORMED', 'Invalid Stellar address format');
  return { valid: true };
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): ValidationResult {
  if (!url) return { valid: true }; // Allow empty for optional fields
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return fail('URL_MALFORMED', 'Invalid URL format');
  }
}

/**
 * Validate creator display name
 */
export function validateDisplayName(name: string): ValidationResult {
  if (!name || name.trim().length === 0)
    return fail('DISPLAY_NAME_REQUIRED', 'Display name is required');
  if (name.length > CREATOR_LIMITS.displayName.max)
    return fail(
      'DISPLAY_NAME_TOO_LONG',
      `Display name must be ${CREATOR_LIMITS.displayName.max} characters or fewer`,
    );
  return { valid: true };
}

export function validateRoyaltyRecipients(
  recipients: { address: string; share: number }[],
): ValidationResult {
  if (!recipients || recipients.length === 0) return { valid: true };
  if (recipients.length > 10)
    return fail('ROYALTY_RECIPIENTS_TOO_MANY', 'Max 10 royalty recipients');
  const total = recipients.reduce((s, r) => s + r.share, 0);
  if (total !== 100) return fail('ROYALTY_SHARE_SUM_INVALID', 'Royalty shares must total 100%');
  for (const r of recipients) {
    if (r.share < 0 || r.share > 100)
      return fail('ROYALTY_SHARE_OUT_OF_RANGE', 'Each share must be 0-100%');
  }
  return { valid: true };
}

export function isValidIpfsUri(uri: string): boolean {
  return (
    uri.startsWith('ipfs://') ||
    uri.startsWith('https://ipfs.io/ipfs/') ||
    uri.startsWith('https://gateway.pinata.cloud/ipfs/')
  );
}

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isPositiveInteger(value: string | number): boolean {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  return Number.isInteger(num) && num > 0;
}
