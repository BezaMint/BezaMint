/**
 * GET /api/ipfs/metadata?uri=ipfs://CID (or https gateway URL)
 *
 * Proxies NFT metadata documents through the server so browsers never hit
 * gateway CORS issues, validates the document against the NFT metadata
 * schema, and caches by URI. Responds 200 with `{ data }` on success,
 * 404 when the document does not exist, and 422 when the document fails
 * schema validation (so the UI can degrade gracefully).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ApiError, normalizeError } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import { fetchWithTimeout } from '@/lib/server/http';
import { getIpfsGateways } from '@/lib/ipfsGateway';
import { TtlCache } from '@/lib/server/cache';
import {
  NFT_METADATA_SCHEMA,
  validateAgainstSchema,
  formatIssues,
} from '@/lib/server/metadataSchema';

export const dynamic = 'force-dynamic';

const metadataCache = new TtlCache<unknown>(60_000);

const MAX_DOCUMENT_BYTES = 256 * 1024;

/**
 * Candidate URLs for a URI, in the order they should be tried. An `ipfs://`
 * URI is content-addressed, so a gateway that refuses it (public gateways
 * answer 429 to datacenter egress) can simply be stepped over; an http(s) URI
 * has exactly one address.
 */
function resolveFetchUrls(uri: string): string[] {
  if (uri.startsWith('ipfs://')) {
    const path = uri.slice('ipfs://'.length);
    return getIpfsGateways().map((gateway) => `${gateway}/ipfs/${path}`);
  }
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return [parsed.toString()];
    }
  } catch {
    return [];
  }
  return [];
}

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'GET', '/api/ipfs/metadata');
  try {
    const uri = request.nextUrl.searchParams.get('uri')?.trim();
    if (!uri) {
      throw new ApiError('BAD_REQUEST', 'uri query parameter is required', 400);
    }

    const fetchUrls = resolveFetchUrls(uri);
    if (fetchUrls.length === 0) {
      throw new ApiError('BAD_REQUEST', 'uri must be an ipfs:// or http(s) URL', 400);
    }

    const data = await metadataCache.getOrSet(`metadata:${uri}`, async () => {
      let failedStatus = 0;
      let sawNotFound = false;
      let lastError: unknown = null;
      let response: Response | null = null;

      for (const fetchUrl of fetchUrls) {
        try {
          const candidate = await fetchWithTimeout(fetchUrl, {
            timeoutMs: 8_000,
            timeoutMessage: 'metadata fetch timed out',
            headers: { Accept: 'application/json' },
          });
          if (candidate.status === 404) {
            sawNotFound = true;
            continue;
          }
          if (!candidate.ok) {
            failedStatus = candidate.status;
            continue;
          }
          response = candidate;
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!response) {
        // A gateway that answered with a real error is more informative than
        // one that merely lacked the object, so it takes precedence.
        if (failedStatus) {
          throw new ApiError('NETWORK_ERROR', `Gateway responded ${failedStatus}`, 502);
        }
        if (sawNotFound) {
          throw new ApiError('NOT_FOUND', 'Metadata document not found', 404);
        }
        throw new ApiError(
          'NETWORK_ERROR',
          lastError instanceof Error ? lastError.message : 'No gateway could serve the document',
          502,
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('json')) {
        throw new ApiError('BAD_REQUEST', 'Metadata document is not JSON', 422);
      }

      const text = await response.text();
      if (text.length > MAX_DOCUMENT_BYTES) {
        throw new ApiError('BAD_REQUEST', 'Metadata document too large', 413);
      }

      let document: unknown;
      try {
        document = JSON.parse(text);
      } catch {
        throw new ApiError('BAD_REQUEST', 'Metadata document is invalid JSON', 422);
      }

      const issues = validateAgainstSchema(NFT_METADATA_SCHEMA, document);
      if (issues.length > 0) {
        throw new ApiError(
          'BAD_REQUEST',
          `Metadata fails validation: ${formatIssues(issues)}`,
          422,
        );
      }

      return document;
    });

    timer.done(200, {});
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (err) {
    const apiError = normalizeError(err);
    logger.warn('GET /api/ipfs/metadata failed', { requestId, error: apiError.message });
    timer.done(apiError.status, { error: apiError.code });
    return NextResponse.json(apiError.toJson(), { status: apiError.status });
  }
}
