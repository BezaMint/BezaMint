import { NextRequest, NextResponse } from 'next/server';
import { getPinataClient, isIpfsAvailable } from '@/lib/pinata';
import { rateLimitUpload, MAX_METADATA_SIZE } from '@/lib/server/uploadGuard';
import { normalizeError, apiError, type ApiErrorCode } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import {
  NFT_METADATA_SCHEMA,
  validateAgainstSchema,
  formatIssues,
} from '@/lib/server/metadataSchema';
import { buildMetadataDocument, NAME_MAX } from '@/lib/server/nftMetadataDocument';
import { assertValidCid, verifyPinnedContent } from '@/lib/server/verifyPin';
import { ipfsGatewayUrl } from '@/lib/ipfsGateway';

/**
 * POST /api/ipfs/upload
 * Upload NFT metadata JSON to IPFS via Pinata.
 * Returns proper HTTP status codes so callers can distinguish success from
 * fallback. Enforces a request-body size cap, schema validation (400s rather
 * than 500s) and the per-IP rate limit.
 */

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

/**
 * Reject the request with the code for the rule it broke.
 *
 * Every rejection here used to be `BAD_REQUEST`, so "the body is not JSON",
 * "the body is JSON but not an object", "the document fails its schema" and
 * "the document has no name" were one answer. They are four different fixes.
 */
function validationError(code: ApiErrorCode, message?: string): NextResponse {
  const error = apiError(code, message);
  return NextResponse.json(error.toJson(), { status: error.status });
}

function validateMetadata(
  input: unknown,
): { ok: true; value: { name: string } } | { ok: false; error: NextResponse } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      ok: false,
      error: validationError('JSON_BODY_NOT_OBJECT', 'Metadata must be a JSON object'),
    };
  }

  const issues = validateAgainstSchema(NFT_METADATA_SCHEMA, input);
  if (issues.length > 0) {
    return {
      ok: false,
      error: validationError(
        'DOCUMENT_SCHEMA_INVALID',
        `Invalid metadata: ${formatIssues(issues)}`,
      ),
    };
  }

  const name = (input as { name?: unknown }).name;
  if (typeof name !== 'string' || !name.trim()) {
    return {
      ok: false,
      error: validationError('NAME_REQUIRED', 'Metadata must include a name field'),
    };
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
      return validationError(
        'DOCUMENT_TOO_LARGE',
        `Metadata exceeds the ${MAX_METADATA_SIZE} byte limit`,
      );
    }

    let metadata: unknown;
    try {
      metadata = await request.json();
    } catch {
      return validationError('JSON_BODY_MALFORMED', 'Request body must be valid JSON');
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

    // The pinned document uses the conventional ERC-721 metadata keys, not the
    // camelCase ones this route accepts; see nftMetadataDocument.ts.
    const serialized = JSON.stringify(buildMetadataDocument(metadataRecord, safeName));
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
      gatewayUrl: ipfsGatewayUrl(result.cid),
      fallback: false,
      integrity,
    });
  } catch (error: unknown) {
    const failure = normalizeError(error);
    logger.warn('metadata upload failed', { requestId, error: failure.message });
    timer.done(failure.status, { error: failure.code });
    // The typed envelope plus the null result fields: a caller that reads only
    // `error` gets the code, and one that reads the result shape still finds it.
    return NextResponse.json(
      { ...failure.toJson(), cid: null, ipfsUri: null, fallback: false },
      { status: failure.status },
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
