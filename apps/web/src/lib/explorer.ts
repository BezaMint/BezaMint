/**
 * Explorer URL helpers.
 *
 * The explorer base URL comes from `NEXT_PUBLIC_EXPLORER_URL` (read at call
 * time so tests can vary it) and falls back to the public testnet explorer,
 * so the app correctly links to testnet or mainnet explorers per deployment
 * instead of hardcoding `stellar.expert/explorer/testnet`.
 */

export type ExplorerEntity = 'tx' | 'account' | 'contract' | 'ledger';

const DEFAULT_EXPLORER_URL = 'https://stellar.expert/explorer/testnet';

export function getExplorerBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_EXPLORER_URL || DEFAULT_EXPLORER_URL).replace(/\/+$/, '');
}

export function buildExplorerUrl(entity: ExplorerEntity, id: string): string {
  return `${getExplorerBaseUrl()}/${entity}/${encodeURIComponent(id)}`;
}

export function getExplorerTxUrl(txHash: string): string {
  return buildExplorerUrl('tx', txHash);
}

export function getExplorerAccountUrl(address: string): string {
  return buildExplorerUrl('account', address);
}

export function getExplorerContractUrl(contractId: string): string {
  return buildExplorerUrl('contract', contractId);
}
