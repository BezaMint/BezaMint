/**
 * Typed Freighter browser extension API wrapper.
 * Eliminates `(window).stellar` scattered throughout the codebase.
 *
 * Every failure here is a `WalletError` carrying a catalogue code, so the UI can
 * tell "you do not have the extension" (fixable by installing it) from "you
 * declined" (fixable by retrying) from "your wallet is on another network"
 * (fixable only in the extension). All three used to arrive as a plain `Error`
 * with an English sentence, which meant the differences were recovered by
 * matching on that sentence somewhere else.
 */

import type { DeclaredErrorCode } from '@bezamint/shared';

/** A wallet failure with a stable code. */
export class WalletError extends Error {
  readonly code: DeclaredErrorCode;

  constructor(code: DeclaredErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

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

/** Raised when the extension is absent; the message names the remedy. */
function notInstalled(): WalletError {
  return new WalletError(
    'WALLET_NOT_INSTALLED',
    'Freighter wallet is not installed. Please install the Freighter browser extension.',
  );
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
  if (!api) throw notInstalled();
  try {
    return await api.getPublicKey();
  } catch (err) {
    throw new WalletError(
      'WALLET_NOT_CONNECTED',
      'Freighter has no account connected for this site.',
      { cause: err },
    );
  }
}

/**
 * Get the current network from Freighter.
 */
export async function getFreighterNetwork(): Promise<string> {
  const api = getFreighterApi();
  if (!api) throw notInstalled();
  if (typeof api.getNetwork !== 'function') {
    throw new WalletError(
      'WALLET_UNSUPPORTED_METHOD',
      'This version of Freighter cannot report its network.',
    );
  }
  try {
    return await api.getNetwork();
  } catch (err) {
    throw new WalletError('WALLET_BRIDGE_ERROR', 'Freighter did not report a network.', {
      cause: err,
    });
  }
}

/**
 * Request wallet access from Freighter.
 */
export async function requestFreighterAccess(): Promise<boolean> {
  const api = getFreighterApi();
  if (!api) throw notInstalled();
  try {
    return await api.requestAccess();
  } catch (err) {
    throw new WalletError(
      'WALLET_ACCESS_DENIED',
      'Freighter refused this site access to your account.',
      { cause: err },
    );
  }
}

/**
 * Sign a transaction XDR using Freighter.
 *
 * A failure here is the wallet's decision, not a bug: the extension reports a
 * refusal, a timeout, and a malformed request with the same `Error` shape, so
 * the message is classified before it is re-thrown. Pass-through rather than
 * guess when the text is unrecognised — a wrong specific code is worse than a
 * generic one, because it sends the user to the wrong remedy.
 */
export async function signFreighterTransaction(
  xdr: string,
  opts?: { networkPassphrase?: string },
): Promise<string> {
  const api = getFreighterApi();
  if (!api) throw notInstalled();

  try {
    return await api.signTransaction(xdr, {
      networkPassphrase: opts?.networkPassphrase || 'Test SDF Network ; September 2015',
    });
  } catch (err) {
    throw new WalletError(
      classifySigningFailure(err),
      'Freighter could not sign the transaction.',
      {
        cause: err,
      },
    );
  }
}

/** Map a Freighter refusal onto the catalogue. */
export function classifySigningFailure(err: unknown): DeclaredErrorCode {
  const text = String((err as { message?: string })?.message ?? err).toLowerCase();

  if (text.includes('declin') || text.includes('reject') || text.includes('denied')) {
    return 'WALLET_USER_REJECTED';
  }
  if (text.includes('timeout') || text.includes('timed out')) {
    return 'WALLET_REQUEST_TIMEOUT';
  }
  if (text.includes('network') || text.includes('passphrase')) {
    return 'WALLET_WRONG_NETWORK';
  }
  if (text.includes('popup') || text.includes('blocked')) {
    return 'WALLET_POPUP_BLOCKED';
  }
  if (text.includes('account') && text.includes('chang')) {
    return 'WALLET_ACCOUNT_CHANGED';
  }
  return 'TX_SIGNING_FAILED';
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
