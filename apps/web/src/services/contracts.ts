import { xdr, Address, scValToNative } from '@stellar/stellar-sdk';
import {
  buildContractTransaction,
  simulateTransaction,
  submitSignedTransaction,
  waitForTransaction,
} from './stellar';

// ─────────────────────── Contract IDs ───────────────────────

export const CONTRACT_IDS = {
  nft: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || '',
  collection: process.env.NEXT_PUBLIC_COLLECTION_CONTRACT_ID || '',
  royalty: process.env.NEXT_PUBLIC_ROYALTY_CONTRACT_ID || '',
  creator: process.env.NEXT_PUBLIC_CREATOR_CONTRACT_ID || '',
};

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

import { isFreighterInstalled } from '@/lib/freighter';

// ─────────────────────── Transaction Flow ───────────────────────

export async function signAndSubmit(
  txXdr: string,
  onStatus?: (status: string) => void,
): Promise<{ txHash: string; result: any }> {
  if (!isFreighterInstalled()) {
    throw new Error(
      'Freighter wallet is not installed. Please install the Freighter browser extension.',
    );
  }

  const freighter = (window as any).stellar;

  onStatus?.('signing');
  let signedXdr: string;
  try {
    signedXdr = await freighter.signTransaction(txXdr, {
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
  } catch (err: any) {
    // Handle user-cancelled signing gracefully
    const message = err?.message || '';
    if (
      message.includes('cancelled') ||
      message.includes('rejected') ||
      message.includes('denied') ||
      message.includes('user')
    ) {
      throw new Error('Transaction was cancelled by user.');
    }
    throw new Error(`Signing failed: ${message || 'Unknown error'}`);
  }

  onStatus?.('submitting');
  const submitResult = await submitSignedTransaction(signedXdr);

  if (submitResult.status === 'ERROR') {
    throw new Error(`Submission failed: ${(submitResult as any).errorResultXdr}`);
  }

  const txHash = submitResult.hash;
  onStatus?.('confirming');

  const result = await waitForTransaction(txHash);

  return { txHash, result };
}
