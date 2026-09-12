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
 *  2. `verifyPinnedContent` — does the CID refer to the bytes we sent? For a
 *     raw CID the multihash digest is the sha256 of the content, so this is a
 *     local comparison that cannot race propagation. dag-pb CIDs fall back to
 *     a gateway round trip, which is best-effort: mismatches are reported, not
 *     thrown, because propagation can lag behind the upload response.
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
import { getIpfsGateway } from '../ipfsGateway';

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

export interface ParsedCid {
  codec: number;
  digest: Uint8Array;
}

/**
 * Parse and validate a CIDv1 in base32 identifying a sha2-256 digest of a raw
 * or dag-pb object. Returns its codec and 32-byte digest, throws otherwise.
 */
function parseCid(cid: string): ParsedCid {
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

  return { codec, digest: Uint8Array.from(bytes.slice(4, CID_BYTES)) };
}

/**
 * Validate that `cid` is a well-formed CIDv1 in base32 identifying a sha2-256
 * digest of a raw or dag-pb object. Returns the 32-byte digest, throws
 * otherwise.
 */
export function assertValidCid(cid: string): Uint8Array {
  return parseCid(cid).digest;
}

function sha256Hex(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export interface ContentVerification {
  verified: boolean;
  attempts: number;
  /** How the check reached its answer; see `verifyPinnedContent`. */
  method: 'cid-digest' | 'gateway';
  error?: string;
}

/**
 * Verify that a pinned CID identifies exactly the bytes we uploaded.
 *
 * Two methods, and the first is the one that matters. For a raw CID the
 * multihash digest *is* the sha256 of the content, so comparing it to the
 * uploaded bytes is a local hash comparison: it proves the CID refers to these
 * bytes, trusts no gateway, costs nothing, and cannot race content
 * propagation. Pinata's file upload returns raw CIDs, so this is the normal
 * path.
 *
 * A dag-pb CID hashes a DAG node rather than the file, so its digest cannot be
 * compared directly; those fall back to fetching through the gateway.
 *
 * The gateway fallback is best-effort by design and reports rather than
 * throws, but it is a race: a freshly pinned object may not be fetchable from a
 * public gateway for seconds, and public gateways tend to hang rather than
 * answer 404, so an unreachable object burns the whole timeout on every
 * attempt. That is why it is not the primary check.
 */
export async function verifyPinnedContent(
  cid: string,
  uploadedBytes: Buffer | Uint8Array,
  maxAttempts = 3,
): Promise<ContentVerification> {
  const { codec, digest } = parseCid(cid);
  const expected = sha256Hex(uploadedBytes);

  if (codec === CODEC_RAW) {
    const fromCid = Buffer.from(digest).toString('hex');
    if (fromCid === expected) {
      return { verified: true, attempts: 0, method: 'cid-digest' };
    }
    logger.error('pinned CID digest does not match uploaded bytes', {
      cid,
      expected,
      fromCid,
    });
    return {
      verified: false,
      attempts: 0,
      method: 'cid-digest',
      error: 'CID digest does not match the uploaded bytes',
    };
  }

  const gateway = getIpfsGateway();

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
          method: 'gateway',
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
          method: 'gateway',
          error: 'pinned content digest does not match uploaded bytes',
        };
      }
      return { verified: true, attempts: attempt, method: 'gateway' };
    } catch (err) {
      if (attempt === maxAttempts) {
        return {
          verified: false,
          attempts: attempt,
          method: 'gateway',
          error: err instanceof Error ? err.message : 'verification fetch failed',
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }

  return {
    verified: false,
    attempts: maxAttempts,
    method: 'gateway',
    error: 'pin did not propagate',
  };
}
