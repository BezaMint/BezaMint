import {
  Networks,
  TransactionBuilder,
  Contract,
  xdr,
  BASE_FEE,
  rpc as SorobanRpc,
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

// ─────────────────────── RPC Client ───────────────────────

const rpcClient = new SorobanRpc.Server(CURRENT_NETWORK.rpcUrl, {
  allowHttp: CURRENT_NETWORK.rpcUrl.startsWith('http://'),
});

export function getRpcClient(): SorobanRpc.Server {
  return rpcClient;
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

  return rpcClient.simulateTransaction(tx) as Promise<SorobanRpc.Api.SimulateTransactionSuccessResponse>;
}

/**
 * Submit a signed transaction envelope to the network.
 */
export async function submitSignedTransaction(
  signedXdr: string,
): Promise<SorobanRpc.Api.SendTransactionResponse> {
  const tx = TransactionBuilder.fromXDR(
    signedXdr,
    CURRENT_NETWORK.passphrase,
  ) as any;

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
      throw new Error(
        `Transaction failed: ${(response as any).resultXdr || 'Unknown error'}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Transaction ${txHash} not finalized after ${maxRetries} attempts`);
}

// ─────────────────────── Explorer Helpers ───────────────────────

export function getExplorerTxUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

export function getExplorerAccountUrl(address: string): string {
  return `https://stellar.expert/explorer/testnet/account/${address}`;
}

// ─────────────────────── Address Helpers ───────────────────────

export function formatAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}
