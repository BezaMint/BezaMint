import { NextRequest, NextResponse } from 'next/server';
import { getPinataClient, isIpfsAvailable } from '@/lib/pinata';
import { rateLimitUpload, MAX_METADATA_SIZE } from '@/lib/server/uploadGuard';
import { normalizeError, badRequest } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';

/**
 * POST /api/ipfs/upload
 * Upload NFT metadata JSON to IPFS via Pinata.
 * Returns proper HTTP status codes so callers can distinguish success from
 * fallback. Enforces a request-body size cap, schema validation (400s rather
 * than 500s) and the per-IP rate limit.
 */

const NAME_MAX = 128;
const DESCRIPTION_MAX = 2000;
const MAX_ATTRIBUTES = 20;
const ATTRIBUTE_VALUE_MAX = 128;

interface RawMetadata {
  name?: unknown;
  description?: unknown;
  imageUri?: unknown;
  animationUri?: unknown;
  externalUrl?: unknown;
  collectionId?: unknown;
  royalties?: unknown;
  attributes?: unknown;
}

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
  input: RawMetadata,
): { ok: true; value: RawMetadata & { name: string } } | { ok: false; error: NextResponse } {
  if (typeof input.name !== 'string' || !input.name.trim()) {
    return { ok: false, error: validationError('Metadata must include a name field') };
  }
  if (input.name.length > NAME_MAX) {
    return { ok: false, error: validationError(`name exceeds ${NAME_MAX} characters`) };
  }
  if (input.description !== undefined && typeof input.description !== 'string') {
    return { ok: false, error: validationError('description must be a string') };
  }
  if (typeof input.description === 'string' && input.description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: validationError(`description exceeds ${DESCRIPTION_MAX} characters`),
    };
  }
  if (input.attributes !== undefined) {
    if (!Array.isArray(input.attributes) || input.attributes.length > MAX_ATTRIBUTES) {
      return {
        ok: false,
        error: validationError(`attributes must be an array of at most ${MAX_ATTRIBUTES} items`),
      };
    }
    for (const attr of input.attributes as unknown[]) {
      const record = attr as Record<string, unknown>;
      if (typeof record?.traitType !== 'string' || typeof record?.value !== 'string') {
        return {
          ok: false,
          error: validationError('each attribute needs string traitType and value'),
        };
      }
      if (record.value.length > ATTRIBUTE_VALUE_MAX) {
        return {
          ok: false,
          error: validationError(`attribute values exceed ${ATTRIBUTE_VALUE_MAX} characters`),
        };
      }
    }
  }
  return { ok: true, value: input as RawMetadata & { name: string } };
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

    let metadata: RawMetadata;
    try {
      metadata = (await request.json()) as RawMetadata;
    } catch {
      return validationError('Request body must be valid JSON');
    }

    const validation = validateMetadata(metadata);
    if (!validation.ok) return validation.error;

    const safeName = validation.value.name.trim().slice(0, NAME_MAX);

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
      description: typeof metadata.description === 'string' ? metadata.description : '',
      image: typeof metadata.imageUri === 'string' ? metadata.imageUri : '',
      animation_url: typeof metadata.animationUri === 'string' ? metadata.animationUri : '',
      external_url: typeof metadata.externalUrl === 'string' ? metadata.externalUrl : '',
      attributes: (Array.isArray(metadata.attributes) ? metadata.attributes : []).map(
        (attr: Record<string, unknown>) => ({
          trait_type: attr.traitType || attr.trait_type,
          value: attr.value,
          display_type: attr.displayType || attr.display_type,
        }),
      ),
      properties: {
        collection_id: typeof metadata.collectionId === 'string' ? metadata.collectionId : '',
        royalties: metadata.royalties ?? null,
      },
    };

    const file = new File([JSON.stringify(nftMetadata)], `nft-${Date.now()}.json`, {
      type: 'application/json',
    });

    const result = await pinata.upload.public.file(file);

    const ipfsUri = `ipfs://${result.cid}`;

    timer.done(200, { cid: result.cid.slice(0, 12) });
    return NextResponse.json({
      cid: result.cid,
      ipfsUri,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${result.cid}`,
      fallback: false,
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
