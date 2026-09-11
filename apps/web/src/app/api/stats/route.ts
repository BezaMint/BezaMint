/**
 * GET /api/stats
 *
 * Platform-level statistics: NFT supply, collection count, creator count,
 * and recent mint volume. Backed by the event indexer plus contract
 * counters, so the landing page and dashboards can show real numbers
 * without per-request RPC fan-out.
 */
import { NextResponse } from 'next/server';
import {
  refreshIndexer,
  indexerStats,
  getIndexerState,
  getIndexedEvents,
} from '@/lib/server/indexer';
import { simulateRead } from '@/lib/server/contractReader';
import { normalizeError } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import { withTimeout } from '@/lib/server/http';
import { CONTRACT_IDS } from '@/services';
import { TtlCache, SHORT_CACHE_CONTROL } from '@/lib/server/cache';

export const dynamic = 'force-dynamic';

const statsCache = new TtlCache<StatsPayload>(30_000);

interface StatsPayload {
  nftSupply: number | null;
  collections: number | null;
  creators: number | null;
  recentMints: { count: number; windowLedgers: number };
  indexer: { eventCount: number; lastRefreshAt: number };
  updatedAt: string;
}

async function readCounter(contractId: string | undefined, method: string): Promise<number | null> {
  if (!contractId) return null;
  try {
    const value = await withTimeout(
      simulateRead<number | bigint>(contractId, method),
      5_000,
      `${method} read timed out`,
    );
    return Number(value ?? 0);
  } catch (err) {
    logger.warn(`${method} read failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function loadStats(): Promise<StatsPayload> {
  await refreshIndexer();

  const [nftSupply, collections, creators] = await Promise.all([
    readCounter(CONTRACT_IDS.nft, 'total_supply'),
    readCounter(CONTRACT_IDS.collection, 'total_collections'),
    readCounter(CONTRACT_IDS.creator, 'total_creators'),
  ]);

  const collectionCount = collections;

  const events = indexerStats();
  // The RPC scan window is bounded; report the window size alongside so
  // consumers can tell "no mints recently" from "indexer window too small".
  const stored = getIndexedEvents();
  const minLedger = stored.length > 0 ? Math.min(...stored.map((e) => e.ledger)) : 0;
  const maxLedger = stored.length > 0 ? Math.max(...stored.map((e) => e.ledger)) : 0;
  const recentMints = {
    count: events.nft_minted,
    windowLedgers: Math.max(0, maxLedger - minLedger),
  };

  return {
    nftSupply,
    collections: collectionCount,
    creators,
    recentMints,
    indexer: getIndexerState(),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'GET', '/api/stats');
  try {
    const stats = await statsCache.getOrSet('platform-stats', loadStats);
    timer.done(200, {});
    return NextResponse.json(
      { data: stats },
      { headers: { 'Cache-Control': SHORT_CACHE_CONTROL } },
    );
  } catch (err) {
    const apiError = normalizeError(err);
    logger.warn('GET /api/stats failed', { requestId, error: apiError.message });
    timer.done(apiError.status, { error: apiError.code });
    return NextResponse.json(apiError.toJson(), { status: apiError.status });
  }
}
