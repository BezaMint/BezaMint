import { NextRequest, NextResponse } from 'next/server';
import { getPinataClient, isIpfsAvailable } from '@/lib/pinata';

/**
 * POST /api/ipfs/upload-file
 * Upload a raster image file to IPFS via Pinata.
 * Used by the client-side compression flow (ImagePreview file picker).
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB after client-side compression
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A file field is required' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
        { status: 413 },
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, WebP and GIF images are allowed' },
        { status: 415 },
      );
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
