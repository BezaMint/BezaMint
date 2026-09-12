/**
 * The single source of truth for the IPFS gateway this app reads through.
 *
 * Metadata and artwork are content-addressed, so every gateway serves identical
 * bytes for a CID; the only thing that differs is latency. The choice is
 * therefore operational rather than semantic, which is exactly why it belongs
 * behind one function instead of a literal repeated at each call site.
 *
 * The default is ipfs.io rather than Pinata's public gateway because of a
 * measured difference: for the same object, gateway.pinata.cloud took 3.7-6.6s
 * while ipfs.io served byte-identical content in ~40ms. That gap is not
 * cosmetic. It showed up as a health check reporting the deployment degraded, a
 * post-upload integrity check that always timed out, and reads that appear to
 * hang. A Pinata *dedicated* gateway is the right choice for production
 * traffic: set NEXT_PUBLIC_PINATA_GATEWAY to it and every read path follows.
 */

/** Gateway used when NEXT_PUBLIC_PINATA_GATEWAY is unset or blank. */
export const DEFAULT_IPFS_GATEWAY = 'https://ipfs.io';

/**
 * Gateway of last resort: the pinning provider's own gateway.
 *
 * Public gateways rate-limit datacenter egress. Measured from this deployment
 * and from a CI runner, ipfs.io, dweb.link, w3s.link and nftstorage.link all
 * answered 429 for objects that were perfectly readable from a browser, while
 * gateway.pinata.cloud served them every time. It is slower -- 3.7-6.6s per
 * object against ~40ms -- but it is where this app's content was just pinned,
 * so it is the one host that can always answer.
 */
export const FALLBACK_IPFS_GATEWAY = 'https://gateway.pinata.cloud';

/**
 * The configured gateway, without a trailing slash.
 *
 * NEXT_PUBLIC_* is inlined at build time, so this is safe to call from server
 * code and from the browser.
 */
export function getIpfsGateway(): string {
  const configured = process.env.NEXT_PUBLIC_PINATA_GATEWAY;
  const gateway = (configured && configured.trim()) || DEFAULT_IPFS_GATEWAY;
  return gateway.replace(/\/+$/, '');
}

/**
 * The read URL for a CID, an `ipfs://` URI, or a gateway-relative `/ipfs/...`
 * path. Normalises the accepted spellings so callers cannot produce a doubled
 * `/ipfs/ipfs/...` segment.
 */
export function ipfsGatewayUrl(cidOrUri: string): string {
  const path = cidOrUri
    .replace(/^ipfs:\/\//, '')
    .replace(/^\/+/, '')
    .replace(/^ipfs\/+/, '');
  return `${getIpfsGateway()}/ipfs/${path}`;
} /**
 * Gateways to try in order, deduplicated. The configured gateway comes first
 * (so an operator pointing at a dedicated gateway gets it), then the pinning
 * provider's, which is the one that reliably answers a datacenter request.
 */
export function getIpfsGateways(): string[] {
  return [...new Set([getIpfsGateway(), FALLBACK_IPFS_GATEWAY])];
}
