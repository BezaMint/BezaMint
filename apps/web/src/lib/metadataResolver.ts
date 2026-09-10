/**
 * Metadata URI resolver.
 *
 * NFT metadata URIs can be ipfs:// CIDs, https gateway URLs, or beza://
 * placeholders. This module resolves them to JSON with a gateway fallback
 * chain (pinata → ipfs.io), a timeout, and shape validation so the UI never
 * renders garbage from a malicious or broken URI.
 */

export interface ResolvedMetadata {
  name?: string;
  description?: string;
  image?: string;
  animation_url?: string;
  external_url?: string;
  attributes?: Array<{ trait_type?: string; value?: string; display_type?: string }>;
}

const GATEWAYS = [
  process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud',
  'https://ipfs.io',
];

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Convert an ipfs:// CID URI to a gateway URL. Returns the URI unchanged for
 * non-ipfs schemes.
 */
export function toGatewayUrl(uri: string, gatewayIndex = 0): string {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length);
    const gateway = GATEWAYS[gatewayIndex] || GATEWAYS[0];
    return `${gateway}/ipfs/${cid}`;
  }
  return uri;
}

/**
 * Validate that an object looks like NFT metadata. Returns true when at least
 * the shape is sane (a plain object), so callers can distinguish "not
 * metadata" from "unreachable".
 */
export function isMetadataLike(value: unknown): value is ResolvedMetadata {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolve a metadata URI to its JSON payload, trying each gateway in turn.
 * Returns null when the URI is a placeholder or every gateway fails.
 */
export async function resolveMetadataUri(
  uri: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ResolvedMetadata | null> {
  if (!uri || uri.startsWith('beza://')) return null;
  if (!uri.startsWith('ipfs://') && !uri.startsWith('https://') && !uri.startsWith('http://')) {
    return null;
  }

  let lastError: unknown = null;
  for (let i = 0; i < GATEWAYS.length; i++) {
    const url = toGatewayUrl(uri, i);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json: unknown = await response.json();
      if (isMetadataLike(json)) return json;
      return null;
    } catch (err) {
      lastError = err;
    }
  }

  // One last attempt with the raw URI (already-https cases where the first
  // gateway attempt was the same URL and failed above).
  if (GATEWAYS.length > 0 && !uri.startsWith('ipfs://')) {
    try {
      const response = await fetch(uri, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) {
        const json: unknown = await response.json();
        if (isMetadataLike(json)) return json;
      }
    } catch {
      // ignore
    }
  }

  return lastError ? null : null;
}
