import { NextResponse } from 'next/server';
import { getRpcClient } from '@/services/stellar';
import { CONTRACT_IDS } from '@/services';
import { isIpfsAvailable } from '@/lib/pinata';
import { collectStartupIssues } from '@/lib/startup';
import { withTimeout, fetchWithTimeout } from '@/lib/server/http';

// Module-level constant so uptime is measured from first request handling.
const SERVER_START_TIME = Date.now();

const PROBE_TIMEOUT_MS = 5_000;

/** Probe the Soroban RPC: latest ledger + latency. */
async function probeRpc(): Promise<{
  ok: boolean;
  latencyMs: number;
  latestLedger?: number;
  error?: string;
}> {
  const started = Date.now();
  try {
    const ledger = await withTimeout(getRpcClient().getLatestLedger(), PROBE_TIMEOUT_MS);
    return { ok: true, latencyMs: Date.now() - started, latestLedger: ledger.sequence };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'RPC unreachable',
    };
  }
}

/** Probe the Pinata gateway: HEAD the gateway root with a short timeout. */
async function probeIpfs(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(
      `${gateway}/ipfs/QmW2WQi7j6c7UgJTarActp7tDNikE4B2qXtFCfLPdsgaTQ`,
      {
        method: 'HEAD',
        timeoutMs: PROBE_TIMEOUT_MS,
        timeoutMessage: 'gateway probe timed out',
      },
    );
    return {
      ok: response.ok || response.status === 404, // 404 still proves reachability
      latencyMs: Date.now() - started,
      error: response.ok ? undefined : `gateway responded ${response.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'gateway unreachable',
    };
  }
}

export async function GET() {
  const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);

  const startupIssues = collectStartupIssues();

  const [rpc, ipfs] = await Promise.all([probeRpc(), probeIpfs()]);

  const contracts = {
    nft: !!CONTRACT_IDS.nft,
    collection: !!CONTRACT_IDS.collection,
    royalty: !!CONTRACT_IDS.royalty,
    creator: !!CONTRACT_IDS.creator,
    factory: !!CONTRACT_IDS.factory,
  };
  const allContracts = Object.values(contracts).every(Boolean);
  const healthy = rpc.ok && (!isIpfsAvailable() || ipfs.ok);

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds + 's',
      environment: process.env.NODE_ENV || 'development',
      network: process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet',
      checks: {
        rpc: rpc,
        ipfs: { configured: isIpfsAvailable(), ...ipfs },
        contractsConfigured: allContracts,
        contracts,
        startup: startupIssues,
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
