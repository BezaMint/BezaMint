/**
 * GET /api/search?q=...&type=all|nfts|collections|creators&limit=20
 *
 * Server-side search across collections and creators backed by the event
 * indexer + contract reads. NFT search is limited to the most recently
 * minted tokens (the contracts expose no enumeration method, so a full
 * NFT search is not possible without a DB index). Response items match
 * the client `SearchResultShape` used by the explore UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { refreshIndexer, getIndexedEvents } from '@/lib/server/indexer';
import { simulateRead, addressScVal, u64ScVal } from '@/lib/server/contractReader';
import { ApiError, normalizeError } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import { CONTRACT_IDS } from '@/services';
import { TtlCache, SHORT_CACHE_CONTROL } from '@/lib/server/cache';

export const dynamic = 'force-dynamic';

type SearchType = 'all' | 'nfts' | 'collections' | 'creators';

const SEARCH_TYPES: SearchType[] = ['all', 'nfts', 'collections', 'creators'];

const searchCache = new TtlCache<SearchItem[]>(15_000);

interface SearchItem {
  type: 'nft' | 'collection' | 'creator';
  title: string;
  subtitle: string;
  category?: string;
  href: string;
}

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'GET', '/api/search');
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.trim().toLowerCase();
    const type = (searchParams.get('type') ?? 'all') as SearchType;
    const rawLimit = Number(searchParams.get('limit'));
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 20) : 10;

    if (!query || query.length < 2) {
      return NextResponse.json(
        { data: [], meta: { query: query ?? '', type } },
        { headers: { 'Cache-Control': SHORT_CACHE_CONTROL } },
      );
    }
    if (!SEARCH_TYPES.includes(type)) {
      throw new ApiError(
        'BAD_REQUEST',
        'type must be one of: all, nfts, collections, creators',
        400,
      );
    }

    await refreshIndexer();

    const cacheKey = `search:${query}:${type}:${limit}`;
    const results = await searchCache.getOrSet(cacheKey, () => runSearch(query, type, limit));

    timer.done(200, { results: results.length });
    return NextResponse.json(
      { data: results, meta: { query, type } },
      { headers: { 'Cache-Control': SHORT_CACHE_CONTROL } },
    );
  } catch (err) {
    const apiError = normalizeError(err);
    logger.warn('GET /api/search failed', { requestId, error: apiError.message });
    timer.done(apiError.status, { error: apiError.code });
    return NextResponse.json(apiError.toJson(), { status: apiError.status });
  }
}

async function runSearch(query: string, type: SearchType, limit: number): Promise<SearchItem[]> {
  const results: SearchItem[] = [];
  const events = getIndexedEvents();

  if (type === 'all' || type === 'creators') {
    const registered = new Set(
      events.filter((e) => e.type === 'creator_registered' && e.actor).map((e) => e.actor!),
    );
    const profiles = await Promise.all(
      [...registered].map(async (address) => {
        if (results.length >= limit) return null;
        try {
          const profile = await simulateRead<{
            display_name: string;
            bio: string;
            avatar_uri: string;
          }>(CONTRACT_IDS.creator, 'get_profile', [addressScVal(address)]);
          const name = profile.display_name;
          if (!name.toLowerCase().includes(query) && !address.toLowerCase().includes(query)) {
            return null;
          }
          return {
            type: 'creator' as const,
            title: name,
            subtitle: address,
            category: profile.bio || undefined,
            href: `/creators/${address}`,
          } as SearchItem;
        } catch {
          return null;
        }
      }),
    );
    results.push(...profiles.filter((p): p is NonNullable<typeof p> => p !== null));
  }

  if (type === 'all' || type === 'collections') {
    const collectionIds = [
      ...new Set(
        events
          .filter((e) => e.type === 'collection_created' && e.id !== undefined)
          .map((e) => e.id as number),
      ),
    ].sort((a, b) => b - a);
    for (const id of collectionIds) {
      if (results.length >= limit) break;
      try {
        const collection = await simulateRead<{
          metadata_uri: string;
          creator: string;
        }>(CONTRACT_IDS.collection, 'get_collection', [u64ScVal(id)]);
        // Collection titles live in the metadata document; without a DB we
        // match on id + creator address, which still surfaces the record.
        if (!String(id).includes(query) && !collection.creator.toLowerCase().includes(query)) {
          continue;
        }
        results.push({
          type: 'collection',
          title: `Collection #${id}`,
          subtitle: collection.creator,
          category: collection.metadata_uri || undefined,
          href: `/collections/${id}`,
        });
      } catch {
        // Skip ids that no longer resolve.
      }
    }
  }

  if (type === 'all' || type === 'nfts') {
    const mintedIds = events
      .filter((e) => e.type === 'nft_minted' && e.id !== undefined)
      .map((e) => e.id as number);
    for (const id of mintedIds) {
      if (results.length >= limit) break;
      if (!String(id).includes(query)) continue;
      results.push({
        type: 'nft',
        title: `Token #${id}`,
        subtitle: 'Recently minted',
        href: `/nft/${id}`,
      });
    }
  }

  return results.slice(0, limit);
}
