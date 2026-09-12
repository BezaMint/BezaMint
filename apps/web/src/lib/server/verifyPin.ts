/**
 * Pinata CID integrity verification.
 *
 * After an upload Pinata returns a CID; before we hand that CID to users
 * we want confidence it actually refers to the bytes we sent. This module
 * provides:
 *
 *  1. `assertValidCid` — structural check that the returned string really is
 *     a CIDv1 in base32 whose multihash identifies a sha2-256 digest of the
 *     pinned object, rather than a truncated or corrupted value.
 *  2. `verifyPinnedContent` — best-effort round-trip: fetch the pinned
 *     object from the configured gateway and compare its sha256 to the
 *     uploaded bytes. Propagation can lag behind the upload response, so
 *     mismatches are reported, not thrown.
 *
 * Why the accepted codecs matter
 * ------------------------------
 * An earlier version accepted only dag-pb (0x70). Pinata's public file upload
 * returns *raw* (0x55) CIDs, so that check rejected the CID of every upload
 * that had in fact already been pinned — the pin succeeded, the response was a
 * 500, and the pinned bytes were orphaned on IPFS with no record pointing at
 * them. Nothing caught it because the upload routes return the `beza://`
 * fallback before reaching this check whenever PINATA_JWT is unset.
 */

import { createHash } from 'node:crypto';
import { logger } from './logger';
import { fetchWithTimeout } from './http';

// A CIDv1 in base32 decodes to a fixed 36 bytes for a sha2-256 dag-pb or raw
// object: 1 version + 1 codec + 1 multihash code + 1 digest length + 32 digest.
const CIDV1 = 0x01;
const MULTIHASH_SHA2_256 = 0x12;
const SHA2_256_LENGTH = 0x20;
const SHA2_256_DIGEST_BYTES = 32;
const CID_BYTES = 4 + SHA2_256_DIGEST_BYTES;

// Codecs that legitimately represent a file we just pinned:
//   0x55 raw    — what Pinata returns for a file upload. The digest *is* the
//                 sha256 of the file's bytes, so it is offline-checkable.
//   0x70 dag-pb — a UnixFS DAG, returned when the object was pinned as a DAG.
const CODEC_RAW = 0x55;
const CODEC_DAG_PB = 0x70;
const ACCEPTED_CODECS = new Set([CODEC_RAW, CODEC_DAG_PB]);

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
 * Validate that `cid` is a well-formed CIDv1 in base32 identifying a sha2-256
 * digest of a raw or dag-pb object. Returns the 32-byte digest, throws
 * otherwise.
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
  if (bytes.length !== CID_BYTES) {
    throw new Error(`CID is ${bytes.length} bytes, expected ${CID_BYTES} for a sha2-256 CIDv1`);
  }
  // The length check above makes these four defined; naming them keeps the
  // comparisons readable and satisfies noUncheckedIndexedAccess.
  const version = bytes[0] ?? 0;
  const codec = bytes[1] ?? 0;
  const multihashCode = bytes[2] ?? 0;
  const digestLength = bytes[3] ?? 0;

  if (version !== CIDV1) {
    throw new Error(`CID is version ${version}, expected 1`);
  }
  if (!ACCEPTED_CODECS.has(codec)) {
    throw new Error(
      `CID uses codec 0x${codec.toString(16)}, which does not represent the uploaded bytes`,
    );
  }
  if (multihashCode !== MULTIHASH_SHA2_256 || digestLength !== SHA2_256_LENGTH) {
    throw new Error('CID multihash is not a 32-byte sha2-256 digest');
  }

  return Uint8Array.from(bytes.slice(4, CID_BYTES));
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
