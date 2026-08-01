/**
 * Royalty configuration structure
 */
export interface RoyaltyConfig {
  /** Basis points (1/100 of a percent), e.g., 500 = 5% */
  basisPoints: number;
  /** Distribution between recipients */
  recipients: RoyaltyRecipient[];
  /** Whether the royalty can be modified */
  isFrozen: boolean;
}

export interface RoyaltyRecipient {
  address: string;
  /** Share as percentage (should total 100 across all recipients) */
  share: number;
}
