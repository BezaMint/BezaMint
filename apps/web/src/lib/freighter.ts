/**
 * Check if the Freighter browser extension is installed and available
 */
export function isFreighterInstalled(): boolean {
  return typeof window !== 'undefined' && !!(window as any).stellar?.isConnected;
}
