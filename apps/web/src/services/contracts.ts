import { xdr, Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { isErrorCode, type AnyErrorCode, type SocialLink } from '@bezamint/shared';
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
    /**
     * The catalogue code for this failure.
     *
     * `type` is the coarse bucket the UI switches on; `code` is the specific
     * failure, and it is what a user is told when the bucket is `Unknown` and
     * what a bug report quotes. Both are carried because removing `type` would
     * rewrite every consumer for no user-visible gain.
     */
    public readonly code: AnyErrorCode = 'TX_RESULT_FAILED',
  ) {
    super(message);
    this.name = 'TxError';
  }
}

/**
 * Classify a wallet or network failure into a catalogue code.
 *
 * The patterns are the vocabulary the Freighter extension and the Stellar SDK
 * actually use. Matching is on lower-cased text because the same refusal arrives
 * as `User declined`, `user rejected`, and `Request was denied` depending on the
 * extension version, and a user cancelling was previously reported as a network
 * error whenever their browser's phrase differed from the one we happened to
 * check for.
 *
 * Ordered from most specific to least: `insufficient` appears in both
 * "insufficient balance" and "insufficient fee", and the balance case is the
 * one a user can act on.
 */
export function categorizeError(err: unknown): TxError {
  const message = (err as { message?: string })?.message || '';
  const text = message.toLowerCase();

  const has = (...needles: string[]) => needles.some((needle) => text.includes(needle));

  // A failure that already knows its code — a `WalletError` from the wrapper, or
  // a protocol failure that `normalizeError` classified — is taken at its word.
  // Re-deriving it from the sentence here is how a wallet's own precise code got
  // downgraded to "unknown" on the way to the UI.
  const preset = (err as { code?: unknown })?.code;
  if (typeof preset === 'string' && isErrorCode(preset)) {
    const type = preset.startsWith('WALLET_')
      ? preset === 'WALLET_USER_REJECTED'
        ? TxErrorType.UserCancelled
        : TxErrorType.ConnectionRejected
      : TxErrorType.ContractError;
    return new TxError(message || 'Transaction failed', type, err, preset as AnyErrorCode);
  }

  if (has('not installed', 'extension is not available', 'freighter is not installed')) {
    return new TxError(
      'Freighter wallet is not installed. Please install the Freighter browser extension.',
      TxErrorType.WalletNotInstalled,
      err,
      'WALLET_NOT_INSTALLED',
    );
  }
  if (has('not connected', 'not authorised', 'no account is connected')) {
    return new TxError(
      'Your wallet is not connected. Connect it and try again.',
      TxErrorType.ConnectionRejected,
      err,
      'WALLET_NOT_CONNECTED',
    );
  }
  if (has('declined', 'rejected', 'denied', 'cancelled', 'canceled')) {
    return new TxError(
      'Transaction was cancelled by user.',
      TxErrorType.UserCancelled,
      err,
      'WALLET_USER_REJECTED',
    );
  }
  if (has('access to this site', 'site access', 'permission')) {
    return new TxError(
      'Freighter refused this site access to your account.',
      TxErrorType.ConnectionRejected,
      err,
      'WALLET_ACCESS_DENIED',
    );
  }
  if (has('popup', 'blocked')) {
    return new TxError(
      'Your browser blocked the wallet window. Allow pop-ups for this site and try again.',
      TxErrorType.ConnectionRejected,
      err,
      'WALLET_POPUP_BLOCKED',
    );
  }
  if (has('different network', 'wrong network', 'network mismatch', 'passphrase')) {
    return new TxError(
      'Your wallet is on a different network than this app. Switch it and try again.',
      TxErrorType.NetworkError,
      err,
      'WALLET_WRONG_NETWORK',
    );
  }
  if (has('insufficient balance', 'insufficient funds', 'underfunded')) {
    return new TxError(message, TxErrorType.InsufficientBalance, err, 'TX_FEE_UNPAYABLE');
  }
  if (has('timeout', 'timed out', 'not finalized')) {
    return new TxError(message, TxErrorType.Timeout, err, 'TX_CONFIRMATION_TIMEOUT');
  }
  if (has('bad sequence', 'tx_bad_seq', 'sequence number')) {
    return new TxError(message, TxErrorType.NetworkError, err, 'TX_SEQUENCE_STALE');
  }
  if (has('malformed', 'invalid xdr', 'not valid base64')) {
    return new TxError(message, TxErrorType.Unknown, err, 'TX_XDR_MALFORMED');
  }
  if (has('auth', 'unauthorized', 'signature')) {
    return new TxError(message, TxErrorType.ContractError, err, 'TX_AUTH_ENTRY_MISSING');
  }
  if (has('network', 'fetch', 'connection')) {
    return new TxError(message, TxErrorType.NetworkError, err, 'NETWORK_ERROR');
  }

  return new TxError(message || 'Transaction failed', TxErrorType.Unknown, err, 'TX_RESULT_FAILED');
}

