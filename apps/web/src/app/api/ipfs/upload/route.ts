import { NextRequest, NextResponse } from 'next/server';
import { getPinataClient, isIpfsAvailable } from '@/lib/pinata';

/**
 * POST /api/ipfs/upload
 * Upload NFT metadata JSON to IPFS via Pinata.
 * Returns proper HTTP status codes so callers can distinguish success from fallback.
 */
// Max body size: 1MB
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

export async function POST(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 1_000_000) {
    return NextResponse.json({ error: 'Request body too large' }, { status: 413 });
  }
  try {
    const metadata = await request.json();

    // Sanitize inputs
    const safeName = String(metadata.name || '')
      .trim()
      .slice(0, 128);

    if (!metadata.name) {
      return NextResponse.json({ error: 'Metadata must include a name field' }, { status: 400 });
    }

    // Graceful fallback when Pinata is not configured
    if (!isIpfsAvailable()) {
      const slug = encodeURIComponent(metadata.name).slice(0, 32);
      const fallbackUri = `beza://metadata/${Date.now()}-${slug}`;
      return NextResponse.json({
        cid: null,
        ipfsUri: fallbackUri,
        fallback: true,
        hint: 'Set PINATA_JWT to enable IPFS pinning',
      });
    }

    const pinata = getPinataClient()!;

    const nftMetadata = {
      name: metadata.name,
      description: metadata.description || '',
      image: metadata.imageUri || '',
      animation_url: metadata.animationUri || '',
      external_url: metadata.externalUrl || '',
      attributes: (metadata.attributes || []).map((attr: Record<string, string>) => ({
        trait_type: attr.traitType || attr.trait_type,
        value: attr.value,
        display_type: attr.displayType || attr.display_type,
      })),
      properties: {
        collection_id: metadata.collectionId || '',
        royalties: metadata.royalties || null,
      },
    };

    const file = new File([JSON.stringify(nftMetadata)], `nft-${Date.now()}.json`, {
      type: 'application/json',
    });

    const result = await pinata.upload.public.file(file);

    const ipfsUri = `ipfs://${result.cid}`;

    return NextResponse.json({
      cid: result.cid,
      ipfsUri,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${result.cid}`,
      fallback: false,
    });
  } catch (error: unknown) {
    // Structured error - use proper logger in production
    if (process.env.NODE_ENV === 'development') {
      console.error('[IPFS Upload]', { message: (error as Error)?.message });
    }

    // Return proper error status so callers can detect failure
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === 'development' ? (error as Error).message : 'IPFS upload failed',
        cid: null,
        ipfsUri: null,
        fallback: false,
      },
      { status: 502 },
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
