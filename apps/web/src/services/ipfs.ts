export class IpfsUploadError extends Error {
  constructor(msg, public statusCode) { super(msg); this.name = "IpfsUploadError"; }
}

export interface IpfsUploadResult {
  cid: string | null;
  ipfsUri: string | null;
  gatewayUrl?: string;
  fallback: boolean;
  error?: string;
  hint?: string;
}

/**
 * Upload NFT metadata to IPFS via the BezaMint API.
 * Returns metadata URI ready for the smart contract.
 * Falls back to a placeholder URI when IPFS is unavailable.
 */
export async function uploadMetadataToIpfs(metadata: {
  name: string;
  description?: string;
  imageUri?: string;
  animationUri?: string;
  externalUrl?: string;
  attributes?: Array<{ traitType: string; value: string; displayType?: string }>;
  collectionId?: string;
  royalties?: unknown;
}): Promise<{ ipfsUri: string; fallback: boolean }> {
  const response = await fetch('/api/ipfs/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });

  clearTimeout(t);
    if (!response.ok) {
    // IPFS upload failed — fall back to placeholder
    const slug = encodeURIComponent(metadata.name).slice(0, 32);
    return {
      ipfsUri: `beza://metadata/${Date.now()}-${slug}`,
      fallback: true,
    };
  }

  const result: IpfsUploadResult = await response.json();
  return {
    ipfsUri: result.ipfsUri || `beza://metadata/${Date.now()}`,
    fallback: result.fallback,
  };
}
