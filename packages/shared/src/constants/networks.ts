/**
 * Stellar network configurations
 */
export const STELLAR_NETWORKS = {
  testnet: {
    rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
    networkUrl: 'https://horizon-testnet.stellar.org',
  },
  futurenet: {
    rpcUrl: 'https://rpc-futurenet.stellar.org:443',
    passphrase: 'Test SDF Future Network ; October 2022',
    networkUrl: 'https://horizon-futurenet.stellar.org',
  },
  mainnet: {
    rpcUrl: 'https://soroban-mainnet.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
    networkUrl: 'https://horizon.stellar.org',
  },
} as const;

export type StellarNetwork = keyof typeof STELLAR_NETWORKS;

/**
 * Default network for the application
 */
export const DEFAULT_NETWORK: StellarNetwork =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK as StellarNetwork) || 'testnet';

/**
 * Current network configuration
 */
export const CURRENT_NETWORK = STELLAR_NETWORKS[DEFAULT_NETWORK];

/**
 * Stellar explorer URLs
 */
export const EXPLORER_URLS = {
  testnet: 'https://stellar.expert/explorer/testnet',
  futurenet: 'https://stellar.expert/explorer/futurenet',
  mainnet: 'https://stellar.expert/explorer/public',
} as const;

/**
 * Minimum XLM balance required for account existence
 */
export const MIN_XLM_RESERVE = 1;


export const STELLAR_PASSPHRASES = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
} as const;
