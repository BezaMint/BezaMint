/**
 * Shared constants for the BezaMint application.
 * Centralizes magic strings to eliminate hardcoded values.
 */

/** Stellar network passphrase for the configured network */
export const STELLAR_NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_PASSPHRASE || 'Test SDF Network ; September 2015';

/** Soroban RPC endpoint */
export const STELLAR_RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';

/** Horizon server URL */
export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';

/** Stellar Explorer base URL */
export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://stellar.expert/explorer/testnet';

/** Minimum XLM reserve required on Stellar */
export const MIN_XLM_RESERVE = 1;

/** Default transaction timeout in seconds */
export const DEFAULT_TX_TIMEOUT = 30;

/** Default polling interval for transaction confirmation (ms) */
export const DEFAULT_POLL_INTERVAL_MS = 3000;

/** Maximum retries for transaction confirmation */
export const MAX_TX_RETRIES = 20;
