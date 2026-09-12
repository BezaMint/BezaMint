import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  DEFAULT_IPFS_GATEWAY,
  FALLBACK_IPFS_GATEWAY,
  getIpfsGateway,
  getIpfsGateways,
  ipfsGatewayUrl,
} from '../ipfsGateway';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getIpfsGateway', () => {
  it('defaults to ipfs.io when nothing is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', '');
    expect(getIpfsGateway()).toBe(DEFAULT_IPFS_GATEWAY);
  });

  it('treats a whitespace-only value as unset', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', '   ');
    expect(getIpfsGateway()).toBe(DEFAULT_IPFS_GATEWAY);
  });

  it('returns the configured gateway without a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', 'https://dedicated.mypinata.cloud/');
    expect(getIpfsGateway()).toBe('https://dedicated.mypinata.cloud');
  });

  it('trims surrounding whitespace from a configured value', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', '  https://ipfs.io  ');
    expect(getIpfsGateway()).toBe('https://ipfs.io');
  });
});

describe('ipfsGatewayUrl', () => {
  it('builds a URL from a bare CID', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', 'https://ipfs.io');
    expect(ipfsGatewayUrl('bafyabc')).toBe('https://ipfs.io/ipfs/bafyabc');
  });

  it('builds a URL from an ipfs:// URI', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', 'https://ipfs.io');
    expect(ipfsGatewayUrl('ipfs://bafyabc')).toBe('https://ipfs.io/ipfs/bafyabc');
  });

  it('does not double the ipfs path segment', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', 'https://ipfs.io');
    expect(ipfsGatewayUrl('/ipfs/bafyabc')).toBe('https://ipfs.io/ipfs/bafyabc');
  });

  it('agrees with the gateway verifyPinnedContent fetches from', () => {
    // The upload route hands the client this URL, and the integrity check reads
    // from the same gateway. A hard-coded host in either place is what made the
    // deployment serve URLs for a gateway its own reads could not reach in time.
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', 'https://dedicated.mypinata.cloud');
    expect(ipfsGatewayUrl('bafyabc')).toBe('https://dedicated.mypinata.cloud/ipfs/bafyabc');
  });
});

describe('getIpfsGateways', () => {
  it('prefers the configured gateway and always keeps the pinning provider behind it', () => {
    // Public gateways answer 429 to datacenter egress, so a server-side read
    // needs somewhere to go next that holds the content.
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', 'https://dedicated.mypinata.cloud');
    expect(getIpfsGateways()).toEqual(['https://dedicated.mypinata.cloud', FALLBACK_IPFS_GATEWAY]);
  });

  it('falls back to the pinning provider when nothing is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', '');
    expect(getIpfsGateways()).toEqual([DEFAULT_IPFS_GATEWAY, FALLBACK_IPFS_GATEWAY]);
  });

  it('does not repeat a gateway that is already the fallback', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', FALLBACK_IPFS_GATEWAY);
    expect(getIpfsGateways()).toEqual([FALLBACK_IPFS_GATEWAY]);
  });
});
