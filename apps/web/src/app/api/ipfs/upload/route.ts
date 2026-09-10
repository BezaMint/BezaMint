import { NextRequest, NextResponse } from 'next/server';
import { getPinataClient, isIpfsAvailable } from '@/lib/pinata';
import { rateLimitUpload, MAX_METADATA_SIZE } from '@/lib/server/uploadGuard';
import { normalizeError, badRequest } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import {
  NFT_METADATA_SCHEMA,
  validateAgainstSchema,
  formatIssues,
} from '@/lib/server/metadataSchema';
import { assertValidCid, verifyPinnedContent } from '@/lib/server/verifyPin';

/**
 * POST /api/ipfs/upload
 * Upload NFT metadata JSON to IPFS via Pinata.
 * Returns proper HTTP status codes so callers can distinguish success from
 * fallback. Enforces a request-body size cap, schema validation (400s rather
 * than 500s) and the per-IP rate limit.
 */

const NAME_MAX = 128;

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    },
  );
}

function validationError(message: string): NextResponse {
  const error = badRequest(message);
  return NextResponse.json(error.toJson(), { status: error.status });
}

function validateMetadata(
  input: unknown,
): { ok: true; value: { name: string } } | { ok: false; error: NextResponse } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: validationError('Metadata must be a JSON object') };
  }

  const issues = validateAgainstSchema(NFT_METADATA_SCHEMA, input);
  if (issues.length > 0) {
    return { ok: false, error: validationError(`Invalid metadata: ${formatIssues(issues)}`) };
  }

  const name = (input as { name?: unknown }).name;
  if (typeof name !== 'string' || !name.trim()) {
    return { ok: false, error: validationError('Metadata must include a name field') };
  }
  return { ok: true, value: { name } };
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'POST', '/api/ipfs/upload');
  try {
    const rateLimitedResponse = rateLimitUpload(request);
    if (rateLimitedResponse) {
      timer.done(429, { reason: 'rate_limited' });
      return rateLimitedResponse;
    }

    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_METADATA_SIZE) {
      return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
    }

    let metadata: unknown;
    try {
      metadata = await request.json();
    } catch {
      return validationError('Request body must be valid JSON');
    }

    const validation = validateMetadata(metadata);
    if (!validation.ok) return validation.error;

    const safeName = validation.value.name.trim().slice(0, NAME_MAX);
    const metadataRecord = metadata as Record<string, unknown>;

    // Graceful fallback when Pinata is not configured
    if (!isIpfsAvailable()) {
      const slug = encodeURIComponent(safeName).slice(0, 32);
      const fallbackUri = `beza://metadata/${Date.now()}-${slug}`;
      timer.done(200, { fallback: true });
      return NextResponse.json({
        cid: null,
        ipfsUri: fallbackUri,
        fallback: true,
        hint: 'Set PINATA_JWT to enable IPFS pinning',
      });
    }

    const pinata = getPinataClient()!;

    const nftMetadata = {
      name: safeName,
      description: typeof metadataRecord.description === 'string' ? metadataRecord.description : '',
      image: typeof metadataRecord.imageUri === 'string' ? metadataRecord.imageUri : '',
      animation_url:
        typeof metadataRecord.animationUri === 'string' ? metadataRecord.animationUri : '',
      external_url:
        typeof metadataRecord.externalUrl === 'string' ? metadataRecord.externalUrl : '',
      attributes: (Array.isArray(metadataRecord.attributes) ? metadataRecord.attributes : []).map(
        (attr: Record<string, unknown>) => ({
          trait_type: attr.traitType || attr.trait_type,
          value: attr.value,
          display_type: attr.displayType || attr.display_type,
        }),
      ),
      properties: {
        collection_id:
          typeof metadataRecord.collectionId === 'string' ? metadataRecord.collectionId : '',
        royalties: metadataRecord.royalties ?? null,
      },
    };

    const serialized = JSON.stringify(nftMetadata);
    const file = new File([serialized], `nft-${Date.now()}.json`, {
      type: 'application/json',
    });

    const result = await pinata.upload.public.file(file);

    // Integrity check: the CID must be well-formed and the pinned bytes
    // must match the exact metadata document we just serialized.
    assertValidCid(result.cid);
    const integrity = await verifyPinnedContent(result.cid, Buffer.from(serialized));
    if (!integrity.verified) {
      logger.warn('metadata upload integrity check failed', {
        cid: result.cid,
        error: integrity.error,
      });
    }

    const ipfsUri = `ipfs://${result.cid}`;

    timer.done(200, { cid: result.cid.slice(0, 12), verified: integrity.verified });
    return NextResponse.json({
      cid: result.cid,
      ipfsUri,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${result.cid}`,
      fallback: false,
      integrity,
    });
  } catch (error: unknown) {
    const apiError = normalizeError(error);
    logger.warn('metadata upload failed', { requestId, error: apiError.message });
    timer.done(apiError.status, { error: apiError.code });
    return NextResponse.json(
      {
        error: apiError.message,
        cid: null,
        ipfsUri: null,
        fallback: false,
      },
      { status: apiError.status },
    );
  }
}

/**
 * GET /api/ipfs/upload
 * Health check — returns whether IPFS is configured
 */
export async function GET() {
  return NextResponse.json({
    available: isIpfsAvailable(),
  });
}
