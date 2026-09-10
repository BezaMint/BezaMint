/**
 * GET /api/nfts
 *
 * Lists recently minted NFTs, backed by the event indexer + live contract
 * reads. Supports `creator` and `collectionId` filters plus `limit`/`offset`
 * pagination. Token metadata is enriched from the NFT contract (owner,
 * collection, metadata URI); clients resolve the URI to JSON themselves.
 */
import { NextRequest, NextResponse } from 'next/server';
import { refreshIndexer, getIndexedEvents } from '@/lib/server/indexer';
import { parsePagination } from '@/lib/server/pagination';
import { simulateRead, u64ScVal } from '@/lib/server/contractReader';
import { ApiError, normalizeError } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import { TtlCache, SHORT_CACHE_CONTROL } from '@/lib/server/cache';
import { CONTRACT_IDS } from '@/services';

export const dynamic = 'force-dynamic';

interface NftListItem {
  tokenId: number;
  creator: string | null;
  owner: string | null;
  collectionId: number | null;
  metadataUri: string | null;
  mintedAt: number | null;
  ledger: number;
  txHash: string;
}

// Enrichment involves one RPC round-trip per NFT; cache per filter set.
const enrichmentCache = new TtlCache<NftListItem[]>(15_000);

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'GET', '/api/nfts');
  try {
    const searchParams = request.nextUrl.searchParams;
    const { limit, offset } = parsePagination(searchParams);
    const creator = searchParams.get('creator')?.trim();
    const collectionIdRaw = searchParams.get('collectionId')?.trim();

    if (creator && !/^G[A-Z2-7]{55}$/.test(creator)) {
      throw new ApiError('BAD_REQUEST', 'creator must be a valid Stellar address', 400);
    }
    if (collectionIdRaw && !/^\d+$/.test(collectionIdRaw)) {
      throw new ApiError('BAD_REQUEST', 'collectionId must be a positive integer', 400);
    }
    const collectionId = collectionIdRaw ? Number(collectionIdRaw) : undefined;

    if (!CONTRACT_IDS.nft || !CONTRACT_IDS.collection) {
      throw new ApiError('CONTRACT_ERROR', 'NFT or collection contract not configured', 503);
    }

    await refreshIndexer();

    const nftEvents = getIndexedEvents()
      .filter((e) => e.type === 'nft_minted')
      .filter((e) => !creator || e.actor === creator)
      .filter((e) => e.id !== undefined);

    // Deduplicate by token id (a token may emit multiple events).
    const seen = new Set<number>();
    const unique = nftEvents.filter((e) => {
      if (seen.has(e.id!)) return false;
      seen.add(e.id!);
      return true;
    });

    const page = unique.slice(offset, offset + limit);
    const cacheKey = `nfts:${creator ?? ''}:${collectionId ?? ''}:${page.map((e) => e.id).join(',')}`;

    const nfts = await enrichmentCache.getOrSet(cacheKey, async () =>
      Promise.all(
        page.map(async (event) => {
          const tokenId = event.id!;
          try {
            const [owner, data, nftCollectionId] = await Promise.all([
              simulateRead<string>(CONTRACT_IDS.nft, 'owner_of', [u64ScVal(tokenId)]),
              simulateRead<{
                token_id: number;
                creator: string;
                collection_id: number;
                metadata_uri: string;
                minted_at: number;
              }>(CONTRACT_IDS.nft, 'token_data', [u64ScVal(tokenId)]),
              simulateRead<number>(CONTRACT_IDS.collection, 'get_collection_for_nft', [
                u64ScVal(tokenId),
              ]).catch(() => null),
            ]);
            return {
              tokenId,
              creator: data.creator,
              owner,
              collectionId: nftCollectionId,
              metadataUri: data.metadata_uri,
              mintedAt: data.minted_at,
              ledger: event.ledger,
              txHash: event.txHash,
            };
          } catch {
            return {
              tokenId,
              creator: event.actor ?? null,
              owner: null,
              collectionId: null,
              metadataUri: null,
              mintedAt: null,
              ledger: event.ledger,
              txHash: event.txHash,
            };
          }
        }),
      ),
    );

    const total = unique.length;
    timer.done(200, { total, returned: nfts.length });
    return NextResponse.json(
      { data: nfts, pagination: { limit, offset, total } },
      { headers: { 'Cache-Control': SHORT_CACHE_CONTROL } },
    );
  } catch (err) {
    const apiError = normalizeError(err);
    logger.warn('GET /api/nfts failed', { requestId, error: apiError.message });
    timer.done(apiError.status, { error: apiError.code });
    return NextResponse.json(apiError.toJson(), { status: apiError.status });
  }
}
