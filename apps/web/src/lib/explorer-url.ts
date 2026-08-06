import { EXPLORER_URL } from '@/lib/constants';

export type ExplorerNetwork = 'testnet' | 'mainnet';
export type ExplorerTarget = 'tx' | 'contract' | 'account';

const EXPLORER_BASE_URLS: Record<ExplorerNetwork, string> = {
  testnet: 'https://stellar.expert/explorer/testnet',
  mainnet: 'https://stellar.expert/explorer/public',
};

/**
 * Builds a Stellar Expert URL for a transaction, contract, or account.
 * Pass an explicit base URL when the deployment uses NEXT_PUBLIC_EXPLORER_URL.
 */
export function buildExplorerUrl(
  network: ExplorerNetwork,
  target: ExplorerTarget,
  id: string,
  baseUrl: string = EXPLORER_BASE_URLS[network],
): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/${target}/${encodeURIComponent(id)}`;
}

export function explorerBaseUrl(network: ExplorerNetwork, override?: string): string {
  return (override ?? EXPLORER_URL).replace(/\/+$/, '');
}

export function explorerUrl(
  network: ExplorerNetwork,
  target: ExplorerTarget,
  id: string,
  override?: string,
): string {
  return buildExplorerUrl(network, target, id, explorerBaseUrl(network, override));
}
