/**
 * Collection metadata for display and marketplace integration
 */
export interface CollectionMetadata {
  name: string;
  description: string;
  imageUri: string;
  externalUrl?: string;
  category: CollectionCategory;
  tags: string[];
}

/**
 * On-chain collection data
 */
export interface CollectionData {
  id: string;
  creator: string;
  metadataUri: string;
  nftCount: number;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
  contractId?: string;
}

/**
 * Collection categories for organization
 */
export type CollectionCategory =
  | 'art'
  | 'music'
  | 'gaming'
  | 'sports'
  | 'photography'
  | 'brand'
  | 'membership'
  | 'ticketing'
  | 'real_estate'
  | 'other';

/**
 * Collection creation/edit form state
 */
export interface CollectionFormState {
  name: string;
  description: string;
  imageUri: string;
  externalUrl: string;
  category: CollectionCategory;
  tags: string[];
}
