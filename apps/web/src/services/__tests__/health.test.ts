import { describe, expect, it, vi, beforeEach } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';

/**
 * Tests for the network and contract probes behind the Settings page.
 *
 * This module had no coverage at all, and it is the one place where a failure
 * is *supposed* to be reported rather than thrown: every branch returns a
 * status object the UI renders. Untested branches in a module like that do not
 * crash anything, they quietly report the wrong thing -- "Connected" for a
 * contract that never answered, or a bare "Probe failed" where the RPC's actual
 * message was available.
 */

const mockedRpc = {
  getLatestLedger: vi.fn(),
  simulateTransaction: vi.fn(),
};

vi.mock('@/services/stellar', () => ({
  getRpcClient: () => mockedRpc,
  CURRENT_NETWORK: { passphrase: 'Test SDF Network ; September 2015', rpcUrl: 'http://x' },
}));

const { checkNetworkHealth, probeContract } = await import('@/services/health');

/**
 * A well-formed contract id. `new Contract(...)` validates the strkey and throws
 * "Invalid contract ID" on anything else, so a placeholder string would make the
 * probe fail before it ever reached the RPC and the assertions below would be
 * testing the SDK's validator instead of this module.
 */
const CONTRACT_ID = 'CCW5JLGZQM25TDC2RKUB7OBYDNXDZSWIUP3AAXPT4F36S3D66RLUL33S';

// `performance.now()` exists in both the node and jsdom environments vitest
// runs, and its value depends on how long the mocked call took, so latency is
// asserted by type rather than by value. (`expect.any` only applies through
// `toEqual`, not `toBe`.)
const isNumber = (value: unknown) => typeof value === 'number';

describe('checkNetworkHealth', () => {
  beforeEach(() => {
    mockedRpc.getLatestLedger.mockReset();
    mockedRpc.simulateTransaction.mockReset();
  });

  it('reports the latest ledger when the RPC answers', async () => {
    mockedRpc.getLatestLedger.mockResolvedValue({ sequence: 4624540 });

    const health = await checkNetworkHealth();

    expect(health.ok).toBe(true);
    expect(health.latestLedger).toBe(4624540);
    expect(isNumber(health.latencyMs)).toBe(true);
    expect(health.error).toBeUndefined();
  });

  it('reports the RPC error message rather than a generic failure', async () => {
    mockedRpc.getLatestLedger.mockRejectedValue(new Error('rpc is down'));

    const health = await checkNetworkHealth();

    expect(health.ok).toBe(false);
    expect(health.error).toBe('rpc is down');
    expect(health.latestLedger).toBeUndefined();
  });

  it('still reports a failure when the rejection is not an Error instance', async () => {
    // A thrown string or a cross-realm error object would otherwise lose its
    // message; the fallback at least says which half of the stack failed.
    mockedRpc.getLatestLedger.mockRejectedValue('not an error instance');

    const health = await checkNetworkHealth();

    expect(health.ok).toBe(false);
    expect(health.error).toBe('RPC unreachable');
  });
});

describe('probeContract', () => {
  beforeEach(() => {
    mockedRpc.getLatestLedger.mockReset();
    mockedRpc.simulateTransaction.mockReset();
  });

  it('rejects a contract key with no probe defined', async () => {
    const result = await probeContract(CONTRACT_ID, 'nonexistent' as never);

    expect(result.status).toBe('error');
    expect(result.error).toContain('nonexistent');
    // No RPC round trip should be attempted for a probe that cannot be built.
    expect(mockedRpc.simulateTransaction).not.toHaveBeenCalled();
  });

  it('builds a single read-only invocation to probe with', async () => {
    mockedRpc.simulateTransaction.mockResolvedValue({
      result: { retval: xdr.ScVal.scvVoid() },
    });

    await probeContract(CONTRACT_ID, 'royalty');

    expect(mockedRpc.simulateTransaction).toHaveBeenCalledTimes(1);
    const built = mockedRpc.simulateTransaction.mock.calls[0]![0];
    // One invoke operation, and simulated rather than submitted: the probe's
    // source account does not exist, so the RPC must not require it to be
    // funded and nothing may be sent to the network.
    expect(built.operations).toHaveLength(1);
    expect(built.operations[0]!.type).toBe('invokeHostFunction');
  });

  it('reports a simulation error as an error result', async () => {
    mockedRpc.simulateTransaction.mockResolvedValue({ error: 'HostError: missing value' });

    const result = await probeContract(CONTRACT_ID, 'nft');

    expect(result.status).toBe('error');
    expect(result.error).toBe('HostError: missing value');
  });

  it('treats a result with no return value as an error', async () => {
    mockedRpc.simulateTransaction.mockResolvedValue({});

    const result = await probeContract(CONTRACT_ID, 'collection');

    expect(result.status).toBe('error');
    expect(result.error).toBe('Empty simulation result');
  });

  it('decodes the returned value on success', async () => {
    mockedRpc.simulateTransaction.mockResolvedValue({
      result: { retval: xdr.ScVal.scvU32(500) },
    });

    const result = await probeContract(CONTRACT_ID, 'royalty');

    expect(result.status).toBe('ok');
    expect(result.value).toBe(500);
    expect(isNumber(result.latencyMs)).toBe(true);
  });

  it('treats a void return as a successful probe with no value', async () => {
    mockedRpc.simulateTransaction.mockResolvedValue({
      result: { retval: xdr.ScVal.scvVoid() },
    });

    const result = await probeContract(CONTRACT_ID, 'factory');

    expect(result.status).toBe('ok');
    expect(result.value).toBeNull();
  });

  it('reports a thrown RPC failure as an error with its message', async () => {
    mockedRpc.simulateTransaction.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await probeContract(CONTRACT_ID, 'creator');

    expect(result.status).toBe('error');
    expect(result.error).toBe('connect ECONNREFUSED');
  });

  it('reports a non-Error rejection with a usable fallback', async () => {
    mockedRpc.simulateTransaction.mockRejectedValue({ code: -32603 });

    const result = await probeContract(CONTRACT_ID, 'creator');

    expect(result.status).toBe('error');
    expect(result.error).toBe('Probe failed');
  });

  it('never returns a contract id it did not probe', async () => {
    mockedRpc.simulateTransaction.mockResolvedValue({
      result: { retval: xdr.ScVal.scvVoid() },
    });

    const result = await probeContract(CONTRACT_ID, 'nft');

    expect(result).not.toHaveProperty('contractId');
    expect(Object.keys(result).sort()).toEqual(['latencyMs', 'status', 'value']);
  });
});
