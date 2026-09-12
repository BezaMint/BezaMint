import { describe, expect, it, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { assertValidCid, verifyPinnedContent } from '../verifyPin';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * A CIDv1 (0x55 raw) that the hosted deployment got back from Pinata for a
 * real metadata upload. Kept verbatim as a regression anchor: the validator
 * used to reject exactly this shape, so a fix that quietly narrows again will
 * fail here rather than in production.
 */
const REAL_PINATA_CID = 'bafkreihstdxskjruvl244zzex5qdmfi3althvbmepv7hyrtnwhjmdbxz3e';

function base32Encode(bytes: Buffer): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let value = 0;
  let out = 'b';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += alphabet[(value << (5 - bits)) & 31];
  }
  return out;
}

/**
 * Build a real CIDv1 sha2-256 value from content, so tests exercise genuine
 * CIDs rather than strings that merely pass the regex. `codec` defaults to
 * dag-pb (0x70); pass 0x55 for the raw codec Pinata actually returns.
 */
function makeCid(content: string, codec = 0x70): { cid: string; sha256: string } {
  const digest = createHash('sha256').update(content).digest();
  const bytes = Buffer.concat([Buffer.from([0x01, codec, 0x12, 0x20]), digest]);
  return { cid: base32Encode(bytes), sha256: digest.toString('hex') };
}

describe('assertValidCid', () => {
  it('accepts a genuine dag-pb sha2-256 CID', () => {
    const { cid } = makeCid('hello world');
    expect(() => assertValidCid(cid)).not.toThrow();
  });

  it('returns the embedded digest', () => {
    const { cid, sha256 } = makeCid('hello world');
    const digest = assertValidCid(cid);
    expect(Buffer.from(digest).toString('hex')).toBe(sha256);
  });

  it('rejects empty and non-string values', () => {
    expect(() => assertValidCid('')).toThrow();
    expect(() => assertValidCid('123')).toThrow();
  });

  it('rejects non-base32 characters', () => {
    expect(() => assertValidCid('b!!!!invalid!!!!')).toThrow();
  });

  it('rejects truncated CIDs', () => {
    const { cid } = makeCid('hello world');
    expect(() => assertValidCid(cid.slice(0, 20))).toThrow();
  });

  it('rejects a CID carrying trailing bytes', () => {
    const digest = createHash('sha256').update('hello world').digest();
    const bytes = Buffer.concat([
      Buffer.from([0x01, 0x70, 0x12, 0x20]),
      digest,
      Buffer.from([0x00]),
    ]);
    expect(() => assertValidCid(base32Encode(bytes))).toThrow(/expected 36/);
  });

  it('accepts the raw-encoded CID Pinata returns for a file upload', () => {
    // Rejecting 0x55 was the defect: every upload pinned successfully, then
    // failed its own integrity check and answered 500.
    const { cid, sha256 } = makeCid('pinned-bytes', 0x55);
    expect(() => assertValidCid(cid)).not.toThrow();
    // For a raw CID the multihash digest is sha256 of the content itself.
    expect(Buffer.from(assertValidCid(cid)).toString('hex')).toBe(sha256);
  });

  it('accepts a CID a real deployment got back from Pinata', () => {
    const digest = assertValidCid(REAL_PINATA_CID);
    expect(digest).toHaveLength(32);
  });

  it('rejects a codec that does not represent the uploaded bytes', () => {
    // dag-cbor (0x71) is a real codec but never what a file pin returns.
    expect(() => assertValidCid(makeCid('x', 0x71).cid)).toThrow(/codec/);
  });

  it('rejects a CID whose digest length matches the string but not the multihash', () => {
    // Declares a 20-byte digest but carries 32 bytes: corrupt, not truncated.
    const digest = createHash('sha256').update('x').digest();
    const bytes = Buffer.concat([Buffer.from([0x01, 0x70, 0x12, 0x14]), digest]);
    expect(() => assertValidCid(base32Encode(bytes))).toThrow(/multihash/);
  });
});

describe('verifyPinnedContent', () => {
  it('proves a raw CID from its digest alone, without touching a gateway', async () => {
    // What Pinata actually returns. The digest in a raw CID is the sha256 of
    // the content, so the check is local: exact, instant, and immune to the
    // propagation delay that made the gateway path report false failures.
    const content = 'pinned-bytes';
    const { cid } = makeCid(content, 0x55);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyPinnedContent(cid, Buffer.from(content));

    expect(result.verified).toBe(true);
    expect(result.method).toBe('cid-digest');
    expect(result.attempts).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a raw CID whose digest is not the uploaded bytes', async () => {
    const { cid } = makeCid('what-was-pinned', 0x55);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await verifyPinnedContent(cid, Buffer.from('what-we-sent'));

    expect(result.verified).toBe(false);
    expect(result.method).toBe('cid-digest');
    expect(result.error).toMatch(/digest/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifies when the gateway serves identical bytes', async () => {
    const content = 'pinned-data';
    const { cid } = makeCid(content);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(content, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );
    const result = await verifyPinnedContent(cid, Buffer.from(content));
    expect(result.verified).toBe(true);
    expect(result.method).toBe('gateway');
  });

  it('reports a mismatch when the gateway serves different bytes', async () => {
    const { cid } = makeCid('original');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('tampered', { status: 200 })));
    const result = await verifyPinnedContent(cid, Buffer.from('original'));
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/digest/);
  });

  it('retries on 404 before giving up', async () => {
    const content = 'slow-propagation';
    const { cid } = makeCid(content);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValue(new Response(content, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await verifyPinnedContent(cid, Buffer.from(content));
    expect(result.verified).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports failure when the pin never propagates', async () => {
    const { cid } = makeCid('never-pinned');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
    const result = await verifyPinnedContent(cid, Buffer.from('never-pinned'), 2);
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/propagate/);
  });
});
