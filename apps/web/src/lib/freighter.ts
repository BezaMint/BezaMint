/**
 * Typed Freighter browser extension API wrapper.
 * Eliminates `(window).stellar` scattered throughout the codebase.
 */

interface FreighterApi {
  isConnected: () => boolean;
  getPublicKey: () => Promise<string>;
  getNetwork: () => Promise<string>;
  requestAccess: () => Promise<boolean>;
  signTransaction: (
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ) => Promise<string>;
  onAccountChanged?: (callback: (publicKey: string | null) => void) => () => void;
}

declare global {
  interface Window {
    stellar?: FreighterApi;
  }
}

/**
 * Get the Freighter API instance if available.
 */
export function getFreighterApi(): FreighterApi | null {
  if (typeof window === 'undefined') return null;
  return window.stellar ?? null;
}

/**
 * Check if the Freighter browser extension is installed and available.
 */
export function isFreighterInstalled(): boolean {
  return getFreighterApi()?.isConnected() ?? false;
}

/**
 * Get the connected public key from Freighter.
 */
export async function getFreighterPublicKey(): Promise<string> {
  const api = getFreighterApi();
  if (!api) throw new Error('Freighter wallet is not installed');
  return api.getPublicKey();
}

/**
 * Get the current network from Freighter.
 */
export async function getFreighterNetwork(): Promise<string> {
  const api = getFreighterApi();
  if (!api) throw new Error('Freighter wallet is not installed');
  return api.getNetwork();
}

/**
 * Request wallet access from Freighter.
 */
export async function requestFreighterAccess(): Promise<boolean> {
  const api = getFreighterApi();
  if (!api) throw new Error('Freighter wallet is not installed');
  return api.requestAccess();
}

/**
 * Sign a transaction XDR using Freighter.
 */
export async function signFreighterTransaction(
  xdr: string,
  opts?: { networkPassphrase?: string },
): Promise<string> {
  const api = getFreighterApi();
  if (!api) throw new Error('Freighter wallet is not installed');
  return api.signTransaction(xdr, {
    networkPassphrase: opts?.networkPassphrase || 'Test SDF Network ; September 2015',
  });
}

/**
 * Subscribe to Freighter account changes.
 * Returns an unsubscribe function.
 */
export function onFreighterAccountChanged(
  callback: (publicKey: string | null) => void,
): (() => void) | undefined {
  const api = getFreighterApi();
  return api?.onAccountChanged?.(callback);
}
