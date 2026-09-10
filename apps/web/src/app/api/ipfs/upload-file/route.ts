import { NextRequest, NextResponse } from 'next/server';
import { getPinataClient, isIpfsAvailable } from '@/lib/pinata';
import { validateFile } from '@/lib/server/uploadGuard';

/**
 * POST /api/ipfs/upload-file
 * Upload a raster image file to IPFS via Pinata.
 * Used by the client-side compression flow (ImagePreview file picker).
 * Enforces the shared file-size cap.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A file field is required' }, { status: 400 });
    }

    const validationError = validateFile(file);
    if (validationError) {
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

    return NextResponse.json({
      cid: result.cid,
      ipfsUri: `ipfs://${result.cid}`,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${result.cid}`,
    });
  } catch (error: unknown) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[IPFS Upload File]', { message: (error as Error)?.message });
    }
    return NextResponse.json({ error: 'Image upload failed' }, { status: 502 });
  }
}
