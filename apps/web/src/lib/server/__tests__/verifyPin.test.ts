import { describe, expect, it, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { assertValidCid, verifyPinnedContent } from '../verifyPin';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Build a real CIDv1 dag-pb sha2-256 value from content (same scheme the
 * verifier expects), so tests exercise genuine CIDs rather than strings
 * that merely pass the regex.
 */
function makeCid(content: string): { cid: string; sha256: string } {
  const digest = createHash('sha256').update(content).digest();
  // CIDv1: 0x01 version, 0x70 dag-pb, 0x12 sha2-256, 0x20 length(32), digest.
  const bytes = Buffer.concat([Buffer.from([0x01, 0x70, 0x12, 0x20]), digest]);
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
  return { cid: out, sha256: digest.toString('hex') };
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

  it('rejects a raw-encoded CID (different codec)', () => {
    // dag-raw codec is 0x55; a CID claiming it must be rejected.
    const digest = createHash('sha256').update('x').digest();
    const bytes = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]);
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
    if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
    expect(() => assertValidCid(out)).toThrow();
  });
});

describe('verifyPinnedContent', () => {
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
