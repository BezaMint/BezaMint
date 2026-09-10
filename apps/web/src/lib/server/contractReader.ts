/**
 * Server-side read-only contract access.
 *
 * The public web app queries Soroban only from wallet-connected clients.
 * API routes need to read on-chain data without a user session, so this
 * module simulates read-only calls with a throwaway account — the RPC does
 * not require the source account to exist for pure reads.
 */
import {
  Account,
  Keypair,
  TransactionBuilder,
  Contract,
  Address,
  xdr,
  scValToNative,
  BASE_FEE,
  rpc as SorobanRpc,
} from '@stellar/stellar-sdk';
import { getRpcClient, CURRENT_NETWORK } from '@/services/stellar';
import { normalizeError, ApiError } from './errors';

function dummySource() {
  return new Account(Keypair.random().publicKey(), '0');
}

/**
 * Simulate a read-only contract call and return the native JS value of the
 * return value. Throws a normalized ApiError on failure.
 */
export async function simulateRead<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
  timeout = 30,
): Promise<T> {
  try {
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(dummySource(), {
      fee: BASE_FEE,
      networkPassphrase: CURRENT_NETWORK.passphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(timeout)
      .build();

    const result = await getRpcClient().simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new ApiError('CONTRACT_ERROR', result.error, 422);
    }
    if (!result.result?.retval) {
      throw new ApiError('CONTRACT_ERROR', `Empty result from ${method}`, 422);
    }
    return scValToNative(result.result.retval) as T;
  } catch (err) {
    throw normalizeError(err);
  }
}

/** u64 ScVal from a JS number (Soroban u64 values). */
export function u64ScVal(value: number): xdr.ScVal {
  return xdr.ScVal.scvU64(new xdr.Uint64(value));
}

/** Address ScVal from a stellar G... public key. */
export function addressScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}
