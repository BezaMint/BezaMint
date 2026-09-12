import { NextRequest, NextResponse } from 'next/server';
import { getPinataClient, isIpfsAvailable } from '@/lib/pinata';
import { validateFile, rateLimitUpload } from '@/lib/server/uploadGuard';
import { apiError, normalizeError } from '@/lib/server/errors';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';
import { assertValidCid, verifyPinnedContent } from '@/lib/server/verifyPin';
import { ipfsGatewayUrl } from '@/lib/ipfsGateway';

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
      const missing = apiError('UPLOAD_FILE_MISSING');
      timer.done(missing.status, { error: missing.code });
      return NextResponse.json(missing.toJson(), { status: missing.status });
    }

    const validationError = validateFile(file);
    if (validationError) {
      timer.done(validationError.status, { reason: 'validation' });
      return validationError;
    }

    if (!isIpfsAvailable()) {
      const unconfigured = apiError('PINATA_NOT_CONFIGURED');
      timer.done(unconfigured.status, { error: unconfigured.code });
      return NextResponse.json(unconfigured.toJson(), { status: unconfigured.status });
    }

    const pinata = getPinataClient()!;
    const result = await pinata.upload.public.file(file);

    // Integrity check: the returned CID must be well-formed, and the
    // pinned bytes must hash to the same digest as what we uploaded.
    const digest = assertValidCid(result.cid);
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    const integrity = await verifyPinnedContent(result.cid, sourceBytes);
    if (!integrity.verified) {
      logger.warn('upload integrity check failed', {
        cid: result.cid,
        digest: Buffer.from(digest).toString('hex').slice(0, 16),
        error: integrity.error,
      });
    }

    timer.done(200, { cid: result.cid.slice(0, 12), verified: integrity.verified });
    return NextResponse.json({
      cid: result.cid,
      ipfsUri: `ipfs://${result.cid}`,
      gatewayUrl: ipfsGatewayUrl(result.cid),
      integrity,
    });
  } catch (error: unknown) {
    const failure = normalizeError(error);
    logger.warn('image upload failed', { requestId, error: failure.message });
    timer.done(failure.status, { error: failure.code });
    // The envelope, not a bare message: this catch-all was the one path in the
    // app that answered with prose alone, so a client that had just been given a
    // typed rejection for a bad media type got an untyped one for a pin failure.
    return NextResponse.json(failure.toJson(), { status: failure.status });
  }
}
