import { xdr, Address, scValToNative } from '@stellar/stellar-sdk';
import type { SocialLink } from '@bezamint/shared';
import {
  buildContractTransaction,
  simulateTransaction,
  submitSignedTransaction,
  waitForTransaction,
} from './stellar';
import { isFreighterInstalled, getFreighterApi, signFreighterTransaction } from '@/lib/freighter';
import { STELLAR_NETWORK_PASSPHRASE } from '@/lib/constants';

// Re-export for convenience
export { isFreighterInstalled } from '@/lib/freighter';

// ─────────────────────── Contract IDs ───────────────────────

export const CONTRACT_IDS = {
  nft: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || '',
  collection: process.env.NEXT_PUBLIC_COLLECTION_CONTRACT_ID || '',
  royalty: process.env.NEXT_PUBLIC_ROYALTY_CONTRACT_ID || '',
  creator: process.env.NEXT_PUBLIC_CREATOR_CONTRACT_ID || '',
  factory: process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID || '',
};

// ─────────────────────── Error Types ───────────────────────

/** Categorized error types for user-friendly messaging */
export enum TxErrorType {
  WalletNotInstalled = 'WALLET_NOT_INSTALLED',
  ConnectionRejected = 'CONNECTION_REJECTED',
  UserCancelled = 'USER_CANCELLED',
  InsufficientBalance = 'INSUFFICIENT_BALANCE',
  ContractError = 'CONTRACT_ERROR',
  NetworkError = 'NETWORK_ERROR',
  Timeout = 'TIMEOUT',
  Unknown = 'UNKNOWN',
}

export class TxError extends Error {
  constructor(
    message: string,
    public readonly type: TxErrorType,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'TxError';
  }
}

function categorizeError(err: unknown): TxError {
  const message = (err as { message?: string })?.message || '';

  if (message.includes('not installed') || message.includes('Freighter')) {
    return new TxError(
      'Freighter wallet is not installed. Please install the Freighter browser extension.',
      TxErrorType.WalletNotInstalled,
      err,
    );
  }
  if (
    message.includes('cancelled') ||
    message.includes('rejected') ||
    message.includes('denied') ||
    message.includes('user')
  ) {
    return new TxError('Transaction was cancelled by user.', TxErrorType.UserCancelled, err);
  }
  if (message.includes('insufficient') || message.includes('balance')) {
    return new TxError(message, TxErrorType.InsufficientBalance, err);
  }
  if (message.includes('timeout') || message.includes('not finalized')) {
    return new TxError(message, TxErrorType.Timeout, err);
  }
  if (message.includes('network') || message.includes('fetch')) {
    return new TxError(message, TxErrorType.NetworkError, err);
  }

  return new TxError(message || 'Transaction failed', TxErrorType.Unknown, err);
}

// ─────────────────────── NFT Contract ───────────────────────

export async function mintNft(
  sourceAddress: string,
  toAddress: string,
  collectionId: number,
  metadataUri: string,
) {
  const toScVal = new Address(toAddress).toScVal();
  const collectionScVal = xdr.ScVal.scvU64(new xdr.Uint64(collectionId));
  const metadataScVal = xdr.ScVal.scvString(metadataUri);

  const { tx } = await buildContractTransaction(sourceAddress, CONTRACT_IDS.nft, 'mint', [
    toScVal,
    collectionScVal,
    metadataScVal,
  ]);

  return tx;
}

/**
 * Mint an NFT through the Factory with royalty terms in one atomic call.
 *
 * This is the platform's mint path: the Factory mints the token, links it to
 * its collection and configures the creator's royalty. `collectionId` must be
 * a collection the caller owns, otherwise the whole transaction is rejected.
 * `basisPoints` is the royalty rate (500 = 5%, max 10000).
 */
export async function mintWithRoyalty(
  sourceAddress: string,
  toAddress: string,
  collectionId: number,
  metadataUri: string,
  basisPoints: number,
) {
  const callerScVal = new Address(sourceAddress).toScVal();
  const toScVal = new Address(toAddress).toScVal();
  const collectionScVal = xdr.ScVal.scvU64(new xdr.Uint64(collectionId));
  const metadataScVal = xdr.ScVal.scvString(metadataUri);
  const basisPointsScVal = xdr.ScVal.scvU32(basisPoints);

  const { tx } = await buildContractTransaction(
    sourceAddress,
    CONTRACT_IDS.factory,
    'mint_with_royalty',
    [callerScVal, toScVal, collectionScVal, metadataScVal, basisPointsScVal],
  );

  return tx;
}

