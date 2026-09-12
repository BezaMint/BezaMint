import { NextResponse } from 'next/server';
import { getRpcClient } from '@/services/stellar';
import { CONTRACT_IDS } from '@/services';
import { isIpfsAvailable } from '@/lib/pinata';
import { collectStartupIssues } from '@/lib/startup';
import { withTimeout, fetchWithTimeout } from '@/lib/server/http';
import { getIpfsGateway } from '@/lib/ipfsGateway';
import { refreshIndexer, getIndexerHealth } from '@/lib/server/indexer';

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
  const gateway = getIpfsGateway();
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

/** Best-effort build version: git SHA + app version from package.json. */
function buildInfo(): { version: string; commitSha: string | null } {
  const pkg = require('../../../../package.json') as { version?: string };
  const commitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.COMMIT_SHA ||
    null;
  return { version: pkg.version ?? '0.0.0', commitSha };
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

  // Best-effort indexer poll, then report its progress. The indexer is the only
  // path from the RPC event log to the list endpoints, and it fails quietly:
  // when polling stops, /api/nfts and /api/search keep answering 200 with stale
  // data. That is reported here as `checks.indexer` so a monitor can alert on
  // `stalled` without the readiness probe taking a working instance out of
  // rotation over a degraded feed. Only meaningful when contracts are wired.
  let indexer: (ReturnType<typeof getIndexerHealth> & { ok: boolean }) | null = null;
  if (allContracts) {
    try {
      await refreshIndexer();
    } catch {
      // Recorded as lastError inside the indexer and surfaced below.
    }
    const health = getIndexerHealth();
    indexer = { ...health, ok: !health.stalled };
  }
  // Readiness means "this deployment can do its job". A build with every
  // contract ID unset cannot mint, browse or verify anything, so reporting it as
  // healthy (200) would let a misconfigured deploy pass a readiness gate and
  // serve a broken app. RPC reachability and the IPFS gateway matter for the
  // same reason; the contract configuration was previously computed and then
  // not consulted, which is the case that matters most because it is the one a
  // bad deploy actually hits.
  const healthy = rpc.ok && allContracts && (!isIpfsAvailable() || ipfs.ok);

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds + 's',
      environment: process.env.NODE_ENV || 'development',
      network: process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet',
      version: buildInfo().version,
      commitSha: buildInfo().commitSha,
      checks: {
        rpc: rpc,
        ipfs: { configured: isIpfsAvailable(), ...ipfs },
        contractsConfigured: allContracts,
        contracts,
        indexer,
        startup: startupIssues,
      },
    },
    { status: healthy ? 200 : 503 },
  );
}
