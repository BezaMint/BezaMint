/**
 * Pinata CID integrity verification.
 *
 * After an upload Pinata returns a CID; before we hand that CID to users
 * we want confidence it actually refers to the bytes we sent. This module
 * provides:
 *
 *  1. `assertValidCid` — strict structural check that the returned string
 *     is a real CIDv1 (dag-pb, sha2-256, base32) rather than a truncated
 *     or corrupted value.
 *  2. `verifyPinnedContent` — best-effort round-trip: fetch the pinned
 *     object from the configured gateway and compare its sha256 to the
 *     uploaded bytes. Propagation can lag behind the upload response, so
 *     mismatches are reported, not thrown.
 */

import { createHash } from 'node:crypto';
import { logger } from './logger';
import { fetchWithTimeout } from './http';

// CIDv1 = 0x01, dag-pb codec = 0x70, sha2-256 multihash = 0x12, digest 32 bytes.
const EXPECTED_PREFIX = [0x01, 0x70, 0x12, 0x20];

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32Decode(input: string): number[] | null {
  // CIDv1 uses lowercase base32 without padding.
  const clean = input.replace(/=+$/, '');
  let buffer = 0;
  let bitsLeft = 0;
  const out: number[] = [];
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 5) | value;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      out.push((buffer >> bitsLeft) & 0xff);
    }
  }
  return out;
}

/**
 * Strictly validate that `cid` is a well-formed CIDv1 dag-pb sha2-256
 * string. Returns the 32-byte digest on success, throws otherwise.
 */
export function assertValidCid(cid: string): Uint8Array {
  if (typeof cid !== 'string' || cid.length === 0) {
    throw new Error('Pinata returned an empty CID');
  }
  if (!cid.startsWith('b')) {
    throw new Error(`Unexpected CID prefix: ${cid.slice(0, 4)}…`);
  }

  const bytes = base32Decode(cid.slice(1));
  if (!bytes) {
    throw new Error('CID is not valid base32');
  }
  if (bytes.length < EXPECTED_PREFIX.length + 32) {
    throw new Error('CID is too short to be a sha2-256 dag-pb CID');
  }
  for (let i = 0; i < EXPECTED_PREFIX.length; i++) {
    if (bytes[i] !== EXPECTED_PREFIX[i]) {
      throw new Error('CID does not match expected dag-pb sha2-256 encoding');
    }
  }

  return Uint8Array.from(bytes.slice(EXPECTED_PREFIX.length, EXPECTED_PREFIX.length + 32));
}

function sha256Hex(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export interface ContentVerification {
  verified: boolean;
  attempts: number;
  error?: string;
}

/**
 * Fetch the pinned object from the gateway and compare its digest to the
 * uploaded bytes. Best-effort: pinning can take a moment to propagate, so
 * a transient 404 is retried a couple of times and a persistent failure
 * is reported rather than thrown.
 */
export async function verifyPinnedContent(
  cid: string,
  uploadedBytes: Buffer | Uint8Array,
  maxAttempts = 3,
): Promise<ContentVerification> {
  const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'https://gateway.pinata.cloud';
  const expected = sha256Hex(uploadedBytes);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(`${gateway}/ipfs/${cid}`, {
        timeoutMs: 5_000,
        timeoutMessage: 'pin verification timed out',
      });
      if (response.status === 404) {
        // Not propagated yet; wait and retry.
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        continue;
      }
      if (!response.ok) {
        return {
          verified: false,
          attempts: attempt,
          error: `gateway responded ${response.status}`,
        };
      }
      const body = Buffer.from(await response.arrayBuffer());
      const actual = sha256Hex(body);
      if (actual !== expected) {
        logger.error('pin content mismatch', { cid, expected, actual });
        return {
          verified: false,
          attempts: attempt,
          error: 'pinned content digest does not match uploaded bytes',
        };
      }
      return { verified: true, attempts: attempt };
    } catch (err) {
      if (attempt === maxAttempts) {
        return {
          verified: false,
          attempts: attempt,
          error: err instanceof Error ? err.message : 'verification fetch failed',
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }

  return { verified: false, attempts: maxAttempts, error: 'pin did not propagate' };
}
