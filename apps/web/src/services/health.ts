/**
 * Network + contract health checks.
 *
 * Real, read-only probes against the configured Soroban RPC so the Settings
 * page can show actual status instead of a hardcoded "Connected" pill.
 */
import {
  Account,
  Keypair,
  TransactionBuilder,
  Contract,
  xdr,
  scValToNative,
  BASE_FEE,
  rpc as SorobanRpc,
} from '@stellar/stellar-sdk';
import { getRpcClient, CURRENT_NETWORK } from '@/services/stellar';

export interface ContractProbe {
  method: string;
  args?: xdr.ScVal[];
}

/**
 * Zero/cheap-argument read-only methods per contract, used to verify a
 * deployed contract actually responds on the RPC.
 */
const PROBES: Record<string, ContractProbe> = {
  nft: { method: 'total_supply' },
  collection: { method: 'total_collections' },
  creator: { method: 'total_creators' },
  royalty: { method: 'validate_basis_points', args: [xdr.ScVal.scvU32(500)] },
  factory: { method: 'get_nft_contract' },
};

export type ContractHealthStatus = 'ok' | 'error';

export interface ContractHealthResult {
  status: ContractHealthStatus;
  latencyMs: number;
  value?: unknown;
  error?: string;
}

export interface NetworkHealthResult {
  ok: boolean;
  latestLedger?: number;
  latencyMs: number;
  error?: string;
}

/** Probe the RPC's latest ledger to verify connectivity + measure latency. */
export async function checkNetworkHealth(): Promise<NetworkHealthResult> {
  const started = performance.now();
  try {
    const ledger = await getRpcClient().getLatestLedger();
    return {
      ok: true,
      latestLedger: ledger.sequence,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : 'RPC unreachable',
    };
  }
}

/**
 * Verify a deployed contract responds by simulating a read-only call.
 * Uses a source-less simulation so it works without a wallet.
 */
export async function probeContract(
  contractId: string,
  contractKey: keyof typeof PROBES,
): Promise<ContractHealthResult> {
  const probe = PROBES[contractKey];
  if (!probe) {
    return { status: 'error', latencyMs: 0, error: `No probe defined for ${contractKey}` };
  }
  const started = performance.now();
  try {
    const contract = new Contract(contractId);
    // Source-less simulation: a throwaway keypair account is enough for a
    // read-only probe (the RPC does not require the account to be funded).
    const dummyAccount = new Account(Keypair.random().publicKey(), '0');
    const tx = new TransactionBuilder(dummyAccount, {
      fee: BASE_FEE,
      networkPassphrase: CURRENT_NETWORK.passphrase,
    })
      .addOperation(contract.call(probe.method, ...(probe.args ?? [])))
      .setTimeout(30)
      .build();
    const result = await getRpcClient().simulateTransaction(tx);
    const latencyMs = Math.round(performance.now() - started);
    if (SorobanRpc.Api.isSimulationError(result)) {
      return { status: 'error', latencyMs, error: result.error };
    }
    if (!result.result) {
      return { status: 'error', latencyMs, error: 'Empty simulation result' };
    }
    let value: unknown;
    try {
      value = scValToNative(result.result.retval);
    } catch {
      value = undefined;
    }
    return { status: 'ok', latencyMs, value };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : 'Probe failed',
    };
  }
}
