import { describe, it, expect, vi, afterEach } from 'vitest';
import { toGatewayUrl, isMetadataLike, resolveMetadataUri } from '../metadataResolver';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('toGatewayUrl', () => {
  it('maps ipfs:// CIDs to the configured gateway', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', 'https://dedicated.mypinata.cloud');
    expect(toGatewayUrl('ipfs://Qm123', 0)).toBe('https://dedicated.mypinata.cloud/ipfs/Qm123');
  });

  it('uses ipfs.io when no gateway is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', '');
    expect(toGatewayUrl('ipfs://Qm123', 0)).toBe('https://ipfs.io/ipfs/Qm123');
  });

  it('keeps the pinning provider as the second gateway behind a configured one', () => {
    vi.stubEnv('NEXT_PUBLIC_PINATA_GATEWAY', 'https://ipfs.io');
    expect(toGatewayUrl('ipfs://Qm123', 1)).toBe('https://gateway.pinata.cloud/ipfs/Qm123');
  });

  it('passes https URLs through unchanged', () => {
    expect(toGatewayUrl('https://example.com/meta.json', 0)).toBe('https://example.com/meta.json');
  });
});

describe('isMetadataLike', () => {
  it('accepts plain objects', () => {
    expect(isMetadataLike({ name: 'x' })).toBe(true);
  });

  it('rejects arrays, null, and primitives', () => {
    expect(isMetadataLike([])).toBe(false);
    expect(isMetadataLike(null)).toBe(false);
    expect(isMetadataLike('name')).toBe(false);
    expect(isMetadataLike(42)).toBe(false);
  });
});

describe('resolveMetadataUri', () => {
  it('returns null for placeholder and unsupported schemes', async () => {
    expect(await resolveMetadataUri('')).toBeNull();
    expect(await resolveMetadataUri('beza://metadata/1')).toBeNull();
    expect(await resolveMetadataUri('javascript:alert(1)')).toBeNull();
  });

  it('fetches and parses metadata from a gateway URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: 'Test NFT', image: 'ipfs://QmImg' }),
      }),
    );

    const result = await resolveMetadataUri('ipfs://Qm123');
    expect(result?.name).toBe('Test NFT');
    expect(result?.image).toBe('ipfs://QmImg');
  });

  it('returns null when the response is not JSON metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => 'not-an-object',
      }),
    );

    expect(await resolveMetadataUri('ipfs://Qm123')).toBeNull();
  });

  it('returns null when every gateway fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(await resolveMetadataUri('ipfs://Qm123', 100)).toBeNull();
  });
});
