/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Search parameters
 */
export interface SearchParams {
  query: string;
  filters?: Record<string, string>;
  pagination: PaginationParams;
}

/**
 * Activity event
 */
export type ActivityEventType =
  | 'nft_minted'
  | 'nft_transferred'
  | 'metadata_updated'
  | 'collection_created'
  | 'collection_updated'
  | 'royalty_configured'
  | 'royalty_updated'
  | 'profile_created'
  | 'profile_updated';

export interface ActivityEvent {
  id: string;
  eventType: ActivityEventType;
  address: string;
  timestamp: number;
  txHash: string;
  details: Record<string, unknown>;
}

/**
 * Wallet connection state
 */
export type WalletConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WalletState {
  address: string | null;
  network: string;
  connectionState: WalletConnectionState;
  error: string | null;
}

export enum EventType {
  NFT_MINTED = 'nft_minted',
  NFT_TRANSFERRED = 'nft_transferred',
  NFT_BURNED = 'nft_burned',
  COLLECTION_CREATED = 'collection_created',
  COLLECTION_UPDATED = 'collection_updated',
  COLLECTION_ARCHIVED = 'collection_archived',
  ROYALTY_CONFIGURED = 'royalty_configured',
  ROYALTY_UPDATED = 'royalty_updated',
  ROYALTY_FROZEN = 'royalty_frozen',
  PROFILE_CREATED = 'profile_created',
  PROFILE_UPDATED = 'profile_updated',
  CREATOR_VERIFIED = 'creator_verified',
}

export type MintStatus = 'idle' | 'uploading' | 'preparing' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';

export interface CollectionFilter { category?: string; creator?: string; archived?: boolean; search?: string; }
export interface SortOptions { field: string; direction: "asc" | "desc"; }
