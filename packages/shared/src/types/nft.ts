import type { RoyaltyConfig } from './royalty';

/**
 * NFT metadata structure matching Stellar ecosystem standards
 */
export interface NftMetadata {
  name: string;
  description: string;
  imageUri: string;
  animationUri?: string;
  externalUrl?: string;
  attributes: NftAttribute[];
}

/**
 * Represents an attribute or trait of an NFT
 */
export interface NftAttribute {
  traitType: string;
  value: string;
  displayType?: 'string' | 'number' | 'boost_number' | 'boost_percentage' | 'date';
  maxValue?: number;
}

/**
 * On-chain state for a minted NFT
 */
export interface NftData {
  owner: string;
  creator: string;
  tokenId: string;
  collectionId: string;
  metadataUri: string;
  mintedAt: number;
  isMinted: boolean;
}

/**
 * Minting transaction state
 */
export type MintStatus =
  | 'idle'
  | 'uploading'
  | 'preparing'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'success'
  | 'error';

/**
 * Minting form state
 */
export interface MintFormState {
  name: string;
  description: string;
  imageUri: string;
  animationUri: string;
  externalUrl: string;
  attributes: NftAttribute[];
  collectionId: string;
  royalties: RoyaltyConfig | null;
}