// ─────────────────────── NFT Contract ───────────────────────

/**
 * Mint an NFT directly on the NFT contract.
 *
 * `creatorAddress` is the address the token is attributed to and the address
 * the Royalty contract will treat as the creator; it must sign, and it is not
 * required to be `toAddress`. `toAddress` receives the token and must sign as
 * well, which is what lets one account mint for another.
 *
 * For the platform's own flow prefer `mintWithRoyalty`, which also links the
 * token to its collection and records royalty terms atomically.
 */
export async function mintNft(
  sourceAddress: string,
  creatorAddress: string,
  toAddress: string,
  collectionId: number,
  metadataUri: string,
) {
  const creatorScVal = new Address(creatorAddress).toScVal();
  const toScVal = new Address(toAddress).toScVal();
  const collectionScVal = xdr.ScVal.scvU64(new xdr.Uint64(collectionId));
  const metadataScVal = xdr.ScVal.scvString(metadataUri);

  const { tx } = await buildContractTransaction(sourceAddress, CONTRACT_IDS.nft, 'mint', [
    creatorScVal,
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
 * Build a pay_royalty() transaction for the Royalty contract.
 *
 * Settles a sale: the payer signs, and the contract transfers each configured
 * recipient its share of the royalty in the same invocation, so there is no
 * partial payout to reconcile.
 *
 * `asset` is the Stellar Asset Contract address of the settlement currency. The
 * native XLM SAC and an issued asset's SAC (USDC, for instance) are the same
 * interface, so the caller picks the currency by address and nothing else
 * changes. `salePrice` is in the asset's smallest unit -- stroops for XLM -- and
 * must be positive. It is a `bigint` because an i128 has no exact representation
 * as a JS number once the price is large, and the SDK encodes it digit by digit
 * rather than through float arithmetic.
 */
export async function payRoyalty(
  sourceAddress: string,
  tokenId: number,
  isCollection: boolean,
  asset: string,
  salePrice: bigint,
) {
  const args = [
    xdr.ScVal.scvU64(new xdr.Uint64(tokenId)),
    xdr.ScVal.scvBool(isCollection),
    new Address(asset).toScVal(),
    new Address(sourceAddress).toScVal(),
    nativeToScVal(salePrice, { type: 'i128' }),
  ];

  const { tx } = await buildContractTransaction(
    sourceAddress,
    CONTRACT_IDS.royalty,
    'pay_royalty',
    args,
  );

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
      undefined,
      'WALLET_NOT_INSTALLED',
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
    // The result XDR carries the diagnosis; classify it rather than reporting it
    // as an opaque string. `errorResultXdr` is base64, so the protocol code is
    // looked up from the diagnostic text the RPC includes alongside it when it
    // is present, and the envelope is quoted when it is not.
    const detail = (submitResult as { errorResultXdr?: string }).errorResultXdr;
    throw new TxError(
      `Submission failed: ${detail || 'no result from the network'}`,
      TxErrorType.ContractError,
      undefined,
      'TX_RESULT_FAILED',
    );
  }

  const txHash = submitResult.hash;
  if (!txHash) {
    throw new TxError(
      'The network accepted the submission but returned no hash to track.',
      TxErrorType.Unknown,
      undefined,
      'TX_INCLUSION_MISSING',
    );
  }

  onStatus?.('confirming');

  const result = await waitForTransaction(txHash);

  return { txHash, result };
}
