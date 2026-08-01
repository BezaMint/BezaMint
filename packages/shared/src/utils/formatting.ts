/**
 * Format an address for display: GABC...DEFG
 */
export function formatAddress(address: string, startLen = 4, endLen = 4): string {
  if (!address || address.length < startLen + endLen) return address;
  return `${address.slice(0, startLen)}...${address.slice(-endLen)}`;
}

/**
 * Format a Unix timestamp to a relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp * 1000;
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 60) return 'just now';
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  if (diffSecs < 2592000) return `${Math.floor(diffSecs / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Format basis points to percentage string
 */
export function formatBasisPoints(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/**
 * Format an XLM amount
 */
export function formatXlm(amount: number): string {
  return `${amount.toFixed(7)} XLM`;
}

/**
 * Generate explorer URL for a transaction
 */
export function getExplorerTxUrl(txHash: string): string {
  return `${process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://stellar.expert/explorer/testnet'}/tx/${txHash}`;
}

/**
 * Generate explorer URL for an account
 */
export function getExplorerAccountUrl(address: string): string {
  return `${process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://stellar.expert/explorer/testnet'}/account/${address}`;
}
