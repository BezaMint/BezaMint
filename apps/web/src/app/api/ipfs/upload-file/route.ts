import { NextRequest, NextResponse } from 'next/server';
import { getPinataClient, isIpfsAvailable } from '@/lib/pinata';
import { validateFile, rateLimitUpload } from '@/lib/server/uploadGuard';
import { normalizeError } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';

/**
 * POST /api/ipfs/upload-file
 * Upload a raster image file to IPFS via Pinata.
 * Used by the client-side compression flow (ImagePreview file picker).
 * Enforces the shared size cap, MIME allowlist and per-IP rate limit.
 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'POST', '/api/ipfs/upload-file');
  try {
    const rateLimitedResponse = rateLimitUpload(request);
    if (rateLimitedResponse) {
      timer.done(429, { reason: 'rate_limited' });
      return rateLimitedResponse;
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A file field is required' }, { status: 400 });
    }

    const validationError = validateFile(file);
    if (validationError) {
      timer.done(validationError.status, { reason: 'validation' });
      return validationError;
    }

    if (!isIpfsAvailable()) {
      return NextResponse.json(
        { error: 'IPFS is not configured (set PINATA_JWT)' },
        { status: 503 },
      );
    }

    const pinata = getPinataClient()!;
    const result = await pinata.upload.public.file(file);

    timer.done(200, { cid: result.cid.slice(0, 12) });
    return NextResponse.json({
      cid: result.cid,
      ipfsUri: `ipfs://${result.cid}`,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${result.cid}`,
    });
  } catch (error: unknown) {
    const apiError = normalizeError(error);
    logger.warn('image upload failed', { requestId, error: apiError.message });
    timer.done(apiError.status, { error: apiError.code });
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
