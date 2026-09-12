/**
 * GET /api/creators
 *
 * Lists registered creators, backed by the event indexer (creator
 * registration events) + live profile reads. Supports `verified` and `q`
 * (display-name / address prefix) filters plus `limit`/`offset` pagination.
 */
import { NextRequest, NextResponse } from 'next/server';
import { refreshIndexer, getIndexedEvents } from '@/lib/server/indexer';
import { parsePagination } from '@/lib/server/pagination';
import { simulateRead, addressScVal } from '@/lib/server/contractReader';
import { apiError, normalizeError } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import { TtlCache, SHORT_CACHE_CONTROL } from '@/lib/server/cache';
import { CONTRACT_IDS } from '@/services';

export const dynamic = 'force-dynamic';

// Profile reads are one RPC round-trip per creator; cache by address set.
const profileCache = new TtlCache<(CreatorProfile & { address: string })[]>(15_000);

interface CreatorProfile {
  address: string;
  display_name: string;
  bio: string;
  avatar_uri: string;
  banner_uri: string;
  // The contract's `SocialLink` is `{ platform, url }`. Typing it as `handle`
  // here misdescribed the response: the value is passed through unchanged, so
  // the JSON was right but the declared shape -- and anything generated from
  // it, including the API reference -- documented a field that does not exist.
  social_links: { platform: string; url: string }[];
  created_at: number;
  updated_at: number;
  is_verified: boolean;
}

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'GET', '/api/creators');
  try {
    const searchParams = request.nextUrl.searchParams;
    const { limit, offset } = parsePagination(searchParams);
    // An unrecognized value used to be read as "not set", so `verified=yes`
    // returned unverified creators alongside verified ones and a caller could
    // not tell the filter had been ignored.
    const verifiedParam = searchParams.get('verified');
    if (verifiedParam !== null && verifiedParam !== 'true' && verifiedParam !== 'false') {
      throw apiError('FILTER_INVALID', 'verified must be "true" or "false"');
    }
    const verifiedOnly = verifiedParam === 'true';
    const query = searchParams.get('q')?.trim().toLowerCase();

    if (!CONTRACT_IDS.creator) {
      throw apiError('CONTRACT_NOT_CONFIGURED', 'Creator contract not configured');
    }

    await refreshIndexer();

    // Creator addresses come from registration events. If the indexer is
    // empty (fresh deploy), fall back to the total counter with a bounded
    // scan is not possible without an enumeration method, so return empty.
    const registered = new Set(
      getIndexedEvents()
        .filter((e) => e.type === 'creator_registered' && e.actor)
        .map((e) => e.actor!),
    );
    const addresses = [...registered];

    const cacheKey = `creators:${addresses.sort().join(',')}`;
    let valid = await profileCache.getOrSet(cacheKey, async () => {
      const profiles = await Promise.all(
        addresses.map(async (address) => {
          try {
            const profile = await simulateRead<CreatorProfile>(
              CONTRACT_IDS.creator,
              'get_profile',
              [addressScVal(address)],
            );
            return { ...profile, address };
          } catch {
            return null;
          }
        }),
      );
      return profiles.filter((p): p is NonNullable<typeof p> => p !== null);
    });
    if (verifiedOnly) valid = valid.filter((p) => p.is_verified);
    if (query) {
      valid = valid.filter(
        (p) =>
          p.display_name.toLowerCase().includes(query) || p.address.toLowerCase().includes(query),
      );
    }

    const page = valid.slice(offset, offset + limit);
    const creators = page.map((p) => ({
      address: p.address,
      displayName: p.display_name,
      bio: p.bio,
      avatarUri: p.avatar_uri,
      bannerUri: p.banner_uri,
      socialLinks: p.social_links,
      isVerified: p.is_verified,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    timer.done(200, { total: valid.length, returned: creators.length });
    return NextResponse.json(
      {
        data: creators,
        pagination: { limit, offset, total: valid.length },
      },
      { headers: { 'Cache-Control': SHORT_CACHE_CONTROL } },
    );
  } catch (err) {
    const apiError = normalizeError(err);
    logger.warn('GET /api/creators failed', { requestId, error: apiError.message });
    timer.done(apiError.status, { error: apiError.code });
    return NextResponse.json(apiError.toJson(), { status: apiError.status });
  }
}