/**
 * Burn an NFT and remove it from its collection in one atomic call.
 *
 * Requires the caller to be both the NFT owner and the collection creator;
 * a collector who does not own the collection cannot destroy a collection
 * member.
 */
export async function burnNft(sourceAddress: string, collectionId: number, tokenId: number) {
  const callerScVal = new Address(sourceAddress).toScVal();
  const collectionScVal = xdr.ScVal.scvU64(new xdr.Uint64(collectionId));
  const tokenScVal = xdr.ScVal.scvU64(new xdr.Uint64(tokenId));

  const { tx } = await buildContractTransaction(sourceAddress, CONTRACT_IDS.factory, 'burn_nft', [
    callerScVal,
    collectionScVal,
    tokenScVal,
  ]);

  return tx;
}

export async function getTotalSupply(sourceAddress: string): Promise<number> {
  try {
    const result = await simulateTransaction(sourceAddress, CONTRACT_IDS.nft, 'total_supply', []);
    if (result.result?.retval) {
      return Number(scValToNative(result.result.retval));
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function getOwnerOf(sourceAddress: string, tokenId: number): Promise<string | null> {
  try {
    const tokenScVal = xdr.ScVal.scvU64(new xdr.Uint64(tokenId));
    const result = await simulateTransaction(sourceAddress, CONTRACT_IDS.nft, 'owner_of', [
      tokenScVal,
    ]);
    if (result.result?.retval) {
      const addr = scValToNative(result.result.retval);
      return typeof addr === 'string' ? addr : null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface OnChainTokenData {
  tokenId: number;
  creator: string;
  collectionId: number;
  metadataUri: string;
}

/**
 * Fetch on-chain token metadata (creator, collection, metadata URI) for a token.
 * Returns null if the token does not exist or the contract is unreachable.
 */
export async function getTokenData(
  sourceAddress: string,
  tokenId: number,
): Promise<OnChainTokenData | null> {
  try {
    const tokenScVal = xdr.ScVal.scvU64(new xdr.Uint64(tokenId));
    const result = await simulateTransaction(sourceAddress, CONTRACT_IDS.nft, 'token_data', [
      tokenScVal,
    ]);
    if (result.result?.retval) {
      const raw = scValToNative(result.result.retval) as Record<string, unknown>;
      return {
        tokenId: Number(raw.token_id ?? tokenId),
        creator: String(raw.creator ?? ''),
        collectionId: Number(raw.collection_id ?? 0),
        metadataUri: String(raw.metadata_uri ?? ''),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────── Collection Contract ───────────────────────

/**
 * Create a collection through the Factory (also auto-registers the creator).
 * Returns the built transaction XDR ready for signing + submission.
 */
export async function createCollection(sourceAddress: string, metadataUri: string) {
  const callerScVal = new Address(sourceAddress).toScVal();
  const uriScVal = xdr.ScVal.scvString(metadataUri);

  const { tx } = await buildContractTransaction(
    sourceAddress,
    CONTRACT_IDS.factory,
    'create_collection_for_creator',
    [callerScVal, uriScVal],
  );

  return tx;
}

/**
 * Update a collection's metadata URI. Requires the collection creator's auth.
 */
export async function updateCollection(
  sourceAddress: string,
  collectionId: number,
  newMetadataUri: string,
) {
  const creatorScVal = new Address(sourceAddress).toScVal();
  const idScVal = xdr.ScVal.scvU64(new xdr.Uint64(collectionId));
  const uriScVal = xdr.ScVal.scvString(newMetadataUri);

  const { tx } = await buildContractTransaction(
    sourceAddress,
    CONTRACT_IDS.collection,
    'update_collection',
    [creatorScVal, idScVal, uriScVal],
  );

  return tx;
}

/**
 * Archive a collection. Requires the collection creator's auth.
 */
export async function archiveCollection(sourceAddress: string, collectionId: number) {
  const creatorScVal = new Address(sourceAddress).toScVal();
  const idScVal = xdr.ScVal.scvU64(new xdr.Uint64(collectionId));

  const { tx } = await buildContractTransaction(
    sourceAddress,
    CONTRACT_IDS.collection,
    'archive_collection',
    [creatorScVal, idScVal],
  );

  return tx;
}

/**
 * Fetch a page of token IDs held in a collection.
 *
 * `start` is a zero-based offset into the membership vector; `limit` is
 * clamped to 100 by the contract. Returns an empty array past the end.
 */
export async function getNftsInCollection(
  sourceAddress: string,
  collectionId: number,
  start = 0,
  limit = 100,
): Promise<number[]> {
  try {
    const idScVal = xdr.ScVal.scvU64(new xdr.Uint64(collectionId));
    const startScVal = xdr.ScVal.scvU64(new xdr.Uint64(start));
    const limitScVal = xdr.ScVal.scvU32(limit);
    const result = await simulateTransaction(
      sourceAddress,
      CONTRACT_IDS.collection,
      'get_nfts_in_collection',
      [idScVal, startScVal, limitScVal],
    );
    if (result.result?.retval) {
      const ids = scValToNative(result.result.retval);
      return Array.isArray(ids) ? ids.map(Number) : [];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Fetch the collection ID a token belongs to (0 when unmapped).
 */
export async function getCollectionForNft(sourceAddress: string, tokenId: number): Promise<number> {
  try {
    const tokenScVal = xdr.ScVal.scvU64(new xdr.Uint64(tokenId));
    const result = await simulateTransaction(
      sourceAddress,
      CONTRACT_IDS.collection,
      'get_collection_for_nft',
      [tokenScVal],
    );
    if (result.result?.retval) {
      return Number(scValToNative(result.result.retval));
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function getTotalCollections(sourceAddress: string): Promise<number> {
  try {
    const result = await simulateTransaction(
      sourceAddress,
      CONTRACT_IDS.collection,
      'total_collections',
      [],
    );
    if (result.result?.retval) {
      return Number(scValToNative(result.result.retval));
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Fetch collection IDs created by a specific creator address.
 * Returns an empty array on error so UIs can fall back gracefully.
 */
export async function getCollectionsByCreator(
  sourceAddress: string,
  start = 0,
  limit = 100,
): Promise<number[]> {
  try {
    const creatorScVal = new Address(sourceAddress).toScVal();
    const result = await simulateTransaction(
      sourceAddress,
      CONTRACT_IDS.collection,
      'get_collections_by_creator',
      [creatorScVal, xdr.ScVal.scvU64(new xdr.Uint64(start)), xdr.ScVal.scvU32(limit)],
    );
    if (result.result?.retval) {
      const ids = scValToNative(result.result.retval);
      return Array.isArray(ids) ? ids.map(Number) : [];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Fetch a single collection's on-chain data by ID.
 */
export async function getCollectionById(
  sourceAddress: string,
  collectionId: number,
): Promise<Record<string, unknown> | null> {
  try {
    const idScVal = xdr.ScVal.scvU64(new xdr.Uint64(collectionId));
    const result = await simulateTransaction(
      sourceAddress,
      CONTRACT_IDS.collection,
      'get_collection',
      [idScVal],
    );
    if (result.result?.retval) {
      return scValToNative(result.result.retval) as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────── Creator Contract ───────────────────────

export interface OnChainCreatorProfile {
  address: string;
  displayName: string;
  bio: string;
  avatarUri: string;
  bannerUri: string;
  isVerified: boolean;
  socialLinks: SocialLink[];
}

/**
 * Fetch a creator profile from the Creator contract.
 * Returns null if the creator is not registered.
 */
export async function getCreatorProfile(
  sourceAddress: string,
  creatorAddress: string,
): Promise<OnChainCreatorProfile | null> {
  try {
    const creatorScVal = new Address(creatorAddress).toScVal();
    const result = await simulateTransaction(sourceAddress, CONTRACT_IDS.creator, 'get_profile', [
      creatorScVal,
    ]);
    if (result.result?.retval) {
      const raw = scValToNative(result.result.retval) as Record<string, unknown>;
      const socialLinks = (raw.social_links as Array<{ platform: string; url: string }>) || [];
      return {
        address: String(raw.address ?? creatorAddress),
        displayName: String(raw.display_name ?? ''),
        bio: String(raw.bio ?? ''),
        avatarUri: String(raw.avatar_uri ?? ''),
        bannerUri: String(raw.banner_uri ?? ''),
        isVerified: Boolean(raw.is_verified),
        socialLinks: socialLinks.map((l) => ({ platform: l.platform, url: l.url }) as SocialLink),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getTotalCreators(sourceAddress: string): Promise<number> {
  try {
    const result = await simulateTransaction(
      sourceAddress,
      CONTRACT_IDS.creator,
      'total_creators',
      [],
    );
    if (result.result?.retval) {
      return Number(scValToNative(result.result.retval));
    }
    return 0;
  } catch {
    return 0;
  }
}

// ─────────────────────── Royalty Contract ───────────────────────

export interface OnChainRoyaltyConfig {
  basisPoints: number;
  recipients: Array<{ address: string; share: number }>;
  isFrozen: boolean;
}

/**
 * Fetch a royalty config (NFT-level or collection-level).
 * Returns null when no config exists or the contract is unreachable.
 */
export async function getRoyaltyConfig(
  sourceAddress: string,
  targetId: number,
  isCollection = false,
): Promise<OnChainRoyaltyConfig | null> {
  try {
    const idScVal = xdr.ScVal.scvU64(new xdr.Uint64(targetId));
    const isCollectionScVal = xdr.ScVal.scvBool(isCollection);
    const result = await simulateTransaction(sourceAddress, CONTRACT_IDS.royalty, 'get_royalty', [
      idScVal,
      isCollectionScVal,
    ]);
    if (result.result?.retval) {
      const raw = scValToNative(result.result.retval) as Record<string, unknown>;
      const recipients = (raw.recipients as Map<string, number>) || new Map();
      return {
        basisPoints: Number(raw.basis_points ?? 0),
        recipients: Array.from(recipients.entries()).map(([address, share]) => ({
          address,
          share: Number(share),
        })),
        isFrozen: Boolean(raw.is_frozen),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export interface CreatorProfileInput {
  displayName: string;
  bio: string;
  avatarUri: string;
  bannerUri: string;
}

/**
 * Build a register() transaction for the Creator contract.
 */
export async function registerCreator(sourceAddress: string, profile: CreatorProfileInput) {
  const creatorScVal = new Address(sourceAddress).toScVal();
  const nameScVal = xdr.ScVal.scvString(profile.displayName);
  const bioScVal = xdr.ScVal.scvString(profile.bio);
  const avatarScVal = xdr.ScVal.scvString(profile.avatarUri);
  const bannerScVal = xdr.ScVal.scvString(profile.bannerUri);

  const { tx } = await buildContractTransaction(sourceAddress, CONTRACT_IDS.creator, 'register', [
    creatorScVal,
    nameScVal,
    bioScVal,
    avatarScVal,
    bannerScVal,
  ]);

  return tx;
}

/**
 * Build an update_profile() transaction for the Creator contract.
 */
export async function updateCreatorProfile(sourceAddress: string, profile: CreatorProfileInput) {
  const creatorScVal = new Address(sourceAddress).toScVal();
  const nameScVal = xdr.ScVal.scvString(profile.displayName);
  const bioScVal = xdr.ScVal.scvString(profile.bio);
  const avatarScVal = xdr.ScVal.scvString(profile.avatarUri);
  const bannerScVal = xdr.ScVal.scvString(profile.bannerUri);

  const { tx } = await buildContractTransaction(
    sourceAddress,
    CONTRACT_IDS.creator,
    'update_profile',
    [creatorScVal, nameScVal, bioScVal, avatarScVal, bannerScVal],
  );

  return tx;
}

/**
 * Build a set_social_links() transaction for the Creator contract.
 */
export async function setCreatorSocialLinks(sourceAddress: string, links: SocialLink[]) {
  const creatorScVal = new Address(sourceAddress).toScVal();
  const linksScVal = xdr.ScVal.scvVec(
    links.map((link) =>
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvString('platform'),
          val: xdr.ScVal.scvString(link.platform),
        }),
        new xdr.ScMapEntry({ key: xdr.ScVal.scvString('url'), val: xdr.ScVal.scvString(link.url) }),
      ]),
    ),
  );

  const { tx } = await buildContractTransaction(
    sourceAddress,
    CONTRACT_IDS.creator,
    'set_social_links',
    [creatorScVal, linksScVal],
  );

  return tx;
}

// ─────────────────────── Transaction Flow ───────────────────────

export async function signAndSubmit(
  txXdr: string,
  onStatus?: (status: string) => void,
): Promise<{ txHash: string; result: unknown }> {
  if (!isFreighterInstalled()) {
    throw new TxError(
      'Freighter wallet is not installed. Please install the Freighter browser extension.',
      TxErrorType.WalletNotInstalled,
    );
  }

  onStatus?.('signing');
  let signedXdr: string;
  try {
    signedXdr = await signFreighterTransaction(txXdr, {
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
    });
  } catch (err: unknown) {
    throw categorizeError(err);
  }

  onStatus?.('submitting');
  const submitResult = await submitSignedTransaction(signedXdr);

  if (submitResult.status === 'ERROR') {
    throw new TxError(
      `Submission failed: ${(submitResult as { errorResultXdr?: string }).errorResultXdr || 'Unknown error'}`,
      TxErrorType.ContractError,
    );
  }

  const txHash = submitResult.hash;
  onStatus?.('confirming');

  const result = await waitForTransaction(txHash);

  return { txHash, result };
}
