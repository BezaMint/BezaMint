/**
 * Platform limits and validations
 */

/** Maximum metadata length constraints */
export const METADATA_LIMITS = {
  name: { min: 1, max: 128 },
  description: { max: 2000 },
  externalUrl: { max: 512 },
  attributes: { max: 50 },
  attributeValue: { max: 128 },
} as const;

/** Royalty limits */
export const ROYALTY_LIMITS = {
  maxBasisPoints: 10000, // 100%
  minBasisPoints: 0,
  maxRecipients: 10,
} as const;

/** Collection limits */
export const COLLECTION_LIMITS = {
  maxNfts: 10000,
  maxCollections: 500,
  tags: { max: 20, tagMaxLength: 32 },
  categoryOptions: [
    'art',
    'music',
    'gaming',
    'sports',
    'photography',
    'brand',
    'membership',
    'ticketing',
    'real_estate',
    'other',
  ] as const,
} as const;

/** Creator profile limits */
export const CREATOR_LIMITS = {
  displayName: { min: 1, max: 64 },
  bio: { max: 1000 },
  socialLinks: { max: 10 },
} as const;

/** Pagination defaults */
export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
  maxLimit: 100,
} as const;
