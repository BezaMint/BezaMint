import { METADATA_LIMITS, ROYALTY_LIMITS, CREATOR_LIMITS } from '../constants/limits';

/**
 * Validate NFT name
 */
export function validateNftName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) return { valid: false, error: 'Name is required' };
  if (name.length > METADATA_LIMITS.name.max)
    return { valid: false, error: `Name must be ${METADATA_LIMITS.name.max} characters or fewer` };
  return { valid: true };
}

/**
 * Validate NFT description
 */
export function validateDescription(desc: string): { valid: boolean; error?: string } {
  if (desc.length > METADATA_LIMITS.description.max)
    return {
      valid: false,
      error: `Description must be ${METADATA_LIMITS.description.max} characters or fewer`,
    };
  return { valid: true };
}

/**
 * Validate royalty basis points
 */
export function validateRoyaltyBps(bps: number): { valid: boolean; error?: string } {
  if (bps < ROYALTY_LIMITS.minBasisPoints || bps > ROYALTY_LIMITS.maxBasisPoints)
    return { valid: false, error: 'Royalty must be between 0% and 100%' };
  return { valid: true };
}

/**
 * Validate Stellar wallet address format
 */
export function validateStellarAddress(address: string): { valid: boolean; error?: string } {
  const gRegex = /^G[A-Z2-7]{55}$/;
  if (!gRegex.test(address))
    return { valid: false, error: 'Invalid Stellar address format' };
  return { valid: true };
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url) return { valid: true }; // Allow empty for optional fields
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate creator display name
 */
export function validateDisplayName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) return { valid: false, error: 'Display name is required' };
  if (name.length > CREATOR_LIMITS.displayName.max)
    return {
      valid: false,
      error: `Display name must be ${CREATOR_LIMITS.displayName.max} characters or fewer`,
    };
  return { valid: true };
}
