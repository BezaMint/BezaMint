/**
 * GET /api/collections
 *
 * Lists collections, backed by the event indexer + live contract reads.
 * Supports `creator` filter plus `limit`/`offset` pagination, and enriches
 * each entry with on-chain collection data (metadata URI, NFT count, archive
 * state, timestamps).
 */
import { NextRequest, NextResponse } from 'next/server';
import { refreshIndexer, getIndexedEvents } from '@/lib/server/indexer';
import { parsePagination } from '@/lib/server/pagination';
import { simulateRead, u64ScVal } from '@/lib/server/contractReader';
import { apiError, normalizeError } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import { TtlCache, SHORT_CACHE_CONTROL } from '@/lib/server/cache';
import { optionalStellarAddress } from '@/lib/server/validation';
import { CONTRACT_IDS } from '@/services';

export const dynamic = 'force-dynamic';

// Collection reads are per-id RPC round trips; cache by id set + filter.
const collectionCache = new TtlCache<CollectionData[]>(15_000);

interface CollectionData {
  id: number;
  creator: string;
  metadata_uri: string;
  nft_count: number;
  created_at: number;
  updated_at: number;
  is_archived: boolean;
}

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'GET', '/api/collections');
  try {
    const searchParams = request.nextUrl.searchParams;
    const { limit, offset } = parsePagination(searchParams);
    const creator = optionalStellarAddress(searchParams, 'creator');

    if (!CONTRACT_IDS.collection) {
      throw apiError('CONTRACT_NOT_CONFIGURED', 'Collection contract not configured');
    }

    await refreshIndexer();

    const events = getIndexedEvents().filter((e) => e.type === 'collection_created');

    // Prefer the indexer's collection ids; fall back to creator filtering
    // via the contract when the indexer has no records yet.
    let collectionIds: number[];
    if (events.length > 0) {
      const ids = new Set(events.map((e) => e.id).filter((id): id is number => id !== undefined));
      collectionIds = [...ids].sort((a, b) => b - a);
    } else {
      const total = await simulateRead<number>(CONTRACT_IDS.collection, 'total_collections');
      collectionIds = Array.from({ length: Math.min(total, 200) }, (_, i) => total - i);
    }

    const cacheKey = `collections:${collectionIds.join(',')}`;
    const valid = await collectionCache.getOrSet(cacheKey, async () => {
      const enriched = await Promise.all(
        collectionIds.map(async (id) => {
          try {
            return simulateRead<CollectionData>(CONTRACT_IDS.collection, 'get_collection', [
              u64ScVal(id),
            ]);
          } catch {
            return null;
          }
        }),
      );
      return enriched.filter((c): c is NonNullable<typeof c> => c !== null);
    });

    const filtered = creator ? valid.filter((c) => c.creator === creator) : valid;
    const page = filtered.slice(offset, offset + limit);

    const collections = page.map((c) => ({
      id: c.id,
      creator: c.creator,
      metadataUri: c.metadata_uri,
      nftCount: c.nft_count,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      isArchived: c.is_archived,
    }));

    timer.done(200, { total: filtered.length, returned: collections.length });
    return NextResponse.json(
      {
        data: collections,
        pagination: { limit, offset, total: filtered.length },
      },
      { headers: { 'Cache-Control': SHORT_CACHE_CONTROL } },
    );
  } catch (err) {
    const apiError = normalizeError(err);
    logger.warn('GET /api/collections failed', { requestId, error: apiError.message });
    timer.done(apiError.status, { error: apiError.code });
    return NextResponse.json(apiError.toJson(), { status: apiError.status });
  }
}
