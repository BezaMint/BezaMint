import { xdr, Address, scValToNative } from '@stellar/stellar-sdk';
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

// ─────────────────────── Collection Contract ───────────────────────

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

// ─────────────────────── Creator Contract ───────────────────────

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
