import { NextResponse } from 'next/server';

// Module-level constant so uptime is measured from first request handling.
const SERVER_START_TIME = Date.now();

export async function GET() {
  const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);

  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds + 's',
      environment: process.env.NODE_ENV || 'development',
      network: process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet',
      checks: {
        contractsConfigured: !!(
          process.env.NEXT_PUBLIC_NFT_CONTRACT_ID &&
          process.env.NEXT_PUBLIC_COLLECTION_CONTRACT_ID &&
          process.env.NEXT_PUBLIC_ROYALTY_CONTRACT_ID &&
          process.env.NEXT_PUBLIC_CREATOR_CONTRACT_ID &&
          process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID
        ),
        ipfsAvailable: !!process.env.PINATA_JWT,
      },
    },
    { status: 200 },
  );
}
