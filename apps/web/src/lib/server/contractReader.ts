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

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = -MAX_SAFE;

/**
 * Recursively convert a contract value into something JSON can hold.
 *
 * `scValToNative` returns a `bigint` for the 64- and 128-bit integer types, so
 * that no value is silently rounded on the way in. `JSON.stringify` cannot
 * serialize a `bigint` at all -- it throws "Do not know how to serialize a
 * BigInt" -- so every route returning a contract struct with a u64 in it (a
 * timestamp, a count, an id) answered `500 INTERNAL` the first time it ran
 * against a real deployment that had data to return.
 *
 * That is why this was invisible for so long: with an empty indexer the routes
 * took an early branch and enriched nothing, so no contract value ever reached
 * the serializer. The route tests mock the reader and hand back plain numbers.
 * The bug needed a seeded chain to appear, and it appeared on all three list
 * endpoints at once.
 *
 * A `bigint` that fits in the safe integer range becomes a number, which is
 * what every caller already assumes for counters, ids and timestamps. A larger
 * one becomes a decimal string instead of a rounded number: an i128 token
 * amount can exceed 2^53, and losing digits in a balance would be worse than a
 * type change.
 *
 * `Map` is converted to a plain object and `Set`/typed arrays to arrays, because
 * neither survives `JSON.stringify` either and Soroban maps (`recipients` in a
 * royalty config) decode to a `Map`.
 */
export function toJsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value <= MAX_SAFE && value >= MIN_SAFE ? Number(value) : value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of value) {
      out[String(key)] = toJsonSafe(entry);
    }
    return out;
  }
  if (value instanceof Set) {
    return [...value].map(toJsonSafe);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = toJsonSafe(entry);
    }
    return out;
  }
  return value;
}

/**
 * Simulate a read-only contract call and return the native JS value of the
 * return value, normalized so it can be serialized as JSON. Throws a
 * normalized ApiError on failure.
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
    // Normalized here rather than at each response, so a new route cannot
    // reintroduce the crash by forgetting to convert.
    return toJsonSafe(scValToNative(result.result.retval)) as T;
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
