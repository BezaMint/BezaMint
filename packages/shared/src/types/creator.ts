/**
 * Creator profile for platform display
 */
export interface CreatorProfile {
  address: string;
  displayName: string;
  bio: string;
  avatarUri: string;
  bannerUri?: string;
  socialLinks: SocialLink[];
  createdAt: number;
  updatedAt: number;
  isVerified: boolean;
  totalNftsCreated: number;
  totalCollections: number;
}

/**
 * Social link associated with a creator profile
 */
export interface SocialLink {
  platform: SocialPlatform;
  url: string;
}

export type SocialPlatform =
  | 'twitter'
  | 'discord'
  | 'github'
  | 'website'
  | 'youtube'
  | 'instagram'
  | 'telegram'
  | 'other';

/**
 * Creator form state
 */
export interface CreatorFormState {
  displayName: string;
  bio: string;
  avatarUri: string;
  bannerUri: string;
  socialLinks: SocialLink[];
}
