import {
  Networks,
  TransactionBuilder,
  Contract,
  xdr,
  BASE_FEE,
  rpc as SorobanRpc,
  Asset,
  Operation,
  Horizon,
  Memo,
} from '@stellar/stellar-sdk';

// ─────────────────────── Network Configuration ───────────────────────

export const STELLAR_NETWORK_CONFIG = {
  testnet: {
    rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
    passphrase: Networks.TESTNET,
    networkUrl: 'https://horizon-testnet.stellar.org',
  },
} as const;

export const CURRENT_NETWORK = STELLAR_NETWORK_CONFIG.testnet;

// ─────────────────────── RPC / Horizon Clients ───────────────────────

const rpcClient = new SorobanRpc.Server(CURRENT_NETWORK.rpcUrl, {
  allowHttp: CURRENT_NETWORK.rpcUrl.startsWith('http://'),
});

const horizonServer = new Horizon.Server(CURRENT_NETWORK.networkUrl);

export { getOrCreateRpcClient };

export function getRpcClient(): SorobanRpc.Server {
  return rpcClient;
}

export function getHorizonServer(): Horizon.Server {
  return horizonServer;
}

// ─────────────────────── Contract Helpers ───────────────────────

/**
 * Build a transaction for invoking a Soroban contract function.
 * Returns the assembled transaction ready for signing + submission.
 */
export async function buildContractTransaction(
  sourcePublicKey: string,
  contractId: string,
  methodName: string,
  args: xdr.ScVal[],
): Promise<{ tx: string; hash: string }> {
  const sourceAccount = await rpcClient.getAccount(sourcePublicKey);

  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: CURRENT_NETWORK.passphrase,
  })
    .addOperation(contract.call(methodName, ...args))
    .setTimeout(30)
    .build();

  return {
    tx: tx.toXDR(),
    hash: tx.hash().toString('hex'),
  };
}

/**
 * Simulate a contract invocation without submitting.
 */
export async function simulateTransaction(
  sourcePublicKey: string,
  contractId: string,
  methodName: string,
  args: xdr.ScVal[],
) {
  const sourceAccount = await rpcClient.getAccount(sourcePublicKey);

  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: CURRENT_NETWORK.passphrase,
  })
    .addOperation(contract.call(methodName, ...args))
    .setTimeout(30)
    .build();

  return rpcClient.simulateTransaction(
    tx,
  ) as Promise<SorobanRpc.Api.SimulateTransactionSuccessResponse>;
}

/**
 * Submit a signed transaction envelope to the network.
 */
export async function submitSignedTransaction(
  signedXdr: string,
): Promise<SorobanRpc.Api.SendTransactionResponse> {
  const tx = TransactionBuilder.fromXDR(signedXdr, CURRENT_NETWORK.passphrase) as any;

  return rpcClient.sendTransaction(tx);
}

/**
 * Poll for a transaction result until it is finalized.
 */
export async function waitForTransaction(
  txHash: string,
  maxRetries = 20,
  intervalMs = 3000,
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  for (let i = 0; i < maxRetries; i++) {
    const response = await rpcClient.getTransaction(txHash);

    if (response.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return response;
    }
    if (response.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed: ${(response as any).resultXdr || 'Unknown error'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Transaction ${txHash} not finalized after ${maxRetries} attempts`);
}

// ─────────────────────── Retry Helper ───────────────────────

/**
 * Retry a function with exponential backoff.
 * Useful for transient RPC failures.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000 } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ─────────────────────── Explorer Helpers ───────────────────────

export function getExplorerTxUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

export function getExplorerAccountUrl(address: string): string {
  return `https://stellar.expert/explorer/testnet/account/${address}`;
}

// ─────────────────────── Balance Helpers ───────────────────────

const MIN_XLM_RESERVE = 1;

/**
 * Fetch the XLM balance for a Stellar account via Horizon.
 */
export async function fetchXlmBalance(address: string): Promise<string> {
  const account = await horizonServer.loadAccount(address);
  for (const balance of account.balances) {
    if (balance.asset_type === 'native') {
      return balance.balance;
    }
  }
  return '0';
}

/**
 * Check if the account has sufficient XLM balance for a transaction.
 * Returns { sufficient, balance, minimumRequired }.
 */
export async function checkBalance(
  address: string,
  estimatedFeeXlm = 0.001,
): Promise<{ sufficient: boolean; balance: string; minimumRequired: number }> {
  try {
    const balance = await fetchXlmBalance(address);
    const numeric = parseFloat(balance);
    const minimum = MIN_XLM_RESERVE + estimatedFeeXlm;
    return { sufficient: numeric >= minimum, balance, minimumRequired: minimum };
  } catch {
    return { sufficient: false, balance: '0', minimumRequired: MIN_XLM_RESERVE };
  }
}

// ─────────────────────── XLM Payment / Transfer ───────────────────────

/**
 * Build a simple XLM payment transaction.
 * Returns the XDR envelope ready for signing.
 */
export async function buildXlmPayment(
  sourcePublicKey: string,
  destinationAddress: string,
  amount: string,
  memo?: string,
): Promise<{ tx: string; hash: string }> {
  const sourceAccount = await rpcClient.getAccount(sourcePublicKey);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: CURRENT_NETWORK.passphrase,
  })
    .addOperation(
      Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(),
        amount,
      }),
    )
    .setTimeout(30);

  if (memo) {
    tx.addMemo(Memo.text(memo));
  }

  const built = tx.build();
  return {
    tx: built.toXDR(),
    hash: built.hash().toString('hex'),
  };
}

// ─────────────────────── AbortController Helper ───────────────────────

/**
 * Build a contract transaction with abort signal support.
 */
export async function buildContractTransactionWithSignal(
  sourcePublicKey: string,
  contractId: string,
  methodName: string,
  args: xdr.ScVal[],
  signal?: AbortSignal,
): Promise<{ tx: string; hash: string }> {
  if (signal?.aborted) throw new Error('Transaction aborted');
  return buildContractTransaction(sourcePublicKey, contractId, methodName, args);
}

// ─────────────────────── Address Helpers ───────────────────────

export function formatAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}
