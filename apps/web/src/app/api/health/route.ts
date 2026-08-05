import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Health check endpoint for monitoring and load balancers.
 * Returns service status, uptime, and connection health.
 */
export async function GET() {
  const startTime = globalThis.__BEZAMINT_START_TIME__ || Date.now();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: `${uptimeSeconds}s`,
      environment: process.env.NODE_ENV || 'development',
      network: process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet',
      checks: {
        contractsConfigured: !!(
          process.env.NEXT_PUBLIC_NFT_CONTRACT_ID &&
          process.env.NEXT_PUBLIC_COLLECTION_CONTRACT_ID
        ),
        ipfsAvailable: !!process.env.PINATA_JWT,
      },
    },
    { status: 200 },
  );
}
